# Data dictionary

PostgreSQL 17, schema `public`. Source of truth: `database/prisma/schema.prisma`.
Types are the PostgreSQL types produced by Prisma. `PK` = primary key, `FK` = foreign key, `UQ` = unique.

---

## 1. `customers` — core entity 1

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | Internal key |
| `customerCode` | varchar(20) | UQ, `CUS-\d{6}` | Immutable business identifier |
| `firstName` / `lastName` | varchar(80) | NOT NULL | Synthetic name |
| `email` | varchar(180) | UQ, NOT NULL | Synthetic unique address |
| `phone` | varchar(40) | NULL | Used for phone-channel eligibility |
| `country` / `city` / `region` | varchar | NOT NULL | Location |
| `signupDate` | date | NOT NULL | Drives `tenureDays` |
| `birthDate` | date | NULL | Demographic |
| `lifecycle` | enum | NOT NULL, default ACTIVE | CRM status: `ACTIVE`, `DORMANT`, `CHURNED`, `BLOCKED` |
| `acquisition` | varchar(40) | NOT NULL | Acquisition channel |
| `loyaltyTier` | varchar(20) | NULL | Reserved |
| `preferredChannel` | enum | NULL | Contact preference: `WEB`,`APP`,`EMAIL`,`SMS`,`PUSH`,`PHONE` |
| `createdAt` / `updatedAt` | timestamp(6) | NOT NULL | Audit timestamps |

Indexes: `(lastName, firstName)`, `signupDate`, `lifecycle`.

---

## 2. `product_categories` — taxonomy

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `code` | varchar(20) | UQ, `CAT-\d{3}` | Business identifier |
| `name` | varchar(80) | NOT NULL | Category name |
| `parentId` | int | FK → `product_categories.id`, NULL | Root categories have NULL |
| `createdAt` | timestamp(6) | NOT NULL | |

Two-level tree: 5 roots, 12 leaves.

---

## 3. `products` — core entity 4

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `productCode` | varchar(20) | UQ, `PRD-\d{5}` | |
| `name` | varchar(140) | NOT NULL | |
| `categoryId` | int | FK → `product_categories.id`, NOT NULL | Leaf category |
| `brand` | varchar(60) | NOT NULL | |
| `unitPrice` / `unitCost` | decimal(12,2) | NOT NULL | INR, 2 dp |
| `isReturnable` | boolean | default true | Non-returnable lines are skipped by return injection |
| `launchDate` | date | NOT NULL | |
| `isActive` | boolean | default true | |
| `createdAt` / `updatedAt` | timestamp(6) | NOT NULL | |

---

## 4. `orders` — core entity 2

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `orderCode` | varchar(24) | UQ, `ORD-\d{4}-\d{6}` | |
| `customerId` | int | FK → `customers.id`, NOT NULL, Restrict | |
| `orderDate` | date | NOT NULL | Recency source |
| `status` | enum | NOT NULL | `PENDING`,`COMPLETED`,`CANCELLED`,`RETURNED`,`PARTIALLY_RETURNED` |
| `channel` | enum | NOT NULL | `WEB`,`MOBILE_APP`,`STORE`,`PHONE`,`MARKETPLACE` |
| `currency` | varchar(3) | default `INR` | |
| `subtotal` | decimal(14,2) | NOT NULL | `= SUM(lineTotal)` |
| `discountAmount` | decimal(14,2) | default 0 | Order-level discount (always 0 by design) |
| `shippingAmount` | decimal(14,2) | default 0 | 0 or 49.00 |
| `taxAmount` | decimal(14,2) | default 0 | 18% of subtotal |
| `grossTotal` | decimal(14,2) | NOT NULL | `subtotal + shipping + tax` |
| `returnedAmount` | decimal(14,2) | default 0 | `= SUM(refundAmount)` — the Case 3 defect violates this |
| `netTotal` | decimal(14,2) | NOT NULL | `grossTotal - returnedAmount` |
| `itemCount` | int | NOT NULL | Total units |
| `returnReason` | varchar(120) | NULL | |
| `campaignId` | varchar(32) | NULL | |
| `createdAt` / `updatedAt` | timestamp(6) | NOT NULL | |

Indexes: `(customerId, orderDate)`, `orderDate`, `status`.

---

## 5. `order_lines` — core entity 3

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `orderId` | int | FK → `orders.id`, Cascade | |
| `productId` | int | FK → `products.id`, Restrict | |
| `customerId` | int | FK → `customers.id`, Restrict | Denormalised for fast customer aggregation |
| `lineNumber` | int | UQ with `orderId` | 1-based |
| `quantity` | int | NOT NULL | 1–3 |
| `unitPrice` | decimal(12,2) | NOT NULL | |
| `lineDiscount` | decimal(14,2) | default 0 | Line-level discount |
| `lineTotal` | decimal(14,2) | NOT NULL | `quantity * unitPrice - lineDiscount` |
| `returnedQuantity` | int | default 0 | |
| `refundAmount` | decimal(14,2) | default 0 | **Source of truth for returns** |
| `netLineTotal` | decimal(14,2) | NOT NULL | `lineTotal - refundAmount` |

Indexes: `orderId`, `productId`, `customerId`.

---

## 6. `engagement_events` — core entity 5

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | bigserial | PK | High volume |
| `customerId` | int | FK → `customers.id`, Cascade | |
| `eventType` | enum | NOT NULL | 14 values (page view, product view, email open/click, app open, add to cart, checkout, purchase, support visit, unsubscribe click, …) |
| `channel` | enum | NOT NULL | `WEB`,`APP`,`EMAIL`,`SMS`,`PUSH`,`PHONE` |
| `sessionId` | varchar(40) | NOT NULL | |
| `occurredAt` | timestamp(6) | NOT NULL | |
| `pagePath` | varchar(160) | NULL | Web/app only |
| `deviceType` | varchar(24) | NULL | |
| `campaignId` | varchar(32) | NULL | Email/push/SMS only |
| `metadata` | jsonb | NULL | Reserved |
| `createdAt` | timestamp(6) | NOT NULL | |

Indexes: `(customerId, occurredAt)`, `eventType`, `occurredAt`.

---

## 7. `support_cases` — core entity 6

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `caseCode` | varchar(24) | UQ, `CASE-\d{6}` | |
| `customerId` | int | FK → `customers.id`, Restrict | |
| `openedAt` / `closedAt` | timestamp(6) | NOT NULL / NULL | |
| `status` | enum | NOT NULL | `OPEN`,`IN_PROGRESS`,`RESOLVED`,`CLOSED`,`ESCALATED` |
| `priority` | enum | NOT NULL | `LOW`,`MEDIUM`,`HIGH`,`URGENT` |
| `category` | enum | NOT NULL | `BILLING`,`DELIVERY`,`PRODUCT_QUALITY`,`RETURNS`,`ACCOUNT`,`TECHNICAL`,`OTHER` |
| `channel` | enum | NOT NULL | Contact channel |
| `subject` | varchar(160) | NOT NULL | |
| `isEscalated` | boolean | default false | |
| `handlingCost` | decimal(12,2) | default 0 | Feeds the high-service-cost segment |
| `satisfactionScore` | int | NULL, 1–5 | |
| `resolutionNotes` | text | NULL | |
| `createdAt` / `updatedAt` | timestamp(6) | NOT NULL | |

Indexes: `(customerId, openedAt)`, `status`.

---

## 8. `consents` — core entity 7 (append-only)

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `consentCode` | varchar(28) | UQ, `CNS-\d{6}` | |
| `customerId` | int | FK → `customers.id`, Restrict | |
| `channel` | enum | NOT NULL | `EMAIL`,`SMS`,`PUSH`,`PHONE`,`DIRECT_MAIL` |
| `purpose` | enum | NOT NULL | `MARKETING`,`TRANSACTIONAL`,`ANALYTICS`,`PROFILING` |
| `status` | enum | NOT NULL | `GRANTED`,`WITHDRAWN`,`PENDING`,`EXPIRED` |
| `source` | varchar(60) | NOT NULL | e.g. `SIGNUP_FORM`, `PREFERENCE_CENTRE` |
| `effectiveFrom` | timestamp(6) | NOT NULL, UQ with customer/channel/purpose | |
| `effectiveTo` | timestamp(6) | NULL | `NULL` = current record |
| `withdrawnAt` | timestamp(6) | NULL | Required when status = WITHDRAWN |
| `recordedAt` | timestamp(6) | NOT NULL | |
| `notes` | text | NULL | |
| `createdAt` | timestamp(6) | NOT NULL | |

Indexes: `(customerId, purpose, channel)`, `status`.

**Invariant:** exactly one row per `(customer, channel, purpose)` with `effectiveTo IS NULL`.

---

## 9. `segment_rules` — core entity 8

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `segmentCode` | varchar(24) | UQ, `SEG-\d{4}-\d{6}` | |
| `slug` | varchar(48) | UQ | Stable machine name, e.g. `at-risk-customers` |
| `name` | varchar(80) | NOT NULL | Display name |
| `description` | text | NOT NULL | Business meaning |
| `category` | enum | NOT NULL | `VALUE`,`LIFECYCLE`,`RISK`,`SERVICE` |
| `priority` | int | NOT NULL | Evaluation order, ascending |
| `isExclusive` | boolean | default true | A customer holds at most one active exclusive segment |
| `ruleVersion` | varchar(20) | NOT NULL | e.g. `rfm-v1.0.0` |
| `criteria` | jsonb | NOT NULL | Machine-readable thresholds |
| `explanation` | text | NOT NULL | Human-readable rule |
| `isActive` | boolean | default true | |
| `effectiveFrom` | timestamp(6) | NOT NULL | |
| `createdAt` / `updatedAt` | timestamp(6) | NOT NULL | |

---

## 10. `segment_memberships` — core entity 9 (historical)

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `membershipCode` | varchar(60) | UQ | `MEM-<segment>-<customer>` (`-R2` on re-entry) |
| `segmentId` | int | FK → `segment_rules.id`, Restrict | |
| `customerId` | int | FK → `customers.id`, Restrict | |
| `assignedAt` | timestamp(6) | NOT NULL | Wall clock |
| `effectiveFrom` | timestamp(6) | NOT NULL, UQ with segment+customer | Analysis date |
| `effectiveTo` | timestamp(6) | NULL | Closed when superseded |
| `status` | enum | NOT NULL | `ACTIVE`,`EXPIRED`,`SUPERSEDED`,`CONFLICT_FLAGGED` |
| `ruleVersion` | varchar(20) | NOT NULL | Rule that produced this row |
| `recencyDays` | int | NOT NULL | Decision input snapshot |
| `frequency` | int | NOT NULL | Decision input snapshot |
| `monetary` | decimal(14,2) | NOT NULL | Line-derived net spend |
| `rScore` / `fScore` / `mScore` | int | NOT NULL, 1–5 | |
| `rfmScore` | int | NOT NULL | `R*100 + F*10 + M` |
| `serviceCost` | decimal(12,2) | default 0 | Support handling cost |
| `assignmentReason` | text | NOT NULL | Explainable sentence |
| `decisionInputs` | jsonb | NOT NULL | Full input vector |
| `isExclusiveConflict` | boolean | default false | Set by the conflict detector |
| `createdAt` | timestamp(6) | NOT NULL | |

Indexes: `(customerId, status)`, `(segmentId, status)`.

---

## 11. `action_catalog` — core entity 10

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `actionCode` | varchar(24) | UQ, `ACTN-\d{4}-\d{6}` | |
| `slug` | varchar(48) | UQ | e.g. `loyalty-reward` |
| `name` | varchar(100) | NOT NULL | |
| `description` | text | NOT NULL | |
| `actionType` | enum | NOT NULL | `LOYALTY_REWARD`,`PROMOTIONAL_DISCOUNT`,`RE_ENGAGEMENT`,`WELCOME_ONBOARDING`,`PRODUCT_RECOMMENDATION`,`SUPPORT_FOLLOW_UP`,`RETENTION_INTERVENTION`,`NO_ACTION` |
| `channel` | enum | NOT NULL | Execution channel |
| `isPromotional` | boolean | default false | Subject to complaint/frequency suppression |
| `requiresMarketingConsent` | boolean | default false | Hard gate |
| `costPerContact` / `expectedValue` | decimal(10,2) | default 0 | Used in scoring and no-action justification |
| `priority` | int | NOT NULL | |
| `eligibilityRules` | jsonb | NOT NULL | Declarative rule copy |
| `suppressionRules` | jsonb | NOT NULL | Includes `frequencyCapDays` |
| `isActive` | boolean | default true | |
| `createdAt` / `updatedAt` | timestamp(6) | NOT NULL | |

---

## 12. `recommendations` — supporting

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `recommendationCode` | varchar(28) | UQ, `REC-\d{4}-\d{6}` | |
| `customerId` | int | FK → `customers.id` | |
| `segmentId` | int | FK → `segment_rules.id`, SetNull, NULL | Segment at decision time |
| `actionId` | int | FK → `action_catalog.id` | |
| `runId` | varchar(32) | NOT NULL, UQ with customer+action | Engine run |
| `recommendedAt` | timestamp(6) | NOT NULL | |
| `eligibility` | enum | NOT NULL | `ELIGIBLE`,`INELIGIBLE`,`SUPPRESSED`,`NO_ACTION` |
| `suppressionResult` | enum | NOT NULL | See business rules §5 |
| `status` | enum | NOT NULL | `PENDING`,`ACCEPTED`,`COMPLETED`,`DISMISSED`,`EXPIRED`,`SUPPRESSED` |
| `score` | decimal(8,3) | default 0 | Expected value × value factor |
| `explanation` | text | NOT NULL | Deterministic narrative |
| `inputMetrics` | jsonb | NOT NULL | Decision inputs |
| `ruleVersion` | varchar(20) | NOT NULL | |
| `sourcePipeline` | varchar(48) | NOT NULL | Distinguishes the engine from the injected legacy pipeline |
| `createdAt` / `updatedAt` | timestamp(6) | NOT NULL | |

Indexes: `(customerId, recommendedAt)`, `(eligibility, suppressionResult)`, `actionId`, `segmentId`.

---

## 13. `recommendation_reasons` — supporting

| Column | Type | Description |
|---|---|---|
| `id` | serial PK | |
| `recommendationId` | int FK → `recommendations.id`, Cascade | |
| `reasonCode` | varchar(48) | e.g. `CONSENT_WITHDRAWN`, `SEGMENT_MATCH`, `FREQUENCY_CAP` |
| `label` | varchar(140) | Short human label |
| `detail` | text | Full sentence with numbers |
| `metricName` | varchar(48) NULL | e.g. `netSpend` |
| `metricValue` / `thresholdValue` | decimal(14,2) NULL | Numbers quoted in the detail |
| `weight` | decimal(6,2) | Ordering / importance |
| `createdAt` | timestamp(6) | |

---

## 14. `action_outcomes` — core entity 11

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `outcomeCode` | varchar(28) | UQ, `OUTC-\d{6}` | |
| `recommendationId` | int | FK → `recommendations.id`, Restrict | |
| `customerId` | int | FK → `customers.id` | |
| `actionId` | int | FK → `action_catalog.id` | **As recorded downstream** — may disagree with the recommendation |
| `orderId` | int | FK → `orders.id`, SetNull, NULL | Optional purchase attribution |
| `status` | enum | NOT NULL | `PENDING`,`SUCCESS`,`FAILURE`,`NO_RESPONSE`,`UNATTRIBUTED` |
| `respondedAt` / `completedAt` | timestamp(6) NULL | | |
| `revenueAttributed` | decimal(14,2) | default 0 | Only non-zero for SUCCESS |
| `channel` | enum | NOT NULL | |
| `notes` | text | NULL | |
| `isAttributionValid` | boolean | default true | Set false by the attribution detector |
| `createdAt` / `updatedAt` | timestamp(6) | NOT NULL | |

---

## 15. `exception_records` — supporting

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `exceptionCode` | varchar(28) | UQ, `EXC-\d{6}` | |
| `category` | enum | NOT NULL | 10 values incl. the 4 mandatory ones |
| `severity` | enum | NOT NULL | `CRITICAL`,`HIGH`,`MEDIUM`,`LOW` |
| `entityType` / `entityId` | varchar | NOT NULL | e.g. `Order` / `ORD-2026-000090` |
| `customerId` | int | FK → `customers.id`, SetNull, NULL | |
| `recommendationId` | int | FK → `recommendations.id`, SetNull, NULL | |
| `expectedValue` / `actualValue` | varchar(240) | NULL | The evidential pair |
| `explanation` | text | NOT NULL | Why it is invalid |
| `detectionRuleId` | varchar(40) | NOT NULL, UQ with category+entity+entityId | e.g. `RET-01` |
| `detectedAt` | timestamp(6) | NOT NULL | |
| `status` | enum | NOT NULL | `OPEN`,`INVESTIGATING`,`RESOLVED`,`IGNORED` |
| `resolvedAt` | timestamp(6) | NULL | |
| `resolutionNotes` | text | NULL | |
| `evidence` | jsonb | NOT NULL | Raw values, foreign keys, original state |
| `groundTruthRef` | varchar(40) | NULL | Reserved; unused by detectors |

---

## 16. `audit_events` — supporting

| Column | Type | Description |
|---|---|---|
| `id` | bigserial PK | |
| `actor` | varchar(60) | `system`, `pipeline`, `consent-guard`, `web-console`, … |
| `action` | varchar(80) | e.g. `CONSENT_VIOLATION_BLOCKED` |
| `entityType` / `entityId` | varchar | Subject |
| `customerId` | int FK → customers, SetNull | |
| `correlationId` | varchar(40) NULL | Reserved |
| `payload` | jsonb | Previous and new state |
| `createdAt` | timestamp(6) | |

Indexes: `(entityType, entityId)`, `createdAt`.

---

## 17. Run metadata

`generation_runs`: `runCode` UQ, `profile` enum, `seed`, `referenceDate`, counts, `status`, `datasetHash`, `config`
jsonb, `startedAt`/`completedAt`. One row per dataset load; the provenance anchor for every figure.

`segmentation_runs`: `runCode` UQ, `ruleVersion`, `asOfDate`, `customersScored`, `membershipsCreated`,
`conflictsDetected`, `unassignedCount`, `status`, timestamps.

`recommendation_runs`: `runCode` UQ, `ruleVersion`, `asOfDate`, `processed`, `eligibleCount`, `suppressedCount`,
`noActionCount`, `status`, timestamps.

`data_quality_runs`: `runCode` UQ, `totalRecordsChecked`, `checksPassed`, `checksFailed`, `warningCount`,
`exceptionCount`, `score` decimal(5,2), `datasetProfile`, `seed`, `summary` jsonb, timestamps.

`data_quality_issues`: `runId` FK → `data_quality_runs.id` Cascade, `ruleId`, `category`, `outcome` enum
(`PASS`/`WARNING`/`FAIL`), `severity`, `entityType`, `entityId`, `message`, `expected`, `actual`, `checkedAt`.
