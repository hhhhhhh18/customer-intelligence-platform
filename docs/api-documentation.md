# API documentation

Base URL: `http://localhost:4000/api`
Content type: `application/json`
Authentication: none (see README §16 and known limitation 1).

## Conventions

**Pagination** — every list endpoint accepts `page` (default 1), `pageSize` (default 25, max 200) and returns:

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 25, "total": 500, "totalPages": 20, "hasNext": true }
}
```

**Sorting** — `sortBy` + `sortDir` (`asc` | `desc`) where the endpoint documents sortable fields.

**Errors** — a single envelope shape, always:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request query",
    "details": [{ "path": "pageSize", "message": "Number must be less than or equal to 200", "code": "too_big" }]
  }
}
```

| Code | HTTP | Cause |
|---|---|---|
| `BAD_REQUEST` / `UNPROCESSABLE_ENTITY` | 400/422 | Zod validation failure |
| `NOT_FOUND` | 404 | Unknown id/code, or unknown route (`ROUTE_NOT_FOUND`) |
| `CONFLICT` | 409 | Duplicate consent state |
| `UNIQUE_VIOLATION` / `FOREIGN_KEY_VIOLATION` | 409 | Prisma constraint violation |
| `INTERNAL_ERROR` | 500 | Unhandled error (details only in server logs) |

---

## Health

### GET /health

```json
{ "status": "ok", "service": "customer-intelligence-api", "env": "development", "ts": "2026-11-11T06:30:00.000Z" }
```

### GET /dashboard/health

```json
{ "data": { "status": "ok", "database": "connected",
  "counts": { "customers": 500, "orders": 2000, "events": 10000 },
  "checks": { "segmentation": 1, "recommendations": 1, "validation": 2 } } }
```

---

## Dashboard

### GET /dashboard/summary

Returns every figure used on `/dashboard`.

```json
{
  "data": {
    "kpis": {
      "totalCustomers": 500, "totalOrders": 2000, "totalNetRevenue": 57271375.16,
      "activeCustomers": 355, "dormantCustomers": 145, "atRiskCustomers": 101,
      "eligibleRecommendations": 376, "suppressedRecommendations": 45, "totalRecommendations": 501,
      "openExceptions": 4, "engagementEvents": 10000, "supportCases": 565,
      "dataQualityScore": 100, "outcomeSuccessRate": 26.6
    },
    "segmentDistribution": [{ "slug": "champions", "name": "Champions", "count": 81, "share": 16.2 }],
    "purchaseTrend": [{ "month": "2025-12", "orders": 210, "revenue": 5243911.2, "customers": 168 }],
    "rfmDistribution": [{ "score": 5, "band": "R", "count": 100 }],
    "recommendationDistribution": [{ "action": "Loyalty Reward", "slug": "loyalty-reward", "eligible": 61, "suppressed": 20, "noAction": 0 }],
    "outcomePerformance": [{ "action": "Loyalty Reward", "success": 24, "failure": 11, "noResponse": 26, "revenue": 128411.2 }],
    "exceptionBreakdown": [{ "category": "RETURN_NOT_NETTED", "count": 1 }],
    "recentExceptions": [ ... ],
    "topSegments": [{ "name": "Champions", "slug": "champions", "revenue": 25117422.1, "customers": 80 }],
    "engagementTrend": [{ "month": "2026-10", "events": 1830 }],
    "supportSummary": [{ "status": "RESOLVED", "count": 371 }],
    "dataset": { "profile": "SMALL", "seed": 20261022, "referenceDate": "2026-11-01T00:00:00.000Z",
                 "customerCount": 500, "orderCount": 2000, "eventCount": 10000,
                 "datasetHash": "98620a33...", "loadedAt": "2026-11-11T05:29:00.000Z" }
  }
}
```

Net revenue is computed as `SUM(grossTotal - lineRefunds)` for non-cancelled orders, so the labelled
return-reconciliation defect cannot inflate it.

---

## Customers

### GET /customers

| Query | Type | Notes |
|---|---|---|
| `search` | string | Matches first/last name, email, customer code (digits are normalised) |
| `segmentSlug` | string | e.g. `at-risk-customers` |
| `consentStatus` | `GRANTED` \| `WITHDRAWN` \| `NONE` | Email marketing consent |
| `lifecycle` | `ACTIVE` \| `DORMANT` \| `CHURNED` \| `BLOCKED` | |
| `minRfm` / `maxRfm` | int 111–555 | Inclusive |
| `hasOpenCase` | `true` \| `false` | Open/in-progress/escalated case |
| `sortBy` | `customerCode` \| `name` \| `signupDate` \| `totalOrders` \| `netSpend` \| `lastPurchase` \| `rfmScore` | |

```json
{ "data": [{
    "id": 17, "customerCode": "CUS-000017", "firstName": "Aarav", "lastName": "Sharma",
    "email": "aarav.sharma.17@example.com", "signupDate": "2024-06-02T00:00:00.000Z",
    "lifecycle": "ACTIVE", "totalOrders": 9, "netSpend": "184230.50",
    "lastPurchase": "2026-10-22T00:00:00.000Z", "rfmScore": 544,
    "rScore": 5, "fScore": 4, "mScore": 4,
    "segmentSlug": "champions", "segmentName": "Champions", "consentStatus": "GRANTED"
  }],
  "meta": { "page": 1, "pageSize": 25, "total": 500, "totalPages": 20, "hasNext": true } }
```

### GET /customers/:idOrCode

Accepts numeric id or `CUS-000017`. Returns `customer`, `metrics`, `rfm`, `segment`, `membershipHistory`, `orders`
(with lines), `engagement`, `supportCases`, `consents`, `contactPreferences`, `recommendations` (with reasons and
outcomes), `outcomes`, `exceptions`.

`404` when the customer does not exist.

---

## Segmentation

### GET /segments

```json
{ "data": [{
  "segmentCode": "SEG-2026-000002", "slug": "champions", "name": "Champions",
  "category": "VALUE", "priority": 20, "isExclusive": true, "ruleVersion": "rfm-v1.0.0",
  "criteria": { "all": [{ "field": "rScore", "op": ">=", "value": 4 }] },
  "explanation": "rScore >= 4 and fScore >= 4 and mScore >= 4.",
  "customerCount": 81, "shareOfBase": 16.2
}] }
```

### POST /segments/run

Body: `{ "asOfDate": "2026-11-01", "actor": "web-console" }` (both optional).

```json
{ "data": {
  "runCode": "SEG-20261111121500", "asOfDate": "2026-11-01", "ruleVersion": "rfm-v1.0.0",
  "customersScored": 500, "membershipsCreated": 1, "membershipsSuperseded": 0,
  "unchanged": 499, "unassigned": 0, "conflictsDetected": 1,
  "durationMs": 412, "segmentCounts": [{ "slug": "champions", "name": "Champions", "count": 81 }]
} }
```

Returns `201`. Re-running is idempotent for unchanged customers.

### GET /segments/conflicts

```json
{ "data": [{
  "customerId": 50, "customerCode": "CUS-000050", "multipleActiveSegments": true,
  "explanation": "Both memberships are marked ACTIVE on segments flagged exclusive...",
  "segments": [
    { "membershipCode": "MEM-SEG-2026-000006-CUS-000050", "segmentCode": "SEG-2026-000006",
      "name": "Loyal Customers", "slug": "loyal-customers", "ruleVersion": "rfm-v1.0.0",
      "assignedAt": "2026-11-11T05:30:00.000Z" },
    { "membershipCode": "MEM-SEG-2026-000002-CUS-000050-IMP", "segmentCode": "SEG-2026-000002",
      "name": "Champions", "slug": "champions", "ruleVersion": "legacy-import-v0",
      "assignedAt": "2026-11-11T05:33:00.000Z" }
  ]
}] }
```

### GET /segments/runs

Latest 10 `segmentation_runs` rows.

---

## Recommendations

### GET /recommendations

Filters: `segmentSlug`, `actionSlug`, `eligibility` (`ELIGIBLE`|`SUPPRESSED`|`NO_ACTION`),
`suppression` (`SUPPRESSED_CONSENT`, `SUPPRESSED_OPEN_SUPPORT_CASE`, `SUPPRESSED_ACTIVE_COMPLAINT`,
`SUPPRESSED_RECENT_CONTACT`, `SUPPRESSED_CONTACT_PREFERENCE`, `NOT_SUPPRESSED`), `status`, `search`.

```json
{ "data": [{
  "id": 120, "recommendationCode": "REC-2026-000120", "recommendedAt": "2026-11-11T05:31:00.000Z",
  "eligibility": "SUPPRESSED", "suppressionResult": "SUPPRESSED_CONSENT", "status": "SUPPRESSED",
  "explanation": "Marketing action suppressed because the customer withdrew EMAIL marketing consent...",
  "ruleVersion": "nba-v1.0.0", "score": "120.000",
  "customer": { "id": 20, "customerCode": "CUS-000020", "firstName": "Ishaan", "lastName": "Nair", "email": "..." },
  "action": { "name": "Promotional Discount", "slug": "promotional-discount", "isPromotional": true,
              "actionType": "PROMOTIONAL_DISCOUNT", "channel": "EMAIL" },
  "segment": { "name": "Lost Customers", "slug": "lost-customers" }
}] }
```

### GET /recommendations/:id

Adds `action` (full row), `reasons[]` ordered by weight, `inputMetrics`, `outcomes[]`, `customer`.

### POST /recommendations/run

Returns `201`:

```json
{ "data": { "runCode": "REC-20261111121510", "processed": 500, "eligible": 376, "suppressed": 31,
  "noAction": 80, "consentSuppressed": 0, "durationMs": 9800,
  "byAction": [{ "action": "no-action", "count": 80 }] } }
```

### POST /recommendations/:id/explain

Body: none. Returns `{ "explanation": "...", "source": "deterministic" | "llm" }`.
With no `LLM_API_KEY` the deterministic text is returned unchanged — the endpoint never alters the decision.

---

## Consent

### GET /consent

Filters: `search`, `channel`, `purpose`, `status`, `currentOnly=true`.

```json
{ "data": [{
  "id": 418, "consentCode": "CNS-000418", "channel": "EMAIL", "purpose": "MARKETING",
  "status": "WITHDRAWN", "source": "PREFERENCE_CENTRE",
  "effectiveFrom": "2025-09-01T10:00:00.000Z", "effectiveTo": null,
  "withdrawnAt": "2025-09-01T10:00:00.000Z",
  "customer": { "customerCode": "CUS-000020", "firstName": "Ishaan", "lastName": "Nair",
                "email": "...", "preferredChannel": "EMAIL" }
}] }
```

### POST /consent

```json
{ "customerCode": "CUS-000020", "channel": "EMAIL", "purpose": "MARKETING",
  "status": "WITHDRAWN", "source": "WEB_CONSENT_CONSOLE", "notes": "Customer request by phone" }
```

`201` response includes the new record, the closed previous record, and the live impact:

```json
{ "data": { "consent": { ... }, "previousConsentCode": "CNS-000417", "suppressedRecommendations": 1 } }
```

`409` if the triple is already in that state; `400` if `effectiveFrom` precedes the current record; `404` for an
unknown customer.

### GET /consent/summary

```json
{ "data": { "byChannel": [{ "channel": "EMAIL", "granted": 455, "withdrawn": 44, "pending": 0 }],
  "totalCustomers": 500, "emailReachableCustomers": 455, "suppressionRate": 9 } }
```

---

## Exceptions

### GET /exceptions

Filters: `category`, `severity`, `status`, `search`. Returns `exceptionCode`, `category`, `severity`, `entityType`,
`entityId`, `expectedValue`, `actualValue`, `explanation`, `detectionRuleId`, `detectedAt`, `status`, `evidence`,
`customer`, `recommendation`.

### GET /exceptions/:id

Adds the full `evidence` JSON payload (e.g. both conflicting memberships, or `refundSum`/`expectedNetTotal`/
`actualNetTotal`/`discrepancy`).

### POST /exceptions/scan

```json
{ "data": { "startedAt": "...", "finishedAt": "...", "totalOpen": 4,
  "detectors": [
    { "category": "SEGMENT_CONFLICT", "detected": 1, "blocked": 0, "durationMs": 22 },
    { "category": "CONSENT_VIOLATION", "detected": 1, "blocked": 1, "durationMs": 31 },
    { "category": "RETURN_NOT_NETTED", "detected": 1, "blocked": 0, "durationMs": 18 },
    { "category": "OUTCOME_ATTRIBUTION", "detected": 1, "blocked": 0, "durationMs": 12 }
  ] } }
```

`blocked` counts recommendations that were downgraded to `SUPPRESSED` by the consent guard.

### PATCH /exceptions/:id

```json
{ "status": "RESOLVED", "resolutionNotes": "Corrected in source system", "actor": "analyst" }
```

Allowed transitions: `INVESTIGATING`, `RESOLVED`, `IGNORED`. An audit event is written for each change.

---

## Outcomes

### GET /outcomes

Filters: `status`, `actionSlug`, `segmentSlug`.

### GET /outcomes/metrics

```json
{ "data": {
  "totalOutcomes": 376,
  "byStatus": { "success": 100, "failure": 79, "noResponse": 197, "pending": 0 },
  "eligibleRecommendations": 376, "acceptedActions": 179, "completedActions": 179,
  "conversionRate": 26.6, "acceptanceRate": 47.6, "outcomeSuccessRate": 55.87,
  "revenueAttributed": 337338.44,
  "segmentPerformance": [{ "segment": "Champions", "outcomes": 81, "successes": 24, "revenue": 128411.2, "successRate": 29.63 }],
  "actionPerformance": [{ "action": "Loyalty Reward", "outcomes": 61, "successes": 24, "revenue": 128411.2, "successRate": 39.34 }],
  "note": "Revenue is attributed to recorded successful outcomes only. No causal uplift or incrementality is claimed because there is no control group."
} }
```

### POST /outcomes

```json
{ "recommendationCode": "REC-2026-000120", "actionSlug": "loyalty-reward", "status": "SUCCESS",
  "revenueAttributed": 4200, "channel": "EMAIL", "notes": "Purchase after offer" }
```

If `actionSlug` does not match the recommendation's action, the response is still `201` but includes
`warnings: ["Recorded action does not match the recommendation action..."]`, the row is stored with
`isAttributionValid = false`, and an `OUTCOME_ATTRIBUTION` exception is created.

### POST /outcomes/simulate

Body: `{ "seed": 20261022 }` (optional). Returns counts plus `skippedExisting`.

---

## Data quality

### GET /data-quality

```json
{ "data": {
  "runCode": "DQ-20261111121600", "score": "100.00",
  "totalRecordsChecked": 50619, "checksPassed": 27, "checksFailed": 0, "warningCount": 3, "exceptionCount": 4,
  "summary": { "checks": [ ... ], "evaluation": { ... }, "volumes": { ... }, "ruleVersion": "dq-v1.0.0" },
  "issues": [], "volumes": { "customers": 500, ... }, "generation": { "seed": 20261022, "datasetHash": "..." },
  "catalogue": [ { "ruleId": "DQ-FK-01", "severity": "CRITICAL", "description": "..." } ]
} }
```

### POST /data-quality/run (alias POST /data/validate)

Runs all 27 rules and returns per-rule results plus the ground-truth evaluation. `201`.

### POST /data/generate

```json
{ "profile": "small", "seed": 20261022, "runPipeline": true }
```

Returns `202 { "data": { "jobId": "...", "status": "RUNNING" } }`. Poll `GET /data/jobs/:id`:

```json
{ "data": { "id": "...", "status": "COMPLETED", "progress": ["... generating ...", "... loading ..."],
            "result": { ... } } }
```

`runPipeline: true` chains generation → load → segmentation → recommendations → outcomes → injection → detection
→ validation.

---

## Orders, products, engagement, support, audit

| Endpoint | Notes |
|---|---|
| `GET /orders?status=&customerCode=&channel=&from=&to=&withReturnsOnly=` | Includes line count |
| `GET /orders/:orderCode` | Lines with product + category, related outcomes |
| `GET /products?limit=10` | Top products by revenue, units, refunds |
| `GET /products/categories` | Two-level taxonomy |
| `GET /engagement/summary` | Totals by type, channel, month |
| `GET /engagement/recent?customerCode=&limit=` | Recent events |
| `GET /support/cases?status=&priority=&customerCode=&unresolvedOnly=` | Case list |
| `GET /support/summary` | Counts, handling cost, average satisfaction |
| `GET /audit?limit=` | Recent audit events |
| `GET /pipeline/status` | Last 5 segmentation/recommendation runs and validations |
