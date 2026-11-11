# Architecture

## 1. Goals and constraints

The prototype had to be a genuine full-stack system — database, backend, data pipeline, connected UI — within a
hackathon time budget. The architecture is therefore optimised for **correctness and inspectability**, not for
horizontal scale:

- One PostgreSQL database, one API process, one Next.js process.
- Business rules in pure, testable modules.
- No business logic in React components, no SQL in controllers.
- Everything the UI shows must be traceable to a row.

## 2. Process topology

```
Browser ──▶ Next.js (3000) ──rewrite /api/*──▶ Express (4000) ──Prisma──▶ PostgreSQL (5433)
                                                     ▲
                                                     │ SQL
                                     Node pipeline scripts (tsx)
                                                     ▲
                                                     │ CSV (COPY)
                                          Python data engine
```

The browser only calls same-origin `/api/*`; `next.config.ts` proxies to the API. This removes CORS complexity from
the client and keeps the API independently testable.

## 3. Backend layering

```
routes (Express Router)
  └── middleware: validate(Zod) → controller
        └── service: business orchestration, no HTTP types
              └── repository: Prisma / SQL, no business decisions
```

Rules enforced in review:

| Layer | May contain | Must not contain |
|---|---|---|
| Controller | Zod schemas, HTTP status codes, response shaping | SQL, business rules |
| Service | Orchestration, transactions, engine invocation | `req`/`res`, raw SQL where Prisma suffices |
| Repository | Prisma queries, parameterised raw SQL | Business decisions |
| Engine (pure) | Scoring, eligibility, suppression, explanations | Database access, clocks, randomness |

Two modules are deliberately pure and DB-free so they can be unit tested and cross-validated:

- `backend/src/modules/segmentation/rfm.ts`
- `backend/src/modules/recommendations/recommendation-engine.ts`

## 4. Data flow

### 4.1 Ingestion

1. `python data-engine/main.py --profile <p> --seed <s>` writes one CSV per table plus `manifest.json`,
   ground truth and an injection manifest.
2. `backend/src/scripts/load-dataset.ts` truncates the analytics tables in one `TRUNCATE ... CASCADE` statement and
   streams each CSV through PostgreSQL `COPY ... FROM STDIN`. Row counts are verified against the manifest and each
   table's identity sequence is realigned to `MAX(id)`.
3. A `generation_runs` row records profile, seed, reference date, counts, dataset hash and config — this is the
   provenance anchor for every figure in the UI.

### 4.2 Segmentation

`SegmentationService.run()`:

1. `ensureSegmentRules()` upserts the 9 rule definitions (idempotent; ids stable).
2. One SQL statement computes per-customer metrics: completed orders, max order date, and monetary = 
   `SUM(shipping + tax + SUM(line.netLineTotal))`, plus support cost and open-case count.
   Monetary is derived from **order lines** so a corrupted order header cannot inflate it.
3. `scorePopulation()` assigns quintile scores across the whole population and a single segment per customer.
4. Memberships are diffed against current active rows: unchanged customers are skipped, changed customers get the
   old row closed (`SUPERSEDED`, `effectiveTo = asOf`) and a new `ACTIVE` row inserted. Those are two batched
   `updateMany`/`createMany` operations, not per-row writes.
5. A `segmentation_runs` row records counts, conflicts and unassigned customers.

`asOfDate` defaults to the dataset reference date from `generation_runs`, not to "now", so recency is stable and
reproducible.

### 4.3 Recommendations

`RecommendationService.run()` loads active memberships, customers, current marketing consents (per channel), support
status and last marketing contact, builds a context per customer, and calls the pure engine. Results are written in
bulk, then reasons are attached by mapping persisted ids.

Unique `(customerId, runId, actionId)` makes re-running a run idempotent.

### 4.4 Outcomes

`OutcomeService.simulate()` derives a deterministic PRNG stream per recommendation id, so the same seed and the same
recommendations always produce the same outcomes. Recommendations that already have an outcome are skipped, never
overwritten.

### 4.5 Detection and validation

`DetectorService` implements the four mandatory anomaly detectors plus the consent guard. `ValidationService` runs
27 SQL rules and persists one `data_quality_runs` row plus one `data_quality_issues` row per failing rule.

Detection is idempotent through the unique key `(category, entityType, entityId, detectionRuleId)`.

## 5. Key design decisions and trade-offs

| Decision | Rationale | Cost accepted |
|---|---|---|
| Integer paise arithmetic in the generator, `Decimal(14,2)` in PostgreSQL | Eliminates float drift so order arithmetic reconciles exactly | Slightly more verbose generator code |
| Monetary from order lines, not order header | Survives the "returns not netted" defect; the correct value wins | Requires a join per customer in scoring SQL |
| Quintile scoring over the population | Data-driven, no arbitrary thresholds | Cannot score one customer alone; boundaries move with the base |
| Single-assignment exclusive segments | Makes "conflict" meaningful and detectable | Requires careful rule ordering + explicit conflict handling |
| Append-only consent with `effectiveTo` | Regulatorily correct; history is evidence | Every read must filter on `effectiveTo IS NULL` |
| Ground truth as separate files, read only by evaluation | Prevents label leakage into engines | Duplicated rule logic in Python and TypeScript (deliberate cross-check) |
| `COPY` streaming instead of Prisma inserts | 1.7M child rows at full scale | Needs a raw `pg` client alongside Prisma |
| In-process job registry | No extra infrastructure | Job progress is lost on restart |

## 6. Failure handling

- `AppError` carries status + code; `errorHandler` maps Prisma `P2002/P2003/P2025` to 409/409/404 and logs unknown
  errors with stack traces, returning a generic 500 without leaking internals.
- Every request is logged with method, path, status and duration.
- Pipeline scripts fail loudly (`exit 1`) and mark the run row `FAILED`.
- The UI surfaces API error messages instead of empty states, and never renders fabricated fallback numbers.

## 7. Security posture

- `helmet`-style hardening is out of scope for a local build; CORS is restricted to the configured origin.
- No credentials are committed. `.env` is ignored; `.env.example` contains no secrets.
- The local PostgreSQL cluster uses trust auth bound to localhost and lives in an ignored directory.
- The API performs no dynamic SQL string interpolation: all raw queries use `Prisma.sql` parameters.
- LLM calls are optional, time-boxed (12 s) and receive only already-computed facts.

## 8. Extension points

- Swap `LLM_BASE_URL` for any OpenAI-compatible endpoint; the decision layer is untouched.
- Add a segment rule by appending to `SEGMENT_DEFINITIONS` and bumping the rule version.
- Add an action by appending to `ACTION_CATALOG` with eligibility/suppression JSON.
- Replace the outcome simulator with a real campaign webhook by calling `POST /api/outcomes`.
