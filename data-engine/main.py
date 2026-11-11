"""Data engine entry point.

Usage:
    python main.py --profile small
    python main.py --profile full --seed 20261022
    python main.py --profile medium --skip-validate

Outputs (data-engine/exports): one CSV per table, ready for COPY into
PostgreSQL.  Outputs (data-engine/ground_truth): independent expectations and
the labelled anomaly manifest.  Ground truth is never imported into the OLTP
tables.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import date
from pathlib import Path

import pandas as pd

from config import Config, load_config
from generators.anomalies import build_manifest, inject_return_anomaly
from generators.consent import generate_consents
from generators.customers import generate_customers
from generators.dimensions import generate_categories, generate_products
from generators.engagement import generate_events
from generators.ground_truth import RFM_RULE_VERSION, compute_expected_segments
from generators.orders import generate_orders
from generators.support import generate_support_cases
from validators.checks import run_checks, summarize

NA = "\\N"

EXPORT_COLUMNS = {
    "product_categories": ["id", "code", "name", "parentId"],
    "products": ["id", "productCode", "name", "categoryId", "brand", "unitPrice", "unitCost",
                 "isReturnable", "launchDate", "isActive"],
    "customers": ["id", "customerCode", "firstName", "lastName", "email", "phone", "country", "city",
                  "region", "signupDate", "birthDate", "lifecycle", "acquisition", "loyaltyTier",
                  "preferredChannel"],
    "orders": ["id", "orderCode", "customerId", "orderDate", "status", "channel", "currency", "subtotal",
               "discountAmount", "shippingAmount", "taxAmount", "grossTotal", "returnedAmount",
               "netTotal", "itemCount", "returnReason", "campaignId"],
    "order_lines": ["id", "orderId", "productId", "customerId", "lineNumber", "quantity", "unitPrice",
                    "lineDiscount", "lineTotal", "returnedQuantity", "refundAmount", "netLineTotal"],
    "engagement_events": ["id", "customerId", "eventType", "channel", "sessionId", "occurredAt",
                          "pagePath", "deviceType", "campaignId"],
    "support_cases": ["id", "caseCode", "customerId", "openedAt", "closedAt", "status", "priority",
                      "category", "channel", "subject", "isEscalated", "handlingCost",
                      "satisfactionScore", "resolutionNotes"],
    "consents": ["id", "consentCode", "customerId", "channel", "purpose", "status", "source",
                 "effectiveFrom", "effectiveTo", "withdrawnAt", "recordedAt", "notes"],
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def export(frame: pd.DataFrame, name: str, cfg: Config) -> Path:
    path = cfg.export_dir / f"{name}.csv"
    cols = EXPORT_COLUMNS[name]
    out = frame[cols].copy()
    # Integer columns become float when a nullable column contains NA; write
    # them back as integers so COPY does not see "1.0" for an int column.
    for column in out.columns:
        if pd.api.types.is_float_dtype(out[column]):
            non_null = out[column].dropna()
            if len(non_null) and bool((non_null % 1 == 0).all()):
                out[column] = out[column].astype("Int64")
    out.to_csv(path, index=False, na_rep=NA, lineterminator="\n")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthetic data generator for the Customer Intelligence Platform")
    parser.add_argument("--profile", default=None, choices=["small", "medium", "full"])
    parser.add_argument("--seed", default=None, type=int)
    parser.add_argument("--reference-date", default=None)
    parser.add_argument("--skip-validate", action="store_true")
    args = parser.parse_args()

    cfg = load_config(args.profile, args.seed)
    if args.reference_date:
        cfg.reference_date = date.fromisoformat(args.reference_date)

    started = time.perf_counter()
    print(f"[data-engine] profile={cfg.profile} seed={cfg.seed} reference={cfg.reference_date}")
    print(f"[data-engine] targets: customers={cfg.customer_count:,} orders={cfg.order_count:,} events={cfg.event_count:,}")

    categories = generate_categories()
    products = generate_products(cfg.seed, cfg.reference_date)
    print(f"[data-engine] products: {len(products)} in {len(categories)} categories")

    customers = generate_customers(cfg)
    print(f"[data-engine] customers: {len(customers):,}")

    orders, order_lines = generate_orders(cfg, customers, products)
    print(f"[data-engine] orders: {len(orders):,} | lines: {len(order_lines):,}")

    events = generate_events(cfg, customers)
    print(f"[data-engine] engagement events: {len(events):,}")

    cases = generate_support_cases(cfg, customers)
    print(f"[data-engine] support cases: {len(cases):,}")

    consents = generate_consents(cfg, customers)
    print(f"[data-engine] consent records: {len(consents):,}")

    expected = compute_expected_segments(cfg, customers, orders, order_lines, cases)
    print(f"[data-engine] ground truth segments computed with {RFM_RULE_VERSION}")

    orders, order_lines, return_detail = inject_return_anomaly(orders, order_lines)
    manifest = build_manifest(cfg, customers, consents, expected, return_detail)
    if return_detail:
        print(f"[data-engine] injected CASE 3 on {return_detail['orderCode']}")

    data = {
        "customers": customers,
        "orders": orders,
        "order_lines": order_lines,
        "engagement_events": events,
        "support_cases": cases,
        "consents": consents,
        "products": products,
    }

    check_results = []
    if not args.skip_validate:
        check_results = run_checks(data, known_return_anomaly_order=(return_detail or {}).get("orderCode"))
        summary = summarize(check_results)
        print(f"[validate] checks={summary['totalChecks']} passed={summary['passed']} failed={summary['failed']} warnings={summary['warnings']}")
        if summary["failed"]:
            for r in check_results:
                if not r.passed and not r.expected_anomaly:
                    print(f"  FAILED {r.rule_id} {r.name}: {r.failures} of {r.checked}")

    files = {}
    for name in ["product_categories", "products", "customers", "orders", "order_lines",
                 "engagement_events", "support_cases", "consents"]:
        frame = {"product_categories": categories}.get(name, data.get(name))
        if frame is None:
            continue
        path = export(frame, name, cfg)
        files[name] = {"path": str(path.name), "rows": int(len(frame)), "sha256": sha256_file(path)}

    # ---- ground truth (never loaded into the OLTP schema) ----------------
    gt = cfg.ground_truth_dir
    expected_out = expected[[
        "customerCode", "recencyDays", "frequency", "monetary", "rScore", "fScore", "mScore",
        "rfmScore", "segmentSlug", "serviceCost", "openCases", "ruleVersion",
    ]]
    expected_out.to_csv(gt / "expected_segments.csv", index=False, lineterminator="\n")
    expected[["customerCode", "monetary", "recencyDays", "frequency"]].rename(
        columns={"monetary": "expectedNetSpend"}
    ).to_csv(gt / "expected_net_spend.csv", index=False, lineterminator="\n")
    customers[["customerCode", "archetype"]].to_csv(gt / "generation_archetypes.csv", index=False, lineterminator="\n")

    # Expected suppression: customers whose current marketing consent is withdrawn.
    current = consents[consents["effectiveTo"].isna()]
    withdrawn_ids = set(current[(current["purpose"] == "MARKETING") & (current["status"] == "WITHDRAWN")]["customerId"])
    code_by_id = dict(zip(customers["id"], customers["customerCode"]))
    suppression = {
        "emailMarketingWithdrawn": sorted(code_by_id[cid] for cid in withdrawn_ids),
        "expectedEligiblePromotionalCount": int(len(customers) - len(withdrawn_ids)),
    }
    (gt / "expected_suppression.json").write_text(json.dumps(suppression, indent=2), encoding="utf-8")

    (gt / "injection_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    ground_truth = {
        "seed": cfg.seed,
        "profile": cfg.profile,
        "referenceDate": cfg.reference_date.isoformat(),
        "ruleVersion": RFM_RULE_VERSION,
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "anomalies": [
            {"category": "SEGMENT_CONFLICT", **manifest["case1_segment_conflict"]},
            {"category": "CONSENT_VIOLATION", **manifest["case2_consent_violation"]},
            {"category": "RETURN_NOT_NETTED", **(manifest["case3_return_not_netted"] or {})},
            {"category": "OUTCOME_ATTRIBUTION", **manifest["case4_outcome_attribution"]},
        ],
        "counts": {
            "customers": int(len(customers)),
            "orders": int(len(orders)),
            "orderLines": int(len(order_lines)),
            "engagementEvents": int(len(events)),
            "supportCases": int(len(cases)),
            "consents": int(len(consents)),
            "products": int(len(products)),
        },
        "segmentDistribution": expected["segmentSlug"].value_counts().to_dict(),
        "expectedSuppressionCount": len(withdrawn_ids),
        "docs": "docs/data-generation.md",
    }
    (gt / "ground_truth.json").write_text(json.dumps(ground_truth, indent=2), encoding="utf-8")

    if check_results:
        (cfg.export_dir / "preload_validation.json").write_text(
            json.dumps({"summary": summarize(check_results), "checks": [r.as_dict() for r in check_results]}, indent=2),
            encoding="utf-8",
        )

    dataset_hash = hashlib.sha256(
        "".join(sorted(f"{k}:{v['sha256']}" for k, v in files.items())).encode()
    ).hexdigest()

    manifest_out = {
        "profile": cfg.profile,
        "seed": cfg.seed,
        "referenceDate": cfg.reference_date.isoformat(),
        "datasetHash": dataset_hash,
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "files": files,
        "counts": ground_truth["counts"],
    }
    (cfg.export_dir / "manifest.json").write_text(json.dumps(manifest_out, indent=2), encoding="utf-8")

    elapsed = time.perf_counter() - started
    print(f"[data-engine] dataset hash {dataset_hash}")
    print(f"[data-engine] completed in {elapsed:.1f}s -> {cfg.export_dir}")


if __name__ == "__main__":
    main()
