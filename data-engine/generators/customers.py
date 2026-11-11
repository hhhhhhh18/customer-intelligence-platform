"""Customer master data generation with behaviour archetypes.

Archetypes are an internal generation device only.  They are written to the
ground-truth folder for evaluation and are never exposed to the segmentation
or recommendation engines.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import ARCHETYPES, TENURE_WINDOW, Config

from .ids import customer_code

FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan",
    "Ananya", "Diya", "Aadhya", "Saanvi", "Pari", "Anika", "Navya", "Meera", "Riya", "Kavya",
    "John", "Emily", "Michael", "Sarah", "David", "Laura", "Daniel", "Chloe", "James", "Olivia",
    "Aisha", "Omar", "Fatima", "Yusuf", "Layla", "Hassan", "Noor", "Zara", "Imran", "Sana",
]
LAST_NAMES = [
    "Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Gupta", "Mehta", "Singh", "Kulkarni",
    "Smith", "Johnson", "Brown", "Wilson", "Taylor", "Davies", "Clark", "Lewis", "Walker", "Hall",
    "Khan", "Ahmed", "Ali", "Hussain", "Rahman", "Siddiqui", "Farooq", "Malik", "Chowdhury", "Das",
]
LOCATIONS = [
    ("India", "Mumbai", "Maharashtra"),
    ("India", "Bengaluru", "Karnataka"),
    ("India", "Delhi", "Delhi"),
    ("India", "Hyderabad", "Telangana"),
    ("India", "Chennai", "Tamil Nadu"),
    ("India", "Pune", "Maharashtra"),
    ("India", "Kolkata", "West Bengal"),
    ("India", "Ahmedabad", "Gujarat"),
    ("United States", "Austin", "Texas"),
    ("United States", "Seattle", "Washington"),
    ("United Kingdom", "London", "Greater London"),
    ("United Arab Emirates", "Dubai", "Dubai"),
    ("Singapore", "Singapore", "Singapore"),
]
ACQUISITION = ["ORGANIC_SEARCH", "PAID_SOCIAL", "REFERRAL", "EMAIL_CAMPAIGN", "MARKETPLACE", "OFFLINE_EVENT"]
DOMAINS = ["example.com", "mail.example.com", "samplemail.io", "demo-crm.net"]
PREFERRED_CHANNELS = ["EMAIL", "SMS", "PUSH", "PHONE"]


def _largest_remainder(weights: np.ndarray, total: int) -> np.ndarray:
    """Allocate `total` integer units proportionally, deterministically."""
    weights = np.asarray(weights, dtype=float)
    raw = weights / weights.sum() * total
    base = np.floor(raw).astype(int)
    remainder = total - int(base.sum())
    if remainder > 0:
        order = np.argsort(-(raw - base), kind="stable")
        base[order[:remainder]] += 1
    return base


def generate_customers(cfg: Config) -> pd.DataFrame:
    rng = np.random.default_rng(cfg.seed)
    n = cfg.customer_count
    names = list(ARCHETYPES.keys())
    weights = np.array([ARCHETYPES[k] for k in names])

    archetype_counts = _largest_remainder(weights * n, n)
    labels: list[str] = []
    for name, count in zip(names, archetype_counts):
        labels.extend([name] * int(count))
    labels = [labels[i] for i in rng.permutation(len(labels))]

    rows = []
    for i in range(n):
        arch = labels[i]
        first = FIRST_NAMES[int(rng.integers(0, len(FIRST_NAMES)))]
        last = LAST_NAMES[int(rng.integers(0, len(LAST_NAMES)))]
        country, city, region = LOCATIONS[int(rng.integers(0, len(LOCATIONS)))]
        lo, hi = TENURE_WINDOW[arch]
        tenure = int(rng.integers(lo, hi + 1))
        signup = cfg.reference_date - timedelta(days=tenure)
        birth = date(1965, 1, 1) + timedelta(days=int(rng.integers(0, 12000)))

        rows.append(
            {
                "id": i + 1,
                "customerCode": customer_code(i + 1),
                "firstName": first,
                "lastName": last,
                "email": f"{first.lower()}.{last.lower()}.{i + 1}@{DOMAINS[i % len(DOMAINS)]}",
                "phone": f"+91-9{int(rng.integers(100000000, 999999999))}",
                "country": country,
                "city": city,
                "region": region,
                "signupDate": signup.isoformat(),
                "birthDate": birth.isoformat(),
                "lifecycle": "ACTIVE",
                "acquisition": ACQUISITION[int(rng.integers(0, len(ACQUISITION)))],
                "loyaltyTier": None,
                "preferredChannel": PREFERRED_CHANNELS[int(rng.integers(0, len(PREFERRED_CHANNELS)))],
                "archetype": arch,
                "signupDateObj": signup,
            }
        )

    df = pd.DataFrame(rows)

    # Lifecycle as maintained by the CRM (not an RFM output).
    df.loc[df["archetype"].isin(["NEW", "POTENTIAL", "CHAMPION", "LOYAL", "HIGH_SERVICE"]), "lifecycle"] = "ACTIVE"
    df.loc[df["archetype"] == "HIBERNATING", "lifecycle"] = "DORMANT"
    df.loc[df["archetype"].isin(["LOST", "AT_RISK"]), "lifecycle"] = "DORMANT"
    df.loc[df["archetype"] == "LOST", "lifecycle"] = "CHURNED"

    return df
