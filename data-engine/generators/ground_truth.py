"""Independent ground-truth computation.

The RFM expectations in this module are computed from the generated source
records with an implementation that is deliberately separate from the
TypeScript segmentation engine.  Comparing the two is a real cross-check of
the business rules, not a re-print of the engine's own output.

Ground-truth files are never read by the segmentation or recommendation
services; they are consumed by tests, validation and the evaluation report.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from config import Config

RFM_RULE_VERSION = "rfm-v1.0.0"
COMPLETED_STATUSES = {"COMPLETED", "PARTIALLY_RETURNED", "RETURNED"}

# Segment decision order.  First match wins; every rule is exclusive.
SEGMENT_PRIORITY = [
    "high-service-cost",
    "champions",
    "cannot-lose-them",
    "new-customers",
    "potential-loyalists",
    "loyal-customers",
    "at-risk-customers",
    "hibernating-customers",
    "lost-customers",
]

HIGH_SERVICE_COST_THRESHOLD_PAISE = 150_000  # INR 1,500 of support handling cost


def _quintile_scores(values: list[int], higher_is_better: bool) -> list[int]:
    """Quintile score 1..5 using rank(method='min') semantics.

    score = 5 - min(4, floor(rank_minus_one / n * 5))
    """
    n = len(values)
    if n == 0:
        return []
    arr = np.array(values, dtype=np.int64)
    uniq = np.unique(arr)
    scores = np.zeros(n, dtype=int)
    for v in uniq:
        if higher_is_better:
            better = int((arr > v).sum())
        else:
            better = int((arr < v).sum())
        pct = better / n
        score = 5 - min(4, int(pct * 5))
        scores[arr == v] = score
    return scores.tolist()


def _segment_for(r: int, f: int, m: int, service_cost_paise: int, open_cases: int, tenure_days: int, frequency: int) -> str:
    """Single-assignment decision tree.  Order matters; first match wins.

    Mirrors docs/business-rules.md (rule version rfm-v1.0.0) and is
    re-implemented independently in the TypeScript segmentation engine.
    """
    if service_cost_paise >= HIGH_SERVICE_COST_THRESHOLD_PAISE and open_cases >= 1:
        return "high-service-cost"
    if r >= 4 and f >= 4 and m >= 4:
        return "champions"
    if r <= 2 and f >= 4 and m >= 4:
        return "cannot-lose-them"
    if tenure_days <= 90 and frequency <= 2:
        return "new-customers"
    if r >= 4 and 2 <= frequency <= 4:
        return "potential-loyalists"
    if r >= 3 and f >= 3:
        return "loyal-customers"
    if r <= 2 and f >= 3:
        return "at-risk-customers"
    if r == 2 and f <= 2:
        return "hibernating-customers"
    return "lost-customers"


def compute_expected_segments(
    cfg: Config,
    customers: pd.DataFrame,
    orders: pd.DataFrame,
    order_lines: pd.DataFrame,
    support_cases: pd.DataFrame,
) -> pd.DataFrame:
    ref: date = cfg.reference_date

    orders = orders.copy()
    orders["orderDateObj"] = pd.to_datetime(orders["orderDate"]).dt.date
    orders["shippingPaise"] = (orders["shippingAmount"].astype(float) * 100).round().astype(np.int64)
    orders["taxPaise"] = (orders["taxAmount"].astype(float) * 100).round().astype(np.int64)
    orders["grossPaise"] = (orders["grossTotal"].astype(float) * 100).round().astype(np.int64)
    orders["returnedPaise"] = (orders["returnedAmount"].astype(float) * 100).round().astype(np.int64)

    lines = order_lines.copy()
    # Net line value is recomputed from source arithmetic, which is exactly how
    # the engine corrects a "returns not netted" header anomaly.
    lines["lineTotalPaise"] = (lines["lineTotal"].astype(float) * 100).round().astype(np.int64)
    lines["refundPaise"] = (lines["refundAmount"].astype(float) * 100).round().astype(np.int64)
    lines["netPaise"] = lines["lineTotalPaise"] - lines["refundPaise"]

    line_net = lines.groupby("orderId")["netPaise"].sum()
    orders["lineNetPaise"] = orders["id"].map(line_net).fillna(0).astype(np.int64)
    orders["orderNetPaise"] = orders["lineNetPaise"] + orders["shippingPaise"] + orders["taxPaise"]

    completed = orders[orders["status"].isin(COMPLETED_STATUSES)].copy()

    agg = completed.groupby("customerId").agg(
        frequency=("id", "count"),
        monetary=("orderNetPaise", "sum"),
        last_order=("orderDateObj", "max"),
    )

    cases = support_cases.copy()
    if len(cases):
        cases["handlingPaise"] = (cases["handlingCost"].astype(float) * 100).round().astype(np.int64)
        open_mask = cases["status"].isin(["OPEN", "IN_PROGRESS", "ESCALATED"])
        case_agg = cases.groupby("customerId").agg(
            serviceCost=("handlingPaise", "sum"),
            openCases=("status", lambda s: int(s.isin(["OPEN", "IN_PROGRESS", "ESCALATED"]).sum())),
        )
    else:
        open_mask = None
        case_agg = pd.DataFrame(columns=["serviceCost", "openCases"])

    rows = []
    for _, cust in customers.iterrows():
        cid = int(cust["id"])
        if cid in agg.index:
            freq = int(agg.at[cid, "frequency"])
            monetary = int(agg.at[cid, "monetary"])
            recency = (ref - agg.at[cid, "last_order"]).days
        else:
            freq, monetary, recency = 0, 0, 9999
        if cid in case_agg.index:
            service_cost = int(case_agg.at[cid, "serviceCost"])
            open_cases = int(case_agg.at[cid, "openCases"])
        else:
            service_cost, open_cases = 0, 0
        rows.append(
            {
                "customerId": cid,
                "customerCode": cust["customerCode"],
                "recencyDays": int(max(recency, 0)),
                "frequency": freq,
                "monetaryPaise": monetary,
                "serviceCostPaise": service_cost,
                "tenureDays": (ref - cust["signupDateObj"]).days,
                "openCases": open_cases,
            }
        )

    df = pd.DataFrame(rows)
    df["rScore"] = _quintile_scores(df["recencyDays"].tolist(), higher_is_better=False)
    df["fScore"] = _quintile_scores(df["frequency"].tolist(), higher_is_better=True)
    df["mScore"] = _quintile_scores(df["monetaryPaise"].tolist(), higher_is_better=True)
    df["rfmScore"] = df["rScore"] * 100 + df["fScore"] * 10 + df["mScore"]
    df["segmentSlug"] = [
        _segment_for(r, f, m, sc, oc, t, fr)
        for r, f, m, sc, oc, t, fr in zip(df["rScore"], df["fScore"], df["mScore"], df["serviceCostPaise"], df["openCases"], df["tenureDays"], df["frequency"])
    ]
    df["monetary"] = df["monetaryPaise"].map(lambda v: f"{int(v) / 100:.2f}")
    df["serviceCost"] = df["serviceCostPaise"].map(lambda v: f"{int(v) / 100:.2f}")
    df["ruleVersion"] = RFM_RULE_VERSION
    return df


def expected_net_spend(df: pd.DataFrame) -> pd.DataFrame:
    return df[["customerCode", "monetary", "recencyDays", "frequency"]].rename(
        columns={"monetary": "expectedNetSpend"}
    )




