"""Product taxonomy and product catalogue generation (deterministic)."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from .ids import category_code, product_code

# (name, parent_name, product name templates, price range in paise)
CATEGORY_TREE = [
    ("Electronics", None, [], (0, 0)),
    ("Audio", "Electronics", ["Wireless Earbuds", "Noise Cancelling Headphones", "Bluetooth Speaker", "Soundbar"], (199900, 2499900)),
    ("Mobile Accessories", "Electronics", ["Fast Charger", "Power Bank", "Phone Case", "USB-C Cable"], (49900, 399900)),
    ("Wearables", "Electronics", ["Fitness Band", "Smart Watch", "Sleep Tracker Ring"], (149900, 1899900)),
    ("Home & Living", None, [], (0, 0)),
    ("Kitchen", "Home & Living", ["Air Fryer", "Coffee Grinder", "Chef Knife Set", "Non-stick Pan"], (89900, 1299900)),
    ("Decor", "Home & Living", ["Table Lamp", "Wall Art Print", "Ceramic Vase", "Cushion Cover Set"], (39900, 599900)),
    ("Furniture", "Home & Living", ["Ergonomic Chair", "Study Desk", "Bookshelf", "Bedside Table"], (399900, 3499900)),
    ("Fashion", None, [], (0, 0)),
    ("Apparel", "Fashion", ["Cotton T-Shirt", "Linen Shirt", "Denim Jacket", "Chino Trousers", "Kurta Set"], (79900, 499900)),
    ("Footwear", "Fashion", ["Running Shoes", "Leather Loafers", "Canvas Sneakers", "Trail Sandals"], (129900, 899900)),
    ("Beauty", None, [], (0, 0)),
    ("Skincare", "Beauty", ["Vitamin C Serum", "Hydrating Moisturiser", "Clay Face Mask", "SPF 50 Sunscreen"], (39900, 349900)),
    ("Personal Care", "Beauty", ["Beard Trimmer", "Electric Toothbrush", "Hair Dryer"], (99900, 699900)),
    ("Sports", None, [], (0, 0)),
    ("Fitness", "Sports", ["Yoga Mat", "Adjustable Dumbbell", "Resistance Band Set", "Foam Roller"], (49900, 1499900)),
    ("Outdoor", "Sports", ["Camping Tent", "Trekking Backpack", "Insulated Bottle"], (89900, 1999900)),
]

BRANDS = ["Aurel", "Nimbus", "Kestrel", "Vantage", "Orbis", "Lumen", "Trace", "Forge"]
VARIANTS = ["", "Pro", "Lite", "Max", "Series 2", "Classic"]


def generate_categories() -> pd.DataFrame:
    rows = []
    name_to_id: dict[str, int] = {}
    for idx, (name, parent, _, _) in enumerate(CATEGORY_TREE, start=1):
        rows.append(
            {
                "id": idx,
                "code": category_code(idx),
                "name": name,
                "parentId": name_to_id.get(parent) if parent else None,
            }
        )
        name_to_id[name] = idx
    return pd.DataFrame(rows)


def generate_products(seed: int, reference: date, target: int = 60) -> pd.DataFrame:
    rng = np.random.default_rng(seed + 11)
    cats = generate_categories()
    leaf = cats[cats["parentId"].notna()]
    templates: list[tuple[int, str, int, int]] = []
    for _, cat in leaf.iterrows():
        for _, (name, parent, items, price_range) in enumerate(CATEGORY_TREE):
            if name == cat["name"]:
                for item in items:
                    templates.append((int(cat["id"]), item, price_range[0], price_range[1]))

    rows = []
    for i in range(target):
        cat_id, item, low, high = templates[i % len(templates)]
        if i >= len(templates):
            item = f"{item} {VARIANTS[(i // len(templates)) % len(VARIANTS)]}".strip()
        unit_price = int(rng.integers(low, high + 1) // 100 * 100)
        margin = float(rng.uniform(0.38, 0.62))
        rows.append(
            {
                "id": i + 1,
                "productCode": product_code(i + 1),
                "name": f"{BRANDS[int(rng.integers(0, len(BRANDS)))]} {item}",
                "categoryId": cat_id,
                "brand": BRANDS[i % len(BRANDS)],
                "unitPrice": f"{unit_price / 100:.2f}",
                "unitCost": f"{round(unit_price * (1 - margin)) / 100:.2f}",
                "isReturnable": bool(rng.random() > 0.08),
                "launchDate": (reference - timedelta(days=int(rng.integers(30, 1200)))).isoformat(),
                "isActive": bool(rng.random() > 0.1),
                "unitPricePaise": unit_price,
            }
        )
    return pd.DataFrame(rows)
