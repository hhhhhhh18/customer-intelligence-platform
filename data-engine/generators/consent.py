"""Append-only marketing consent history.

A consent decision is never overwritten: a withdrawal closes the previous
GRANTED record with `effectiveTo` and appends a new WITHDRAWN record.  The
current consent state for a (customer, channel, purpose) triple is therefore
always the record with `effectiveTo IS NULL`.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

import numpy as np
import pandas as pd

from config import Config

from .ids import consent_code

# channel, purpose, grant probability, withdrawal probability, source
CONSENT_MATRIX = [
    ("EMAIL", "MARKETING", 1.0, 0.09, "SIGNUP_FORM"),
    ("EMAIL", "TRANSACTIONAL", 1.0, 0.00, "SIGNUP_FORM"),
    ("PUSH", "MARKETING", 0.62, 0.03, "MOBILE_APP_SETTINGS"),
    ("SMS", "MARKETING", 0.41, 0.02, "SIGNUP_FORM"),
    ("DIRECT_MAIL", "MARKETING", 0.28, 0.01, "CUSTOMER_SERVICE"),
    ("EMAIL", "ANALYTICS", 0.78, 0.02, "COOKIE_BANNER"),
    ("EMAIL", "PROFILING", 0.55, 0.02, "SIGNUP_FORM"),
]


def generate_consents(cfg: Config, customers: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(cfg.seed + 401)
    ref = cfg.reference_date
    rows = []
    seq = 0

    for i in range(len(customers)):
        signup = customers["signupDateObj"].iloc[i]
        customer_id = int(customers["id"].iloc[i])
        tenure = max((ref - signup).days, 1)

        for channel, purpose, grant_p, withdraw_p, source in CONSENT_MATRIX:
            if rng.random() > grant_p:
                continue
            grant_at = datetime.combine(signup, time(0, 0)) + timedelta(hours=int(rng.integers(1, 48)))
            effective_to = None
            withdrawn_at = None
            withdraw = rng.random() < withdraw_p

            if withdraw:
                offset = int(rng.integers(30, max(tenure, 31)))
                withdrawal_date = min(
                    grant_at + timedelta(days=offset, hours=int(rng.integers(0, 23))),
                    datetime.combine(ref, time(23, 59)),
                )
                if withdrawal_date <= grant_at:
                    continue
                effective_to = withdrawal_date
                withdrawn_at = withdrawal_date

            seq += 1
            rows.append(
                {
                    "id": seq,
                    "consentCode": consent_code(seq),
                    "customerId": customer_id,
                    "channel": channel,
                    "purpose": purpose,
                    "status": "GRANTED",
                    "source": source,
                    "effectiveFrom": grant_at.isoformat(sep=" "),
                    "effectiveTo": effective_to.isoformat(sep=" ") if effective_to else None,
                    "withdrawnAt": None,
                    "recordedAt": grant_at.isoformat(sep=" "),
                    "notes": "Initial consent captured at signup." if source == "SIGNUP_FORM" else "Consent captured via preference centre.",
                }
            )

            if withdraw and withdrawn_at:
                seq += 1
                rows.append(
                    {
                        "id": seq,
                        "consentCode": consent_code(seq),
                        "customerId": customer_id,
                        "channel": channel,
                        "purpose": purpose,
                        "status": "WITHDRAWN",
                        "source": "PREFERENCE_CENTRE",
                        "effectiveFrom": withdrawn_at.isoformat(sep=" "),
                        "effectiveTo": None,
                        "withdrawnAt": withdrawn_at.isoformat(sep=" "),
                        "recordedAt": withdrawn_at.isoformat(sep=" "),
                        "notes": "Customer withdrew consent via preference centre; promotional outreach must stop.",
                    }
                )

    return pd.DataFrame(rows).sort_values(["customerId", "channel", "purpose", "effectiveFrom"]).reset_index(drop=True)

