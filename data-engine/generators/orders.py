"""Order and order-line generation.

All monetary arithmetic is performed in integer paise and exported as fixed
2-decimal strings so that the database values and the generated files agree
exactly (no floating point drift, no rounding surprises in reconciliation).

Business model used here (also documented in docs/business-rules.md):
    lineTotal      = quantity * unitPrice - lineDiscount
    subtotal       = SUM(lineTotal)
    taxAmount      = round(subtotal * 0.18)
    grossTotal     = subtotal + shippingAmount + taxAmount
    refund         = per-line refund for returned quantity
    returnedAmount = SUM(refund)
    netTotal       = grossTotal - returnedAmount
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import ORDER_WEIGHTS, RECENCY_WINDOW, Config

from .ids import order_code


def _allocate_orders(customers: pd.DataFrame, total: int, rng: np.random.Generator) -> np.ndarray:
    weights = np.array([ORDER_WEIGHTS[a] for a in customers["archetype"]], dtype=float)
    # deterministic jitter so customers in the same archetype differ
    weights = weights * rng.uniform(0.65, 1.35, size=len(weights))
    weights = weights / weights.sum() * total
    counts = np.ones(len(weights), dtype=int)  # every customer purchased at least once
    remaining = total - len(weights)
    extra = np.floor(weights / weights.sum() * remaining).astype(int)
    leftover = remaining - int(extra.sum())
    if leftover > 0:
        fractional = (weights / weights.sum() * remaining) - extra
        order = np.argsort(-fractional, kind="stable")
        extra[order[:leftover]] += 1
    return counts + extra


def _last_order_gap(archetype: str, rng: np.random.Generator) -> int:
    lo, hi = RECENCY_WINDOW[archetype]
    return int(rng.integers(lo, hi + 1))


def generate_orders(
    cfg: Config, customers: pd.DataFrame, products: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(cfg.seed + 101)
    ref = cfg.reference_date
    counts = _allocate_orders(customers, cfg.order_count, rng)

    # Keep low-activity archetypes genuinely low-activity (a new customer does
    # not place nine orders).  Freed volume is redistributed to high-value
    # archetypes so the requested order total is still met exactly.
    arch = customers["archetype"].to_numpy()
    caps = {"NEW": 2, "LOST": 3, "HIBERNATING": 4, "POTENTIAL": 3}
    for name, cap in caps.items():
        mask = arch == name
        over = np.maximum(counts[mask] - cap, 0)
        counts[mask] -= over
    excess = cfg.order_count - int(counts.sum())
    if excess > 0:
        eligible = np.isin(arch, ["CHAMPION", "LOYAL", "CANT_LOSE", "HIGH_SERVICE"])
        weights = np.zeros(len(arch))
        weights[eligible] = np.array([ORDER_WEIGHTS[a] for a in arch[eligible]], dtype=float)
        weights = weights * rng.uniform(0.8, 1.2, size=len(arch))
        share = np.floor(weights / weights.sum() * excess).astype(int)
        leftover = excess - int(share.sum())
        if leftover > 0:
            order = np.argsort(-(weights / weights.sum() * excess - share), kind="stable")
            share[order[:leftover]] += 1
        counts += share

    product_ids = products["id"].to_numpy()
    product_prices = products["unitPricePaise"].to_numpy()
    # zipf-like popularity so the catalogue has clear best sellers
    popularity = 1.0 / np.arange(1, len(product_ids) + 1) ** 0.9
    popularity = popularity / popularity.sum()
    returnable = products["isReturnable"].to_numpy()

    draft: list[tuple[int, date, int]] = []
    customer_signup = customers["signupDateObj"].to_numpy()
    archetypes = customers["archetype"].to_numpy()
    returner = rng.random(len(customers)) < 0.22

    for idx in range(len(customers)):
        n_orders = int(counts[idx])
        arch = str(archetypes[idx])
        signup: date = customer_signup[idx]
        last_gap = _last_order_gap(arch, rng)
        last_date = ref - timedelta(days=last_gap)
        start = signup + timedelta(days=3)
        if start >= last_date:
            start = signup
        span = max((last_date - start).days, 1)
        shape = 0.85
        if arch in ("AT_RISK", "LOST", "HIBERNATING"):
            shape = 1.9  # purchases clustered early -> declining frequency
        elif arch in ("CHAMPION", "LOYAL"):
            shape = 0.6  # purchases clustered late -> healthy repeat buying
        u = np.sort(rng.random(n_orders) ** shape)
        dates = [start + timedelta(days=int(round(v * span))) for v in u]
        for d in dates:
            draft.append((int(customers["id"].iloc[idx]), min(d, ref), int(returner[idx])))

    draft.sort(key=lambda row: (row[1], row[0]))

    orders = []
    lines = []
    line_seq = 0
    for seq, (customer_id, order_date, is_returner) in enumerate(draft, start=1):
        n_lines = int(rng.choice([1, 2, 3, 4, 5], p=[0.34, 0.29, 0.19, 0.12, 0.06]))
        picks = rng.choice(product_ids, size=n_lines, replace=False, p=popularity)
        order_lines = []
        subtotal = 0
        for ln, pid in enumerate(picks, start=1):
            p_index = int(np.where(product_ids == pid)[0][0])
            unit_price = int(product_prices[p_index])
            qty = int(rng.choice([1, 2, 3], p=[0.72, 0.2, 0.08]))
            gross_line = unit_price * qty
            discount = 0
            if rng.random() < 0.18:
                discount = int(round(gross_line * float(rng.uniform(0.05, 0.2))))
            line_total = gross_line - discount
            subtotal += line_total
            line_seq += 1
            order_lines.append(
                {
                    "id": line_seq,
                    "lineNumber": ln,
                    "productId": int(pid),
                    "quantity": qty,
                    "unitPrice": unit_price,
                    "lineDiscount": discount,
                    "lineTotal": line_total,
                    "returnedQuantity": 0,
                    "refundAmount": 0,
                    "netLineTotal": line_total,
                    "isReturnable": bool(returnable[p_index]),
                }
            )

        shipping = 0 if subtotal >= 99900 else 4900
        tax = int(round(subtotal * 0.18))
        gross = subtotal + shipping + tax

        status = "COMPLETED"
        r = rng.random()
        if r < 0.020:
            status = "CANCELLED"
        elif r < 0.032:
            status = "PENDING"
        elif is_returner and r < 0.32:
            status = "PARTIALLY_RETURNED" if rng.random() > 0.28 else "RETURNED"

        returned_amount = 0
        if status in ("CANCELLED", "RETURNED"):
            for line in order_lines:
                line["returnedQuantity"] = line["quantity"]
                line["refundAmount"] = line["lineTotal"]
                line["netLineTotal"] = 0
                returned_amount += line["lineTotal"]
        elif status == "PARTIALLY_RETURNED":
            returnable_lines = [ln for ln in order_lines if ln["isReturnable"]]
            if returnable_lines:
                n_return = 1 if len(returnable_lines) == 1 else int(rng.integers(1, len(returnable_lines)))
                chosen = rng.choice(len(returnable_lines), size=n_return, replace=False)
                for pos in chosen:
                    line = returnable_lines[int(pos)]
                    refund_qty = int(rng.integers(1, line["quantity"] + 1))
                    per_unit = line["lineTotal"] // line["quantity"]
                    refund = per_unit * refund_qty
                    line["returnedQuantity"] = refund_qty
                    line["refundAmount"] = refund
                    line["netLineTotal"] = line["lineTotal"] - refund
                    returned_amount += refund
            else:
                status = "COMPLETED"

        net_total = gross - returned_amount
        orders.append(
            {
                "id": seq,
                "orderCode": order_code(seq),
                "customerId": customer_id,
                "orderDate": order_date.isoformat(),
                "status": status,
                "channel": str(rng.choice(["WEB", "MOBILE_APP", "STORE", "PHONE", "MARKETPLACE"], p=[0.44, 0.28, 0.1, 0.08, 0.1])),
                "currency": "INR",
                "subtotal": subtotal,
                "discountAmount": 0,
                "shippingAmount": shipping,
                "taxAmount": tax,
                "grossTotal": gross,
                "returnedAmount": returned_amount,
                "netTotal": net_total,
                "itemCount": sum(ln["quantity"] for ln in order_lines),
                "returnReason": None if returned_amount == 0 else str(rng.choice(["SIZE_ISSUE", "DAMAGED", "NOT_AS_DESCRIBED", "CHANGED_MIND"])),
                "campaignId": None,
            }
        )
        for line in order_lines:
            line["orderId"] = seq
            line["customerId"] = customer_id
            lines.append(line)

    orders_df = pd.DataFrame(orders)
    lines_df = pd.DataFrame(lines)

    money_cols = ["subtotal", "discountAmount", "shippingAmount", "taxAmount", "grossTotal", "returnedAmount", "netTotal"]
    for col in money_cols:
        orders_df[col] = orders_df[col].map(lambda v: f"{int(v) / 100:.2f}")
    for col in ["unitPrice", "lineDiscount", "lineTotal", "refundAmount", "netLineTotal"]:
        lines_df[col] = lines_df[col].map(lambda v: f"{int(v) / 100:.2f}")

    return orders_df, lines_df



