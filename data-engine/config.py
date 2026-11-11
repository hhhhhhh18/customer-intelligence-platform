"""Central configuration for the synthetic data engine.

Everything that influences the produced dataset lives here so that a run is
fully described by (profile, seed, reference_date).  Monetary values are kept
in integer paise internally and exported as fixed 2-decimal strings, which
removes any floating point drift from the generated files.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
EXPORT_DIR = BASE_DIR / "exports"
GROUND_TRUTH_DIR = BASE_DIR / "ground_truth"

DEFAULT_SEED = 20261022
DEFAULT_REFERENCE_DATE = date(2026, 11, 1)

# profile -> (customers, orders, engagement_events)
PROFILES: dict[str, tuple[int, int, int]] = {
    "small": (500, 2_000, 10_000),
    "medium": (5_000, 20_000, 100_000),
    "full": (50_000, 200_000, 1_000_000),
}

# Customer behaviour archetypes.  Weights must sum to 1.0.
ARCHETYPES: dict[str, float] = {
    "CHAMPION": 0.12,
    "LOYAL": 0.18,
    "POTENTIAL": 0.15,
    "NEW": 0.12,
    "AT_RISK": 0.10,
    "CANT_LOSE": 0.06,
    "HIBERNATING": 0.09,
    "LOST": 0.10,
    "HIGH_SERVICE": 0.08,
}

# Average orders per customer by archetype.  Used as weights for the exact
# allocation of the requested order total.
ORDER_WEIGHTS: dict[str, float] = {
    "CHAMPION": 12.0,
    "LOYAL": 6.0,
    "POTENTIAL": 2.5,
    "NEW": 1.4,
    "AT_RISK": 3.0,
    "CANT_LOSE": 9.0,
    "HIBERNATING": 2.0,
    "LOST": 1.5,
    "HIGH_SERVICE": 3.5,
}

# Engagement volume weights per archetype.
ENGAGEMENT_WEIGHTS: dict[str, float] = {
    "CHAMPION": 3.2,
    "LOYAL": 2.0,
    "POTENTIAL": 1.3,
    "NEW": 1.1,
    "AT_RISK": 0.9,
    "CANT_LOSE": 1.4,
    "HIBERNATING": 0.4,
    "LOST": 0.25,
    "HIGH_SERVICE": 1.2,
}

# Days since last order: (min, max) by archetype.
RECENCY_WINDOW: dict[str, tuple[int, int]] = {
    "CHAMPION": (0, 25),
    "LOYAL": (1, 55),
    "POTENTIAL": (2, 40),
    "NEW": (0, 20),
    "AT_RISK": (70, 150),
    "CANT_LOSE": (60, 130),
    "HIBERNATING": (130, 240),
    "LOST": (250, 420),
    "HIGH_SERVICE": (5, 120),
}

# Tenure window in days (signup -> reference date).
TENURE_WINDOW: dict[str, tuple[int, int]] = {
    "CHAMPION": (400, 1050),
    "LOYAL": (300, 900),
    "POTENTIAL": (110, 320),
    "NEW": (10, 60),
    "AT_RISK": (330, 900),
    "CANT_LOSE": (520, 1000),
    "HIBERNATING": (300, 800),
    "LOST": (420, 1000),
    "HIGH_SERVICE": (250, 900),
}

SUPPORT_CASE_COUNT: dict[str, tuple[int, int]] = {
    "CHAMPION": (0, 1),
    "LOYAL": (0, 2),
    "POTENTIAL": (0, 1),
    "NEW": (0, 0),
    "AT_RISK": (0, 2),
    "CANT_LOSE": (1, 2),
    "HIBERNATING": (0, 1),
    "LOST": (0, 1),
    "HIGH_SERVICE": (4, 9),
}

MARKETING_WITHDRAWAL_RATE = 0.09


@dataclass
class Config:
    profile: str = "small"
    seed: int = DEFAULT_SEED
    reference_date: date = DEFAULT_REFERENCE_DATE
    customer_count: int = 0
    order_count: int = 0
    event_count: int = 0
    batch_size: int = 5_000
    export_dir: Path = field(default=EXPORT_DIR)
    ground_truth_dir: Path = field(default=GROUND_TRUTH_DIR)

    def __post_init__(self) -> None:
        if self.profile not in PROFILES:
            raise ValueError(f"Unknown profile '{self.profile}'. Choose from {sorted(PROFILES)}")
        customers, orders, events = PROFILES[self.profile]
        self.customer_count = self.customer_count or customers
        self.order_count = self.order_count or orders
        self.event_count = self.event_count or events
        self.export_dir.mkdir(parents=True, exist_ok=True)
        self.ground_truth_dir.mkdir(parents=True, exist_ok=True)


def load_config(profile: str | None = None, seed: int | None = None) -> Config:
    profile = profile or os.getenv("DATA_PROFILE", "small")
    seed = seed if seed is not None else int(os.getenv("DATA_SEED", DEFAULT_SEED))
    ref_raw = os.getenv("DATA_REFERENCE_DATE", "")
    reference = date.fromisoformat(ref_raw) if ref_raw else DEFAULT_REFERENCE_DATE
    return Config(profile=profile, seed=seed, reference_date=reference)

