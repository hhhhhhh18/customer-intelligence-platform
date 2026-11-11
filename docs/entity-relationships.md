# Entity relationships

Canonical schema: `database/prisma/schema.prisma`. This document explains cardinalities, constraints and the
invariants each relationship must satisfy.

## 1. Diagram

```
                      ┌───────────────────┐
                      │ product_categories│◀─┐ parent (self)
                      └─────────┬─────────┘  └──┘
                                │ 1
                                │
                                │ N
                          ┌─────▼─────┐
                          │  products │
                          └─────┬─────┘
                                │ 1
                                │
┌──────────────┐ 1     N ┌──────▼──────┐ N     1 ┌──────────┐
│  customers   │────────▶│   orders    │────────▶│ order_   │
└──────┬───────┘         └──────┬──────┘         │ lines    │
       │                        │ 1              └──────────┘
       │                        │ N
       │                 ┌──────▼────────┐
       │                 │ action_outcomes│
       │                 └──────▲────────┘
       │                        │ N
       │ 1                      │ 1
       │                 ┌──────┴────────────┐ 1     N ┌───────────────────────┐
       ├────────────────▶│  recommendations  │────────▶│ recommendation_reasons│
       │            N    └──────┬────────────┘         └───────────────────────┘
       │                        │ N
       │                        │ 1
       │                 ┌──────▼───────┐
       │                 │ action_catalog│
       │                 └──────────────┘
       │
       │ 1    N ┌──────────────────┐ N    1 ┌──────────────┐
       ├───────▶│ segment_memberships│──────▶│ segment_rules│
       │        └──────────────────┘        └──────────────┘
       │
       │ 1    N ┌──────────────┐
       ├───────▶│   consents   │
       │        └──────────────┘
       │ 1    N ┌──────────────────┐
       ├───────▶│ engagement_events│
       │        └──────────────────┘
       │ 1    N ┌──────────────┐
       ├───────▶│ support_cases│
       │        └──────────────┘
       │ 1    N ┌──────────────────┐
       └───────▶│ exception_records│
                └──────────────────┘
```

## 2. Relationship table

| Parent | Child | Cardinality | FK | On delete | Notes |
|---|---|---|---|---|---|
| Customer | Order | 1:N | `orders.customerId` | Restrict | Orders are financial records; never cascade-deleted |
| Order | OrderLine | 1:N | `order_lines.orderId` | Cascade | Lines have no meaning without the order |
| Product | OrderLine | 1:N | `order_lines.productId` | Restrict | A product in use cannot be deleted |
| ProductCategory | Product | 1:N | `products.categoryId` | Restrict | Leaf categories hold products |
| ProductCategory | ProductCategory | 1:N self | `parentId` | Restrict | Two-level taxonomy |
| Customer | EngagementEvent | 1:N | `engagement_events.customerId` | Cascade | High-volume behavioural data |
| Customer | SupportCase | 1:N | `support_cases.customerId` | Restrict | Service cost feeds segmentation |
| Customer | Consent | 1:N | `consents.customerId` | Restrict | Append-only history |
| SegmentRule | SegmentMembership | 1:N | `segment_memberships.segmentId` | Restrict | Rules are versioned, not deleted |
| Customer | SegmentMembership | 1:N | `segment_memberships.customerId` | Restrict | N:M with SegmentRule |
| ActionCatalog | Recommendation | 1:N | `recommendations.actionId` | Restrict | A recommendation always names a real action |
| SegmentRule | Recommendation | 1:N | `recommendations.segmentId` | SetNull | Snapshot of the segment used |
| Customer | Recommendation | 1:N | `recommendations.customerId` | Restrict | — |
| Recommendation | RecommendationReason | 1:N | `recommendation_reasons.recommendationId` | Cascade | Reasons are part of the decision |
| Recommendation | ActionOutcome | 1:N | `action_outcomes.recommendationId` | Restrict | Outcome is evidence |
| Order | ActionOutcome | 1:N | `action_outcomes.orderId` | SetNull | Optional attribution to a purchase |
| Customer | ExceptionRecord | 1:N | `exception_records.customerId` | SetNull | Evidence outlives customer lifecycle changes |
| Recommendation | ExceptionRecord | 1:N | `exception_records.recommendationId` | SetNull | — |
| Customer | AuditEvent | 1:N | `audit_events.customerId` | SetNull | Append-only trail |

## 3. Unique constraints and why they exist

| Constraint | Table | Purpose |
|---|---|---|
| `customerCode`, `email` | customers | Identity resolution |
| `orderCode` | orders | Business identifier |
| `[orderId, lineNumber]` | order_lines | Line-level reconciliation is unambiguous |
| `[customerId, channel, purpose, effectiveFrom]` | consents | Impossible to insert two identical decisions at the same instant |
| `[segmentId, customerId, effectiveFrom]` | segment_memberships | One membership per segment per assignment moment |
| `membershipCode` | segment_memberships | `MEM-<segment>-<customer>` (+`-R2` on re-entry) |
| `[customerId, runId, actionId]` | recommendations | Re-running an engine run cannot duplicate decisions |
| `[category, entityType, entityId, detectionRuleId]` | exception_records | Detection is idempotent; evidence is not duplicated |
| `recommendationCode`, `outcomeCode`, `exceptionCode`, `consentCode` | respective tables | Immutable business identifiers |

## 4. Invariants

1. **Exactly one active exclusive segment per customer.** Enforced by the decision tree; violated only by the
   deliberately injected legacy row, which is reported (`DQ-SEG-01` expects exactly one such customer).
2. **One current consent per triple.** `effectiveTo IS NULL` selects current state (`DQ-DUP-04`).
3. **Every recommendation has ≥1 reason** (`DQ-REC-02`).
4. **No promotional ELIGIBLE recommendation without consent** (`DQ-REC-01`).
5. **Order arithmetic reconciles** (`DQ-AR-01`, `DQ-AR-02`) except the labelled return defect (`DQ-RC-01`).
6. **Outcome action equals recommendation action** (`DQ-OUT-01`) except the labelled attribution defect.
7. **Every customer is assigned** — `unassigned = 0` is recorded on each segmentation run.
8. **History is preserved.** No engine issues `UPDATE` on a consent decision, no engine deletes a membership row.

## 5. Snapshot vs. reference

- `segment_memberships` stores the **decision inputs at assignment time** (`recencyDays`, `frequency`, `monetary`,
  scores, `decisionInputs` JSON). Recomputing RFM later does not rewrite this row.
- `recommendations.inputMetrics` stores the metrics used for that decision, so a later change in segment does not
  invalidate the explanation.
- `exception_records.evidence` stores the raw expected/actual values and foreign keys at detection time.
