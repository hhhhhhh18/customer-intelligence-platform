"""Labelled anomaly injection.

Four mandatory negative scenarios are required by the brief.  Two of them are
pure data defects and are injected here (return not netted, plus the selection
of targets for the other cases).  Two of them are integration defects that can
only exist after segmentation/recommendation/outcome records exist, so this
module writes an *injection manifest* with the exact target identifiers and
the backend applies them deterministically.

Nothing in the generated source tables carries a hidden "this is fake" flag:
detection must rely on the same validation rules that would run in production.
The labels live only in ground_truth/.
"""

from __future__ import annotations

import pandas as pd

from config import Config

CASE_IDS = {
    "case1": "GT-SEG-CONFLICT-001",
    "case2": "GT-CONSENT-VIOLATION-001",
    "case3": "GT-RETURN-NOT-NETTED-001",
    "case4": "GT-OUTCOME-ATTRIBUTION-001",
}


def inject_return_anomaly(
    orders: pd.DataFrame, order_lines: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, dict | None]:
    """Corrupt one order header so returned units are not deducted.

    The line records keep their refunds (the returns were physically processed);
    only the order aggregate is wrong, which is exactly how this defect appears
    in real order systems after a partial-refund integration failure.
    """
    orders = orders.copy()
    candidates = orders[(orders["status"] == "PARTIALLY_RETURNED")].sort_values("orderCode")
    if candidates.empty:
        return orders, order_lines, None

    target_index = 6 if len(candidates) > 6 else 0
    target = candidates.iloc[target_index]
    order_id = int(target["id"])

    lines = order_lines[order_lines["orderId"] == order_id]
    refund_paise = int(round(float(lines["refundAmount"].astype(float).sum()) * 100))
    gross_paise = int(round(float(target["grossTotal"]) * 100))
    expected_net_paise = gross_paise - refund_paise

    orders.loc[orders["id"] == order_id, "returnedAmount"] = "0.00"
    orders.loc[orders["id"] == order_id, "netTotal"] = f"{gross_paise / 100:.2f}"

    detail = {
        "anomalyId": CASE_IDS["case3"],
        "orderId": order_id,
        "orderCode": str(target["orderCode"]),
        "customerId": int(target["customerId"]),
        "expectedReturnedAmount": f"{refund_paise / 100:.2f}",
        "actualReturnedAmount": "0.00",
        "expectedNetTotal": f"{expected_net_paise / 100:.2f}",
        "actualNetTotal": f"{gross_paise / 100:.2f}",
        "affectedLines": int(len(lines)),
        "explanation": (
            "Refunds exist on the order lines but the order header has returnedAmount = 0 and "
            "netTotal = grossTotal, so returned goods were not deducted from spend."
        ),
        "injection": "Order header returnedAmount/netTotal overwritten after line refunds were written.",
    }
    return orders, order_lines, detail


def build_manifest(
    cfg: Config,
    customers: pd.DataFrame,
    consents: pd.DataFrame,
    expected: pd.DataFrame,
    return_detail: dict | None,
) -> dict:
    # ---- CASE 1: conflicting exclusive segments -------------------------
    loyal = expected[expected["segmentSlug"] == "loyal-customers"].sort_values("customerCode")
    champion = expected[expected["segmentSlug"] == "champions"].sort_values("customerCode")
    if len(loyal):
        c1 = loyal.iloc[min(3, len(loyal) - 1)]
        secondary = "champions"
    elif len(champion):
        c1 = champion.iloc[0]
        secondary = "loyal-customers"
    else:
        c1 = expected.sort_values("customerCode").iloc[0]
        secondary = "champions"

    case1 = {
        "anomalyId": CASE_IDS["case1"],
        "customerId": int(c1["customerId"]),
        "customerCode": str(c1["customerCode"]),
        "primarySegmentSlug": str(c1["segmentSlug"]),
        "secondarySegmentSlug": secondary,
        "explanation": (
            "A legacy import wrote a second ACTIVE membership for an exclusive segment. "
            "A customer may hold at most one active exclusive segment, so the pair is invalid."
        ),
        "injection": "Second ACTIVE SegmentMembership row inserted with ruleVersion legacy-import-v0.",
    }

    # ---- CASE 2: promotional action for withdrawn consent ---------------
    withdrawn = consents[
        (consents["purpose"] == "MARKETING")
        & (consents["channel"] == "EMAIL")
        & (consents["status"] == "WITHDRAWN")
        & (consents["effectiveTo"].isna())
    ].sort_values("customerId")
    if withdrawn.empty:
        # fall back to any marketing channel withdrawal
        withdrawn = consents[
            (consents["purpose"] == "MARKETING") & (consents["status"] == "WITHDRAWN") & (consents["effectiveTo"].isna())
        ].sort_values("customerId")

    c2 = withdrawn.iloc[0] if len(withdrawn) else None
    case2 = {
        "anomalyId": CASE_IDS["case2"],
        "customerId": int(c2["customerId"]) if c2 is not None else None,
        "consentCode": str(c2["consentCode"]) if c2 is not None else None,
        "channel": str(c2["channel"]) if c2 is not None else "EMAIL",
        "withdrawnAt": str(c2["withdrawnAt"]) if c2 is not None else None,
        "actionSlug": "promotional-discount",
        "explanation": (
            "A legacy campaign service emitted an ELIGIBLE promotional recommendation for a customer "
            "whose marketing consent was withdrawn. Consent must be enforced before eligibility."
        ),
        "injection": "Recommendation row inserted with sourcePipeline=legacy-campaign-service-v0 and eligibility=ELIGIBLE.",
    }

    # ---- CASE 4: outcome attributed to the wrong action ------------------
    case4 = {
        "anomalyId": CASE_IDS["case4"],
        "targetOutcomeOrdinal": 1,
        "explanation": (
            "A downstream CRM webhook recorded an outcome against an action that does not match the "
            "action of the referenced recommendation, so the revenue cannot be attributed to the recommendation."
        ),
        "injection": "Outcome row written with an actionId that differs from recommendation.actionId.",
    }

    return {
        "case1_segment_conflict": case1,
        "case2_consent_violation": case2,
        "case3_return_not_netted": return_detail,
        "case4_outcome_attribution": case4,
    }
