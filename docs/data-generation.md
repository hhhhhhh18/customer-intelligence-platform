# Synthetic data generation

## 1. Purpose and provenance

All records are synthetic, produced by `data-engine/` from a fixed seed. No real person, company or third-party
dataset is involved. Names, emails and phone numbers are placeholders. The dataset exists to exercise business
logic and must not be used to make claims about a real business.

## 2. Profiles and volumes

| Profile | Customers | Orders | Engagement events |
|---|---:|---:|---:|
| `small` (default) | 500 | 2,000 | 10,000 |
| `medium` | 5,000 | 20,000 | 100,000 |
| `full` | 50,000 | 200,000 | 1,000,000 |

Derived volumes scale automatically: order lines average ~2.3 per order, support cases depend on archetype, consent
rows average ~4.8 per customer (history included).

```powershell
python data-engine/main.py --profile small
python data-engine/main.py --profile full --seed 20261022
python data-engine/main.py --profile small --skip-validate
```

Arguments: `--profile`, `--seed`, `--reference-date`, `--skip-validate`.

## 3. Determinism

- One `numpy.random.default_rng(seed + offset)` stream per generator module, so changing one generator does not
  perturb another.
- Archetypes are allocated by largest-remainder so counts are exact and reproducible.
- All money is computed in **integer paise** and exported with two decimals — no float drift.
- IDs are assigned from monotonic sequence numbers (`CUS-000001`, `ORD-2026-000001`, …).
- `referenceDate` defaults to `2026-11-01` (fixed), so recency does not drift with the wall clock.
- `manifest.json` records a SHA-256 per file and a combined `datasetHash`.

Reproducibility check: `backend/tests/reproducibility.test.ts` regenerates twice and asserts identical hashes.

## 4. Behaviour archetypes

Archetypes are a **generation device only**. They are written to
`ground_truth/generation_archetypes.csv` for evaluation and are never loaded into the OLTP schema, never read by
segmentation, and never used as a feature.

| Archetype | Share | Orders/customer (weight) | Recency window (days) | Tenure window (days) |
|---|---:|---:|---|---|
| Champion | 12% | 12.0 | 0–25 | 400–1,050 |
| Loyal | 18% | 6.0 | 1–55 | 300–900 |
| Potential | 15% | 2.5 (capped 3) | 2–40 | 110–320 |
| New | 12% | 1.4 (capped 2) | 0–20 | 10–60 |
| At Risk | 10% | 3.0 | 70–150 | 330–900 |
| Cannot Lose | 6% | 9.0 | 60–130 | 520–1,000 |
| Hibernating | 9% | 2.0 (capped 4) | 130–240 | 300–800 |
| Lost | 10% | 1.5 (capped 3) | 250–420 | 420–1,000 |
| High Service | 8% | 3.5 | 5–120 | 250–900 |

Order counts are allocated proportionally to hit the profile total **exactly**; the caps keep low-activity
archetypes realistic (a new customer never places nine orders) and freed volume is redistributed to high-value
archetypes.

Purchase timing uses a skewed distribution: `u ** shape` where shape < 1 clusters purchases late (healthy repeat
buying) and shape > 1 clusters them early (declining frequency → at-risk/lost behaviour).

Additional realism:
- 22% of customers are returners; their orders are more likely to be partially or fully returned.
- Discounts apply to ~18% of lines at 5–20%.
- Shipping is free above ₹999; tax is 18% of line subtotal.
- Statuses: ~92% completed, 3.2% cancelled, 1.2% pending, remainder returned.
- High-service customers get 4–9 support cases with 42% escalated and handling cost of ₹1,800–6,500.

## 5. Order arithmetic

```
lineTotal      = quantity * unitPrice - lineDiscount
subtotal       = SUM(lineTotal)
taxAmount      = round(subtotal * 0.18)
grossTotal     = subtotal + shippingAmount + taxAmount
refundAmount   = per-line refund for returned quantity
returnedAmount = SUM(refundAmount)
netTotal       = grossTotal - returnedAmount
```

`discountAmount` at order level is always 0 by design, so `grossTotal` is always reconcilable from lines.

## 6. Consent generation

Per customer, up to seven `(channel, purpose)` pairs with independent grant/withdrawal probabilities. ~9% withdraw
EMAIL marketing consent. Withdrawal is modelled correctly: the GRANTED row receives `effectiveTo`, and a separate
WITHDRAWN row is appended with `withdrawnAt`.

## 7. Outputs

`data-engine/exports/` (git-ignored, regenerable):

| File | Columns |
|---|---|
| `product_categories.csv` | id, code, name, parentId |
| `products.csv` | id, productCode, name, categoryId, brand, unitPrice, unitCost, isReturnable, launchDate, isActive |
| `customers.csv` | id, customerCode, firstName, lastName, email, phone, country, city, region, signupDate, birthDate, lifecycle, acquisition, loyaltyTier, preferredChannel |
| `orders.csv` | id, orderCode, customerId, orderDate, status, channel, currency, subtotal, discountAmount, shippingAmount, taxAmount, grossTotal, returnedAmount, netTotal, itemCount, returnReason, campaignId |
| `order_lines.csv` | id, orderId, productId, customerId, lineNumber, quantity, unitPrice, lineDiscount, lineTotal, returnedQuantity, refundAmount, netLineTotal |
| `engagement_events.csv` | id, customerId, eventType, channel, sessionId, occurredAt, pagePath, deviceType, campaignId |
| `support_cases.csv` | id, caseCode, customerId, openedAt, closedAt, status, priority, category, channel, subject, isEscalated, handlingCost, satisfactionScore, resolutionNotes |
| `consents.csv` | id, consentCode, customerId, channel, purpose, status, source, effectiveFrom, effectiveTo, withdrawnAt, recordedAt, notes |
| `manifest.json` | counts, datasetHash, per-file hashes |

`data-engine/ground_truth/` (version-controlled):

| File | Contents |
|---|---|
| `expected_segments.csv` | Per-customer recency, frequency, monetary, R/F/M scores, expected segment, rule version |
| `expected_net_spend.csv` | Per-customer expected net spend (line-derived) |
| `expected_suppression.json` | Customers with withdrawn email marketing consent |
| `ground_truth.json` | Anomaly labels, counts, segment distribution, seed/profile/reference date |
| `injection_manifest.json` | Exact targets for the two integration-level anomalies |
| `generation_archetypes.csv` | Archetype per customer (evaluation only) |

## 8. Anomaly injection

| Case | Where injected | How |
|---|---|---|
| 1 — conflicting exclusive segments | `backend/src/scripts/inject-anomalies.ts` | Adds a second ACTIVE membership with `ruleVersion = legacy-import-v0`, using the customer and segment named in `injection_manifest.json` |
| 2 — consent violation | same | Inserts an `ELIGIBLE` promotional recommendation with `sourcePipeline = legacy-campaign-service-v0` for a customer with withdrawn consent |
| 3 — returns not netted | `data-engine/generators/anomalies.py` | Zeroes `returnedAmount` and restores `netTotal = grossTotal` on one partially-returned order while leaving line refunds intact |
| 4 — outcome attribution | `backend/src/scripts/inject-anomalies.ts` | Rewrites one successful outcome's `actionId` to a different action, leaving the recommendation untouched |

The injector reads the manifest; **detectors never do**. Detection must work on unfiltered production data.

## 9. Ground-truth independence

`data-engine/generators/ground_truth.py` implements quintile scoring and the segment tree a second time, in Python,
from the generated source frames. It does not import the TypeScript engine and does not read its output.

Measured agreement on the shipped dataset: **500/500 customers (100%)**, including all R/F/M scores and monetary
values. This is a genuine cross-implementation check — a rule change in one implementation breaks it.

## 10. Loading

```powershell
npm --prefix backend run data:load
```

The loader:

1. `TRUNCATE ... RESTART IDENTITY CASCADE` on the 21 analytics tables in one statement.
2. Streams each CSV with `COPY ... FROM STDIN (FORMAT csv, HEADER true, NULL '\N')`.
3. Verifies row counts against the manifest and aborts on mismatch.
4. Realigns identity sequences to `MAX(id)`.
5. Seeds segment rules and the action catalogue.
6. Inserts a `generation_runs` row with profile, seed, reference date, counts and dataset hash.

Loading the small profile takes ~1.5 s; full scale is dominated by the 1,000,000-row event file.

## 11. Performance notes

| Stage | Small (measured) | Full (design) |
|---|---|---|
| Python generation | ~5 s | ~2–4 min (vectorised NumPy paths) |
| COPY load | 1.5 s | ~1–2 min |
| Segmentation | 0.4 s | ~10–20 s (single SQL aggregate + batched writes) |
| Recommendations | ~10 s | ~60–90 s |
| Outcome simulation | ~2 s | ~20 s |

Batch sizes are 2,000–5,000 rows per `createMany`; no per-row INSERT loops are used for bulk data.
