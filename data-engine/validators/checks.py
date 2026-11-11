"""Pre-load validation of generated datasets.

These checks run against the generated frames (before anything touches the
database) so a broken dataset never reaches PostgreSQL.  They are deliberately
strict: the only tolerated failures are the deliberately injected defects,
which are reported as `expectedAnomaly: true`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import pandas as pd

ID_PATTERNS = {
    "customer": re.compile(r"^CUS-\d{6}$"),
    "order": re.compile(r"^ORD-\d{4}-\d{6}$"),
    "product": re.compile(r"^PRD-\d{5}$"),
    "category": re.compile(r"^CAT-\d{3}$"),
    "case": re.compile(r"^CASE-\d{6}$"),
    "consent": re.compile(r"^CNS-\d{6}$"),
}

ORDER_STATUS = {"PENDING", "COMPLETED", "CANCELLED", "RETURNED", "PARTIALLY_RETURNED"}
CHANNELS = {"WEB", "MOBILE_APP", "STORE", "PHONE", "MARKETPLACE"}
CONSENT_STATUS = {"GRANTED", "WITHDRAWN", "PENDING", "EXPIRED"}
SUPPORT_STATUS = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "ESCALATED"}


@dataclass
class CheckResult:
    rule_id: str
    name: str
    severity: str
    passed: bool
    checked: int
    failures: int
    detail: str = ""
    samples: list[str] = field(default_factory=list)
    expected_anomaly: bool = False

    def as_dict(self) -> dict:
        return {
            "ruleId": self.rule_id,
            "name": self.name,
            "severity": self.severity,
            "passed": self.passed,
            "checked": self.checked,
            "failures": self.failures,
            "detail": self.detail,
            "samples": self.samples[:10],
            "expectedAnomaly": self.expected_anomaly,
        }


def _paise(series: pd.Series) -> pd.Series:
    return (series.astype(float) * 100).round().astype("int64")


def run_checks(data: dict[str, pd.DataFrame], known_return_anomaly_order: str | None = None) -> list[CheckResult]:
    customers = data["customers"]
    products = data["products"]
    orders = data["orders"]
    lines = data["order_lines"]
    events = data["engagement_events"]
    cases = data["support_cases"]
    consents = data["consents"]
    results: list[CheckResult] = []

    # ---- primary key uniqueness -----------------------------------------
    for name, frame in [("customers", customers), ("orders", orders), ("order_lines", lines),
                        ("engagement_events", events), ("products", products), ("support_cases", cases),
                        ("consents", consents)]:
        dup = int(frame["id"].duplicated().sum())
        results.append(CheckResult("DQ-PK-01", f"Primary key uniqueness ({name})", "CRITICAL",
                                   dup == 0, len(frame), dup))

    # ---- business identifier format --------------------------------------
    fmt_checks = [
        ("customers", customers, "customerCode", "customer"),
        ("orders", orders, "orderCode", "order"),
        ("products", products, "productCode", "product"),
        ("support_cases", cases, "caseCode", "case"),
        ("consents", consents, "consentCode", "consent"),
    ]
    for name, frame, col, kind in fmt_checks:
        pattern = ID_PATTERNS[kind]
        bad = frame[~frame[col].astype(str).str.match(pattern)]
        results.append(CheckResult("DQ-ID-01", f"ID format consistency ({name}.{col})", "HIGH",
                                   len(bad) == 0, len(frame), len(bad),
                                   samples=bad[col].astype(str).tolist()))

    dup_codes = int(customers["customerCode"].duplicated().sum())
    results.append(CheckResult("DQ-PK-02", "Unique business codes (customers)", "CRITICAL",
                               dup_codes == 0, len(customers), dup_codes))
    dup_emails = int(customers["email"].duplicated().sum())
    results.append(CheckResult("DQ-PK-03", "Unique customer email", "CRITICAL",
                               dup_emails == 0, len(customers), dup_emails))

    # ---- foreign keys ----------------------------------------------------
    cust_ids = set(customers["id"])
    prod_ids = set(products["id"])
    order_ids = set(orders["id"])

    fk_order_cust = int((~orders["customerId"].isin(cust_ids)).sum())
    results.append(CheckResult("DQ-FK-01", "orders.customerId -> customers.id", "CRITICAL",
                               fk_order_cust == 0, len(orders), fk_order_cust))
    fk_line_order = int((~lines["orderId"].isin(order_ids)).sum())
    results.append(CheckResult("DQ-FK-02", "order_lines.orderId -> orders.id", "CRITICAL",
                               fk_line_order == 0, len(lines), fk_line_order))
    fk_line_prod = int((~lines["productId"].isin(prod_ids)).sum())
    results.append(CheckResult("DQ-FK-03", "order_lines.productId -> products.id", "CRITICAL",
                               fk_line_prod == 0, len(lines), fk_line_prod))
    fk_event_cust = int((~events["customerId"].isin(cust_ids)).sum())
    results.append(CheckResult("DQ-FK-04", "engagement_events.customerId -> customers.id", "CRITICAL",
                               fk_event_cust == 0, len(events), fk_event_cust))
    fk_case_cust = int((~cases["customerId"].isin(cust_ids)).sum()) if len(cases) else 0
    results.append(CheckResult("DQ-FK-05", "support_cases.customerId -> customers.id", "CRITICAL",
                               fk_case_cust == 0, len(cases), fk_case_cust))
    fk_consent_cust = int((~consents["customerId"].isin(cust_ids)).sum())
    results.append(CheckResult("DQ-FK-06", "consents.customerId -> customers.id", "CRITICAL",
                               fk_consent_cust == 0, len(consents), fk_consent_cust))

    # ---- enum values -----------------------------------------------------
    bad_order_status = int((~orders["status"].isin(ORDER_STATUS)).sum())
    results.append(CheckResult("DQ-EN-01", "Allowed order status values", "HIGH",
                               bad_order_status == 0, len(orders), bad_order_status))
    bad_channel = int((~orders["channel"].isin(CHANNELS)).sum())
    results.append(CheckResult("DQ-EN-02", "Allowed sales channel values", "HIGH",
                               bad_channel == 0, len(orders), bad_channel))
    bad_consent = int((~consents["status"].isin(CONSENT_STATUS)).sum())
    results.append(CheckResult("DQ-EN-03", "Allowed consent status values", "HIGH",
                               bad_consent == 0, len(consents), bad_consent))
    bad_support = int((~cases["status"].isin(SUPPORT_STATUS)).sum()) if len(cases) else 0
    results.append(CheckResult("DQ-EN-04", "Allowed support case status values", "HIGH",
                               bad_support == 0, len(cases), bad_support))

    # ---- required fields ------------------------------------------------
    required = [
        ("customers", customers, ["customerCode", "firstName", "lastName", "email", "signupDate"]),
        ("orders", orders, ["orderCode", "customerId", "orderDate", "status", "grossTotal", "netTotal"]),
        ("order_lines", lines, ["orderId", "productId", "quantity", "lineTotal"]),
        ("consents", consents, ["customerId", "channel", "purpose", "status", "effectiveFrom"]),
    ]
    for name, frame, cols in required:
        nulls = int(frame[cols].isna().sum().sum())
        results.append(CheckResult("DQ-RQ-01", f"Required fields present ({name})", "CRITICAL",
                                   nulls == 0, len(frame) * len(cols), nulls))

    # ---- date ordering ---------------------------------------------------
    order_dates = pd.to_datetime(orders["orderDate"])
    ref_max = order_dates.max()
    future = int((order_dates > ref_max).sum())
    results.append(CheckResult("DQ-DT-01", "Order dates within reference window", "HIGH",
                               future == 0, len(orders), future))

    signup = customers.set_index("id")["signupDate"]
    joined = orders.assign(signup=orders["customerId"].map(signup))
    before_signup = int((pd.to_datetime(joined["orderDate"]) < pd.to_datetime(joined["signup"])).sum())
    results.append(CheckResult("DQ-DT-02", "Order date not before customer signup", "HIGH",
                               before_signup == 0, len(orders), before_signup))

    eff_from = pd.to_datetime(consents["effectiveFrom"])
    has_to = consents["effectiveTo"].notna()
    eff_to = pd.to_datetime(consents.loc[has_to, "effectiveTo"])
    bad_consent_dates = int((eff_to <= eff_from[has_to]).sum())
    results.append(CheckResult("DQ-DT-03", "Consent effectiveTo after effectiveFrom", "HIGH",
                               bad_consent_dates == 0, int(has_to.sum()), bad_consent_dates))

    # ---- order arithmetic (from line records) ----------------------------
    lines = lines.copy()
    lines["lineTotalPaise"] = _paise(lines["lineTotal"])
    lines["refundPaise"] = _paise(lines["refundAmount"])
    lines["qty"] = lines["quantity"].astype(int)
    line_sum = lines.groupby("orderId").agg(lineSubtotal=("lineTotalPaise", "sum"), refund=("refundPaise", "sum"))

    o = orders.set_index("id").copy()
    o["subtotalPaise"] = _paise(o["subtotal"])
    o["grossPaise"] = _paise(o["grossTotal"])
    o["netPaise"] = _paise(o["netTotal"])
    o["returnedPaise"] = _paise(o["returnedAmount"])
    o["shipPaise"] = _paise(o["shippingAmount"])
    o["taxPaise"] = _paise(o["taxAmount"])

    merged = o.join(line_sum, how="left").fillna(0).infer_objects(copy=False)
    arithmetic_fail = merged[merged["subtotalPaise"] != merged["lineSubtotal"]]
    results.append(CheckResult("DQ-AR-01", "Order subtotal equals sum of line totals", "CRITICAL",
                               len(arithmetic_fail) == 0, len(merged), len(arithmetic_fail),
                               samples=arithmetic_fail.index.astype(str).tolist()[:10]))

    gross_fail = merged[merged["grossPaise"] != merged["subtotalPaise"] + merged["shipPaise"] + merged["taxPaise"]]
    results.append(CheckResult("DQ-AR-02", "grossTotal = subtotal + shipping + tax", "CRITICAL",
                               len(gross_fail) == 0, len(merged), len(gross_fail),
                               samples=gross_fail.index.astype(str).tolist()[:10]))

    # return reconciliation: net must deduct refunds that exist on lines
    merged["expectedNet"] = merged["grossPaise"] - merged["refund"]
    recon_fail = merged[merged["netPaise"] != merged["expectedNet"]]
    recon_codes = orders.set_index("id").loc[recon_fail.index, "orderCode"] if len(recon_fail) else pd.Series(dtype=str)
    expected_only = len(recon_fail) == 1 and known_return_anomaly_order in set(recon_codes.astype(str))
    results.append(CheckResult("DQ-RC-01", "Return reconciliation (net total deducts refunds)", "CRITICAL", len(recon_fail) == 0, len(merged), len(recon_fail),
                               detail="Deliberately injected returns-not-netted anomaly" if expected_only else "",
                               samples=recon_codes.astype(str).tolist()[:10],
                               expected_anomaly=expected_only))

    # ---- engagement event sanity ----------------------------------------
    ev_codes = int(events["eventType"].isin([
        "SESSION_START", "PAGE_VIEW", "PRODUCT_VIEW", "SEARCH", "ADD_TO_CART", "CHECKOUT_START",
        "PURCHASE", "EMAIL_OPEN", "EMAIL_CLICK", "PUSH_OPEN", "SMS_CLICK", "APP_OPEN",
        "SUPPORT_VISIT", "UNSUBSCRIBE_CLICK",
    ]).value_counts().get(True, 0))
    results.append(CheckResult("DQ-EN-05", "Allowed engagement event types", "HIGH",
                               ev_codes == len(events), len(events), len(events) - ev_codes))

    # ---- consent lifecycle ----------------------------------------------
    current = consents[consents["effectiveTo"].isna()]
    dup_current = int(current.duplicated(subset=["customerId", "channel", "purpose"]).sum())
    results.append(CheckResult("DQ-CN-01", "Exactly one current consent record per customer/channel/purpose",
                               "CRITICAL", dup_current == 0, len(current), dup_current))
    withdrawn_without_ts = int(((consents["status"] == "WITHDRAWN") & consents["withdrawnAt"].isna()).sum())
    results.append(CheckResult("DQ-CN-02", "Withdrawn consent rows carry a withdrawal timestamp", "HIGH",
                               withdrawn_without_ts == 0, int((consents["status"] == "WITHDRAWN").sum()),
                               withdrawn_without_ts))

    # ---- duplicate transactional records --------------------------------
    dup_lines = int(lines.duplicated(subset=["orderId", "lineNumber"]).sum())
    results.append(CheckResult("DQ-DP-01", "Unique order line numbers per order", "HIGH",
                               dup_lines == 0, len(lines), dup_lines))

    return results


def summarize(results: list[CheckResult]) -> dict:
    failures = [r for r in results if not r.passed and not r.expected_anomaly]
    warnings = [r for r in results if not r.passed and r.expected_anomaly]
    return {
        "totalChecks": len(results),
        "passed": len([r for r in results if r.passed]),
        "failed": len(failures),
        "warnings": len(warnings),
        "expectedAnomalies": len(warnings),
        "score": round(100 * (len(results) - len(failures)) / max(len(results), 1), 2),
    }


