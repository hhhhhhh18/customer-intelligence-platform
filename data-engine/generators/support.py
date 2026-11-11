"""Support case generation, including high-service-cost customers with
unresolved escalations (a required behaviour archetype)."""

from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd

from config import SUPPORT_CASE_COUNT, Config

from .ids import case_code

SUBJECTS = {
    "DELIVERY": ["Order not delivered", "Delivery delayed", "Wrong address delivery", "Courier marked delivered but missing"],
    "BILLING": ["Double charged", "Refund not received", "Invoice mismatch", "Payment failed but order placed"],
    "PRODUCT_QUALITY": ["Item damaged on arrival", "Product stopped working", "Quality below expectation"],
    "RETURNS": ["Return pickup not scheduled", "Return rejected incorrectly", "Exchange request pending"],
    "ACCOUNT": ["Unable to reset password", "Account locked", "Address book not saving"],
    "TECHNICAL": ["App crashes at checkout", "Website payment error", "Push notifications not arriving"],
    "OTHER": ["General enquiry", "Warranty question", "Feedback"],
}
CATEGORY_P = [0.27, 0.21, 0.19, 0.14, 0.07, 0.09, 0.03]
CATEGORIES = list(SUBJECTS.keys())


def generate_support_cases(cfg: Config, customers: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(cfg.seed + 307)
    ref = cfg.reference_date
    rows = []
    seq = 0
    for i in range(len(customers)):
        arch = customers["archetype"].iloc[i]
        lo, hi = SUPPORT_CASE_COUNT[arch]
        count = int(rng.integers(lo, hi + 1)) if hi > 0 else 0
        for _ in range(count):
            seq += 1
            open_days_ago = int(rng.integers(3, 360))
            opened = ref - timedelta(days=open_days_ago)
            category = str(rng.choice(CATEGORIES, p=CATEGORY_P))

            is_high_service = arch == "HIGH_SERVICE"
            # High-service customers carry a disproportionate share of
            # unresolved and escalated cases.
            if is_high_service:
                r = rng.random()
                status = "ESCALATED" if r < 0.42 else ("OPEN" if r < 0.62 else ("IN_PROGRESS" if r < 0.78 else "RESOLVED"))
                priority = str(rng.choice(["HIGH", "URGENT", "MEDIUM"], p=[0.45, 0.35, 0.2]))
                handling = int(rng.integers(180000, 650000))
            else:
                r = rng.random()
                status = "RESOLVED" if r < 0.62 else ("CLOSED" if r < 0.84 else ("IN_PROGRESS" if r < 0.92 else "OPEN"))
                priority = str(rng.choice(["LOW", "MEDIUM", "HIGH", "URGENT"], p=[0.3, 0.45, 0.2, 0.05]))
                handling = int(rng.integers(15000, 180000))

            if status in ("RESOLVED", "CLOSED"):
                closed = opened + timedelta(days=int(rng.integers(0, 21)), hours=int(rng.integers(1, 20)))
                closed_at = min(closed, ref)
            else:
                closed_at = None

            satisfaction = None
            if status in ("RESOLVED", "CLOSED") and rng.random() < 0.55:
                satisfaction = int(rng.integers(1, 6)) if is_high_service else int(rng.integers(2, 6))

            rows.append(
                {
                    "id": seq,
                    "caseCode": case_code(seq),
                    "customerId": int(customers["id"].iloc[i]),
                    "openedAt": f"{opened.isoformat()} 10:00:00",
                    "closedAt": f"{closed_at.isoformat()} 16:30:00" if closed_at else None,
                    "status": status,
                    "priority": priority,
                    "category": category,
                    "channel": str(rng.choice(["EMAIL", "PHONE", "WEB", "APP"], p=[0.42, 0.23, 0.2, 0.15])),
                    "subject": str(rng.choice(SUBJECTS[category])),
                    "isEscalated": status == "ESCALATED",
                    "handlingCost": f"{handling / 100:.2f}",
                    "satisfactionScore": satisfaction,
                    "resolutionNotes": None,
                }
            )
    return pd.DataFrame(rows)

