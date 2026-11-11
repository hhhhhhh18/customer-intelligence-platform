# Business rules

Rule versions: **RFM `rfm-v1.0.0`**, **recommendations `nba-v1.0.0`**, **validation `dq-v1.0.0`**.
Every membership and recommendation stores the rule version that produced it, so a rule change is observable
rather than silent.

---

## 1. Monetary definition

For a customer, over orders with status in (`COMPLETED`, `PARTIALLY_RETURNED`, `RETURNED`):

```
netLine         = lineTotal - refundAmount           (per order line)
orderNet        = shippingAmount + taxAmount + SUM(netLine)
customerSpend   = SUM(orderNet)
```

`CANCELLED` and `PENDING` orders are excluded from RFM. Discounts are applied at line level only
(`discountAmount` on the order is 0), so `grossTotal = subtotal + shipping + tax` always reconciles.

**Why line-derived:** the shipped dataset deliberately contains one order whose header was not netted for returns.
Scoring from lines yields the correct spend, and the discrepancy is reported as an exception instead of silently
distorting segmentation.

---

## 2. RFM scoring

Scores use population quintiles with `rank(method="min")` semantics:

```
better = number of customers strictly better on the metric
pct    = better / populationSize
score  = 5 - min(4, floor(pct * 5))
```

- **R** — lower recency is better. Customers with no completed order get `recencyDays = 9999`.
- **F** — higher completed-order count is better.
- **M** — higher net spend is better.

Ties receive identical scores, so the mapping is deterministic. `rfmScore` is the display code
`R*100 + F*10 + M` (e.g. 543).

**Consequence:** scores are relative to the base. They are recomputed on every run and cannot be computed for one
customer in isolation.

---

## 3. Segment assignment

Evaluated in ascending priority; **first match wins**; all rules are exclusive. A customer therefore holds exactly
one active exclusive membership.

| Priority | Segment | Condition |
|---:|---|---|
| 10 | High-Service-Cost Customers | `serviceCost >= INR 1,500` **and** `openCases >= 1` |
| 20 | Champions | `R >= 4` and `F >= 4` and `M >= 4` |
| 30 | Cannot Lose Them | `R <= 2` and `F >= 4` and `M >= 4` |
| 40 | New Customers | `tenureDays <= 90` and `frequency <= 2` |
| 50 | Potential Loyalists | `R >= 4` and `2 <= frequency <= 4` |
| 60 | Loyal Customers | `R >= 3` and `F >= 3` |
| 70 | At-Risk Customers | `R <= 2` and `F >= 3` |
| 80 | Hibernating Customers | `R = 2` and `F <= 2` |
| 90 | Lost Customers | fallback — everything not matched above |

Coverage is exhaustive: the fallback guarantees no unassigned customer, which is why `unassigned = 0` is a
validated invariant.

**Exclusivity and conflicts.** Because assignment is single-valued, a second active membership on an exclusive
segment can only come from an external source (a legacy import). It is not merged or deleted: the customer is
flagged, an exception is raised with both memberships as evidence, and a human resolves it.

---

## 4. Action catalogue and mapping

| Segment | Action | Promotional | Requires consent | Channel |
|---|---|---|---|---|
| Champions | Loyalty Reward | yes | yes | EMAIL |
| Loyal Customers | Product Recommendation | yes | yes | EMAIL |
| Potential Loyalists | Product Recommendation | yes | yes | EMAIL |
| New Customers | Welcome / Onboarding | yes | yes | EMAIL |
| Cannot Lose Them | Retention Intervention | no | no | PHONE |
| At-Risk Customers | Re-engagement Campaign | yes | yes | EMAIL |
| Hibernating Customers | Re-engagement Campaign | yes | yes | EMAIL |
| High-Service-Cost | Support Follow-up | no | no | PHONE |
| Lost Customers | No Marketing Action | no | no | — |

Two documented overrides:

1. **Service recovery precedence.** If a customer has ≥1 escalated support case, the action is *Support Follow-up*
   regardless of segment. No promotional action is even evaluated for that customer, so marketing is paused by
   construction.
2. **High-value loyalty.** A Loyal Customer with `M >= 4` and `frequency >= 6` receives *Loyalty Reward* instead of a
   generic product recommendation.

---

## 5. Eligibility and suppression

Evaluated **in this order**. The first applicable rule decides the outcome.

| # | Rule | Result | Recorded reason |
|---:|---|---|---|
| 1 | Action requires marketing consent and there is **no active GRANTED consent on the action's channel** | `SUPPRESSED` | `SUPPRESSED_CONSENT` |
| 2 | Consent action but no usable email address | `SUPPRESSED` | `SUPPRESSED_CONTACT_PREFERENCE` |
| 3 | Promotional action and `escalatedCases > 0` | `SUPPRESSED` | `SUPPRESSED_ACTIVE_COMPLAINT` |
| 4 | Promotional action and `openCases > 0` | `SUPPRESSED` | `SUPPRESSED_OPEN_SUPPORT_CASE` |
| 5 | Promotional action and last marketing contact < frequency cap (7/10/14/21 days by action) | `SUPPRESSED` | `SUPPRESSED_RECENT_CONTACT` |
| 6 | Phone action with no phone number | `SUPPRESSED` | `SUPPRESSED_CONTACT_PREFERENCE` |
| 7 | Action is *No Marketing Action* | `NO_ACTION` | `NO_ACTION_JUSTIFIED` |
| 8 | Otherwise | `ELIGIBLE` | `NOT_SUPPRESSED` |

**Consent is per channel.** An EMAIL withdrawal does not revoke PUSH consent, and a PUSH grant never authorises
EMAIL. This was a real defect found during testing: an earlier implementation aggregated consent per customer and
allowed 13 promotional recommendations to reach the guard instead of being blocked at decision time.

**Hard invariant:** `DQ-REC-01` asserts that no promotional recommendation is `ELIGIBLE` without an active grant.
After the consent guard runs, this count is 0.

---

## 6. Consent lifecycle

- Consent is append-only per `(customer, channel, purpose)`.
- Only one row may have `effectiveTo IS NULL` for a triple — that is the current state.
- A change closes the current row (`effectiveTo = changeTime`) and inserts a new row.
- A `WITHDRAWN` row always carries `withdrawnAt`.
- Re-recording the same state is rejected with `409 CONFLICT` rather than duplicating history.
- Withdrawing marketing consent immediately downgrades any live `ELIGIBLE` promotional recommendation to
  `SUPPRESSED`, appends a reason row `CONSENT_WITHDRAWN_LIVE`, and writes an audit event.

---

## 7. Outcome rules

- One outcome per recommendation is the norm; duplicates are not created by the simulator (existing outcomes are
  skipped).
- `SUCCESS` and `FAILURE` require an acceptance (`respondedAt`) and completion (`completedAt`).
- Revenue is attributed **only** to `SUCCESS`. `revenueAttributed` is 0 for failures and non-responses.
- Recommendation lifecycle: `NO_RESPONSE → EXPIRED`, `SUCCESS/FAILURE → COMPLETED`.
- If a downstream system records an outcome against an action that differs from the recommendation's action, the row
  **is still stored** (evidence preservation), is flagged `isAttributionValid = false`, an exception is raised, and
  the revenue is excluded from attribution.
- No causal uplift is claimed: there is no control group.

---

## 8. Exception rules

| Category | Rule id | Detection | Severity |
|---|---|---|---|
| Segment conflict | `SEG-EXCL-01` | >1 active membership on exclusive segments | HIGH |
| Consent violation | `CONSENT-ENF-01` | `ELIGIBLE` promotional recommendation without active channel consent | CRITICAL |
| Returns not netted | `RET-01` | line refunds > 0 but header `returnedAmount` or `netTotal` not reduced | HIGH |
| Outcome attribution | `ATTRIB-01` | `outcome.actionId <> recommendation.actionId` | HIGH |

Guiding principle: **detect and preserve, never repair silently.** The only mutations are lifecycle flags
(`isExclusiveConflict`, `isAttributionValid`) and recommendation status changes, each accompanied by an audit event
containing the previous values.

---

## 9. Determinism guarantees

Given the same seed and the same source data:

- Segmentation output is identical (fixed quintile ties, fixed rule order, fixed `asOfDate`).
- Recommendation decisions are identical (no randomness, no clock read inside the engine).
- Outcome simulation is identical (PRNG seeded by `seed ^ hash(recommendationId)`).
- Exception detection is identical and idempotent.

The only non-deterministic inputs are the wall clock for `assignedAt`/`detectedAt` timestamps and the LLM narrative,
which never affects a decision.
