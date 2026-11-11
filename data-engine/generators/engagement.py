"""Engagement event generation (web, app, email, push, SMS)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd

from config import ENGAGEMENT_WEIGHTS, Config

CHANNELS = ["WEB", "APP", "EMAIL", "PUSH", "SMS"]
CHANNEL_P = [0.55, 0.18, 0.19, 0.05, 0.03]

EVENT_BY_CHANNEL = {
    "WEB": (["PAGE_VIEW", "PRODUCT_VIEW", "SEARCH", "SESSION_START", "ADD_TO_CART", "CHECKOUT_START", "PURCHASE", "SUPPORT_VISIT"],
            [0.52, 0.22, 0.08, 0.08, 0.05, 0.02, 0.015, 0.015]),
    "APP": (["APP_OPEN", "PAGE_VIEW", "PRODUCT_VIEW", "ADD_TO_CART", "CHECKOUT_START"],
            [0.42, 0.33, 0.17, 0.05, 0.03]),
    "EMAIL": (["EMAIL_OPEN", "EMAIL_CLICK", "UNSUBSCRIBE_CLICK"], [0.70, 0.26, 0.04]),
    "PUSH": (["PUSH_OPEN", "APP_OPEN"], [0.8, 0.2]),
    "SMS": (["SMS_CLICK"], [1.0]),
}

PAGE_PATHS = ["/", "/products", "/products/detail", "/cart", "/checkout", "/account", "/support", "/blog/guide"]
DEVICES = ["desktop", "mobile", "tablet"]
CAMPAIGNS = ["CMP-2026-Q1", "CMP-2026-Q2", "CMP-2026-Q3", "CMP-WINBACK", "CMP-LOYALTY"]


def _allocate_events(customers: pd.DataFrame, total: int, rng: np.random.Generator) -> np.ndarray:
    weights = np.array([ENGAGEMENT_WEIGHTS[a] for a in customers["archetype"]], dtype=float)
    weights = weights * rng.uniform(0.55, 1.45, size=len(weights))
    raw = weights / weights.sum() * total
    counts = np.floor(raw).astype(int)
    leftover = total - int(counts.sum())
    if leftover > 0:
        order = np.argsort(-(raw - counts), kind="stable")
        counts[order[:leftover]] += 1
    return counts


def generate_events(cfg: Config, customers: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(cfg.seed + 211)
    ref = cfg.reference_date
    counts = _allocate_events(customers, cfg.event_count, rng)

    ids = customers["id"].to_numpy()
    signup_ord = np.array([d.toordinal() for d in customers["signupDateObj"]])
    arche = customers["archetype"].to_numpy()
    ref_ord = ref.toordinal()

    cust_col = np.repeat(ids, counts)
    signup_col = np.repeat(signup_ord, counts)
    arche_col = np.repeat(arche, counts)
    n = len(cust_col)

    shape_map = {"CHAMPION": 0.55, "LOYAL": 0.7, "POTENTIAL": 0.7, "NEW": 0.8, "AT_RISK": 1.6,
                 "CANT_LOSE": 1.4, "HIBERNATING": 2.0, "LOST": 2.2, "HIGH_SERVICE": 0.9}
    shape = np.vectorize(shape_map.get)(arche_col).astype(float)

    span = np.maximum(ref_ord - signup_col, 1)
    u = rng.random(n) ** shape
    day_offsets = np.floor(u * span).astype(int)
    ordinals = np.minimum(signup_col + day_offsets, ref_ord)

    seconds = rng.integers(6 * 3600, 23 * 3600, size=n)
    base_dates = np.array([date.fromordinal(int(o)) for o in ordinals], dtype=object)
    timestamps = [datetime.combine(d, time()) + timedelta(seconds=int(s)) for d, s in zip(base_dates, seconds)]

    channels = rng.choice(CHANNELS, size=n, p=CHANNEL_P)
    event_types = np.empty(n, dtype=object)
    for ch in CHANNELS:
        mask = channels == ch
        types, probs = EVENT_BY_CHANNEL[ch]
        event_types[mask] = rng.choice(types, size=int(mask.sum()), p=probs)

    page_paths = rng.choice(PAGE_PATHS, size=n)
    devices = rng.choice(DEVICES, size=n, p=[0.55, 0.38, 0.07])
    campaigns = rng.choice(CAMPAIGNS + [None], size=n, p=[0.06, 0.06, 0.06, 0.05, 0.05, 0.72])
    session_ids = np.array([f"S{cid}-{i % 9973}" for i, cid in enumerate(cust_col)])

    df = pd.DataFrame(
        {
            "id": np.arange(1, n + 1, dtype=np.int64),
            "customerId": cust_col,
            "eventType": event_types,
            "channel": channels,
            "sessionId": session_ids,
            "occurredAt": [t.isoformat(sep=" ") for t in timestamps],
            "pagePath": np.where(np.isin(channels, ["WEB", "APP"]), page_paths, None),
            "deviceType": np.where(channels == "APP", "mobile", np.where(channels == "WEB", devices, None)),
            "campaignId": np.where(np.isin(channels, ["EMAIL", "PUSH", "SMS"]), campaigns, None),
        }
    )
    return df.sort_values("occurredAt", kind="stable").reset_index(drop=True)
