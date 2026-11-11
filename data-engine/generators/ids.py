"""Deterministic, immutable, zero-padded business identifier helpers.

Every identifier is derived from a monotonic sequence number so that a dataset
generated twice with the same seed produces byte-identical identifiers.
"""

from __future__ import annotations


def customer_code(n: int) -> str:
    return f"CUS-{n:06d}"


def product_code(n: int) -> str:
    return f"PRD-{n:05d}"


def category_code(n: int) -> str:
    return f"CAT-{n:03d}"


def order_code(n: int) -> str:
    return f"ORD-2026-{n:06d}"


def case_code(n: int) -> str:
    return f"CASE-{n:06d}"


def consent_code(n: int) -> str:
    return f"CNS-{n:06d}"


def segment_code(n: int) -> str:
    return f"SEG-2026-{n:06d}"


def action_code(n: int) -> str:
    return f"ACTN-2026-{n:06d}"


def membership_code(segment_code_value: str, customer_code_value: str) -> str:
    # MEM-<segment-id>-<customer-id>, the segment id is already prefixed (SEG-...)
    return f"MEM-{segment_code_value}-{customer_code_value}"


def recommendation_code(n: int) -> str:
    return f"REC-2026-{n:06d}"


def outcome_code(n: int) -> str:
    return f"OUTC-{n:06d}"


def exception_code(n: int) -> str:
    return f"EXC-{n:06d}"
