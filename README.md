# Customer Intelligence & Action Recommendation Platform

A working, end-to-end prototype built for the **YottaFlex.ai Associate AI Forward Deployed Engineer** hackathon.

The platform ingests customer, order, product, engagement, support and consent data, segments the base with
deterministic RFM rules, recommends a next-best action per customer with an explainable reason, enforces marketing
consent before any action can become executable, tracks action outcomes, and detects four classes of business
exceptions without ever rewriting history.

Everything you see in the UI is computed from PostgreSQL rows. No dashboard figure, segment, recommendation or
outcome is hardcoded.

---

## 1. Project overview

| Capability | Implementation |
|---|---|
| Customer intelligence | 11 core entities + 9 supporting entities, 500 customers / 2,000 orders / 10,000 engagement events loaded by default |
| Segmentation | Quintile RFM scoring with a 9-segment exclusive decision tree, versioned as `rfm-v1.0.0` |
| Recommendations | Deterministic rule engine (`nba-v1.0.0`), 8-action catalogue, consent-first suppression |
| Consent | Append-only history; withdrawal closes the previous record and immediately suppresses live promotions |
| Exceptions | 4 mandatory anomaly categories + 23 database-level validation rules |
| Outcomes | Deterministic seeded simulation linked to real recommendations; revenue attributed only to successes |
| Evaluation | Independent Python ground truth, 100% segment agreement, 4/4 anomaly detection |

### Measured state of the shipped dataset

| Metric | Value |
|---|---|
| Customers | 500 |
| Orders / order lines | 2,000 / 4,627 |
| Engagement events | 10,000 |
| Support cases | 565 |
| Consent records (history) | 2,419 |
| Products / categories | 60 / 17 |
| Segment memberships (active) | 501 (500 customers + 1 deliberately injected conflict row) |
| Recommendations | 501 → **376 eligible**, 45 suppressed, 80 no-action |
| Recommendation reasons | 2,186 |
| Action outcomes | 376 → 100 success, 79 failure, 197 no response |
| Revenue attributed to successful outcomes | ₹337,338.44 |
| Exceptions | 4 (one per mandatory category) |
| Validation | **100.00%**, 27/27 rules passed, 3 expected anomalies, 0 unexpected failures, 50,619 records checked |
| Seed / reference date | 20261022 / 2026-11-01 |
| Dataset hash | `98620a33304967ab47c4b87476281654b4a39d4685146874cdd7f8ba2c551512` |

These figures come from the live database (`scripts/_metrics.sql` reproduces them).

---

## 2. Business problem

Businesses hold large amounts of customer data but struggle to answer operational questions:

- Who are the most valuable customers, and who is quietly becoming inactive?
- Which customers are at risk of churn, and which are new?
- Which customers need service recovery rather than marketing?
- Who is eligible for a promotional offer — and who must be excluded because consent was withdrawn?
- *Why* was a particular action recommended?
- Did the action work?

The system must make these decisions **explainable, traceable, measurable and reproducible**. A recommendation that
cannot be explained is not usable; a promotional action sent to a customer who withdrew consent is a compliance
breach, not a modelling error.

---

## 3. Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  Next.js 15 (App Router)   │        │  Express + TypeScript API    │
│  React 19 · TypeScript     │  HTTP  │  routes → controllers →      │
│  Tailwind · shadcn/ui      │ ─────▶ │  services → repositories     │
│  Recharts · Lucide         │ /api/* │  Zod validation · logging    │
└────────────────────────────┘        └──────────────┬───────────────┘
                                                     │ Prisma
                                      ┌──────────────▼───────────────┐
                                      │  PostgreSQL 17               │
                                      │  20 tables, FKs, indexes     │
                                      └──────────────▲───────────────┘
                                                     │ COPY (streamed)
┌────────────────────────────┐        ┌──────────────┴───────────────┐
│ Python data engine         │        │ Node pipeline scripts        │
│ pandas / numpy, seeded     │ ─────▶ │ load → segment → recommend → │
│ CSV exports + ground truth │  CSV   │ outcomes → inject → detect → │
└────────────────────────────┘        │ validate                     │
                                      └──────────────────────────────┘
```

Deliberate boundaries:

- **Frontend contains no business logic.** It renders API responses and triggers commands.
- **Controllers contain no database queries.** They validate input and delegate to services.
- **Engines contain no I/O.** `rfm.ts` and `recommendation-engine.ts` are pure functions, unit-tested without a database.
- **Ground truth is never imported by an engine.** Only the evaluation module and tests read it.
- **The LLM is optional.** With no API key every explanation is generated deterministically.

Detailed design: [docs/architecture.md](docs/architecture.md).

---

## 4. Technology stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3.4, shadcn/ui-style components on Radix primitives, Recharts, Lucide |
| Backend | Node.js 22, Express 4, TypeScript, Zod |
| Database | PostgreSQL 17, Prisma ORM 6 |
| Data engineering | Python 3.12, pandas, NumPy, deterministic generators |
| Testing | Vitest + Supertest |
| Tooling | npm, PowerShell helper scripts, optional Docker Compose |

No Kubernetes, no microservices, no message broker — a single API process and a single Next.js process.

---

## 5. Folder structure

```
customer-intelligence-platform/
├── frontend/
│   └── src/
│       ├── app/{dashboard,customers,segments,recommendations,consent,exceptions,outcomes,data-quality}/
│       ├── components/{layout,dashboard,customers,segments,recommendations,charts,common,ui}/
│       ├── services/api.ts
│       ├── hooks/use-api.ts
│       ├── types/
│       └── lib/utils.ts
├── backend/
│   ├── src/
│   │   ├── config/env.ts
│   │   ├── db/prisma.ts
│   │   ├── modules/{customers,orders,products,engagement,support,consent,segmentation,
│   │   │            recommendations,outcomes,exceptions,analytics,data-quality,audit}/
│   │   ├── middleware/{validate,error-handler,request-logger}.ts
│   │   ├── utils/{ids,pagination,errors,logger,prng,llm,job-runner}.ts
│   │   ├── scripts/{load-dataset,inject-anomalies,run-full-pipeline,run-segmentation,
│   │   │            run-recommendations,run-validation}.ts
│   │   ├── app.ts
│   │   └── server.ts
│   └── tests/
├── database/
│   ├── prisma/{schema.prisma,migrations/}
│   ├── sql/
│   └── data-dictionary.md
├── data-engine/
│   ├── generators/
│   ├── validators/
│   ├── ground_truth/
│   ├── exports/
│   ├── config.py
│   └── main.py
├── docs/
├── scripts/
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

## 6. Database schema overview

20 tables. Every table has a primary key, explicit foreign keys with `ON DELETE` behaviour, unique business
identifiers, and creation timestamps; mutable entities carry `updatedAt`.

**Core (11):** `customers`, `orders`, `order_lines`, `products`, `engagement_events`, `support_cases`, `consents`,
`segment_rules`, `segment_memberships`, `action_catalog`, `action_outcomes`.

**Supporting:** `product_categories`, `recommendations`, `recommendation_reasons`, `exception_records`,
`audit_events`, `generation_runs`, `segmentation_runs`, `recommendation_runs`, `data_quality_runs`,
`data_quality_issues`.

Design rules applied:

- **History is append-only.** A consent change closes the previous row with `effectiveTo` and inserts a new row.
  Segment memberships are superseded, never deleted. Recommendations and outcomes are never rewritten — only
  lifecycle status changes, with the previous values captured in `audit_events`.
- **Identifiers.** Internal `Int`/`BigInt` keys for joins; immutable business codes (`CUS-000001`, `ORD-2026-000001`,
  `SEG-2026-000001`, `ACTN-2026-000001`, `REC-2026-000001`, `OUTC-000001`, `EXC-000001`, `CNS-000001`) are unique.
- **Constraints.** `@@unique([segmentId, customerId, effectiveFrom])` on memberships,
  `@@unique([customerId, channel, purpose, effectiveFrom])` on consent,
  `@@unique([customerId, runId, actionId])` on recommendations, and
  `@@unique([category, entityType, entityId, detectionRuleId])` on exceptions — the last one makes detection
  idempotent without duplicating evidence.
- **Indexes** on every foreign key plus the access paths used by the UI (`orders(customerId, orderDate)`,
  `engagement_events(customerId, occurredAt)`, `recommendations(eligibility, suppressionResult)`, …).

Full column-level reference: [database/data-dictionary.md](database/data-dictionary.md).

---

## 7. Entity relationships

```
customers 1─┬─* orders 1─* order_lines *─1 products *─1 product_categories (self-referencing tree)
            ├─* engagement_events
            ├─* support_cases
            ├─* consents
            ├─* segment_memberships *─1 segment_rules
            ├─* recommendations *─1 action_catalog
            │        │             *─1 segment_rules
            │        └─* recommendation_reasons
            ├─* action_outcomes *─1 recommendations
            └─* exception_records
```

Cardinality summary:

| Relationship | Cardinality |
|---|---|
| Customer → Orders | 1 : N |
| Order → OrderLines | 1 : N |
| Product → OrderLines | 1 : N |
| Customer → EngagementEvents | 1 : N |
| Customer → SupportCases | 1 : N |
| Customer → Consents | 1 : N (history) |
| Customer ↔ Segments | N : M via `segment_memberships` |
| Action → Recommendations | 1 : N |
| Recommendation → ActionOutcomes | 1 : N |
| Recommendation → RecommendationReasons | 1 : N |

Details and invariants: [docs/entity-relationships.md](docs/entity-relationships.md).

---

## 8. Data generation

```powershell
# Small development dataset (default)
python data-engine/main.py --profile small

# Medium / full scale
python data-engine/main.py --profile medium
python data-engine/main.py --profile full --seed 20261022

# Then load it
npm --prefix backend run data:load
```

Profiles: `small` = 500 customers / 2,000 orders / 10,000 events; `medium` = 5,000 / 20,000 / 100,000;
`full` = 50,000 / 200,000 / 1,000,000.

Generation is deterministic: parent records are created before children, every child references a real parent id,
all monetary values are computed as integer paise and exported with two decimals, and derived totals are computed
from source records rather than invented. The generator also writes an independent ground-truth set and a labelled
anomaly manifest to `data-engine/ground_truth/`.

Full detail including the archetype model: [docs/data-generation.md](docs/data-generation.md).

### Synthetic data provenance statement

> All data in this project is synthetic and was produced by the generator in `data-engine/` from a fixed seed.
> It contains no real individuals, no real customer records and no data licensed from a third party. Names,
> emails and phone numbers are generated placeholders. The dataset exists solely to demonstrate business logic
> and must not be used for any production or benchmarking claim about a real business.

---

## 9. Fixed seed configuration

| Setting | Default | Where |
|---|---|---|
| Seed | `20261022` | `data-engine/config.py` (`DEFAULT_SEED`), `.env` (`DATA_SEED`) |
| Reference date | `2026-11-01` | `data-engine/config.py` (`DEFAULT_REFERENCE_DATE`) |
| Profile | `small` | `.env` (`DATA_PROFILE`) |

Reproducibility is proven two ways:

1. The generator writes a `datasetHash` (SHA-256 over every export file hash) into `data-engine/exports/manifest.json`;
   re-running with the same seed produces an identical hash.
2. `backend/tests/reproducibility.test.ts` generates the same profile twice and asserts hash equality, then
   generates a different seed and asserts inequality.

Current dataset hash: `98620a33304967ab47c4b87476281654b4a39d4685146874cdd7f8ba2c551512`.

---

## 10. Environment variable setup

```powershell
Copy-Item .env.example .env
Copy-Item .env.example backend/.env
```

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres@localhost:5433/customer_intelligence?schema=public` |
| `PORT` | API port | `4000` |
| `NODE_ENV` | Runtime mode | `development` |
| `CORS_ORIGIN` | Allowed browser origin(s) | `http://localhost:3000` |
| `LOG_LEVEL` | Log verbosity | `info` |
| `DATA_SEED` | Seed used by simulation scripts | `20261022` |
| `DATA_PROFILE` | Default dataset profile | `small` |
| `LLM_API_KEY` | **Optional.** Enables narrative rewriting only | empty |
| `LLM_MODEL` | Optional model name | empty |
| `LLM_BASE_URL` | Optional OpenAI-compatible base URL | `https://api.openai.com/v1` |

`.env` is git-ignored. `.env.example` contains no secrets. With `LLM_API_KEY` empty the application is fully
functional and every explanation comes from the rule engine.

This machine uses a **project-local PostgreSQL cluster on port 5433** (`.pgdata/`) so the build is reproducible
without touching a system-wide server. `scripts/db-start.ps1` initialises and starts it.

---

## 11. Database migration commands

```powershell
npm --prefix backend run db:generate   # prisma generate (client only)
npm --prefix backend run db:migrate    # prisma migrate dev
npm --prefix backend run db:seed       # seeds segment rules + action catalogue
```

Applied migrations:

- `20261111060512_init_customer_intelligence`
- `updated_at_db_defaults`

The schema lives at `database/prisma/schema.prisma`; the generated client is written to
`backend/generated/prisma/` (outside `src/`, so `dist/` resolves the same relative path as `tsx` does) and is
git-ignored.

---

## 12. Backend startup

```powershell
pwsh -File scripts/db-start.ps1        # start PostgreSQL on 5433
npm --prefix backend install
npm --prefix backend run db:generate
npm --prefix backend run db:migrate
npm --prefix backend run data:load     # load an existing export
npm --prefix backend run dev           # http://localhost:4000
```

One-shot bootstrap (database → migrate → generate → load → segment → recommend → outcomes → detect → validate):

```powershell
pwsh -File scripts/run-pipeline.ps1 -Profile small
```

---

## 13. Frontend startup

```powershell
npm --prefix frontend install
npm --prefix frontend run dev          # http://localhost:3000
```

`next.config.ts` rewrites `/api/*` to `http://localhost:4000/api/*`, so the browser never needs CORS.

Both processes at once:

```powershell
pwsh -File scripts/dev.ps1
```

---

## 14. Data validation command

```powershell
npm --prefix backend run validate       # runs the 27-rule validation engine, prints a summary
# or
curl -X POST http://localhost:4000/api/data/validate
```

The latest run is persisted in `data_quality_runs` and rendered on `/data-quality`, including per-rule results,
dataset volumes, ground-truth evaluation and reproducibility metadata.

---

## 15. Testing instructions

```powershell
npm --prefix backend test              # full suite
npm --prefix backend test -- rfm       # single file
```

**Current result: 6 test files, 62 tests, all passing.**

| File | Covers |
|---|---|
| `rfm.test.ts` | Quintile scoring, tie handling, all 9 segment rules, population scoring |
| `recommendation-engine.test.ts` | Action mapping, consent per channel, complaint suppression, no-action decisions |
| `data-integrity.test.ts` | FK orphans, order arithmetic, return reconciliation, consent uniqueness, membership invariants |
| `edge-cases.test.ts` | The four mandatory anomalies end-to-end, incl. corrected monetary value and preserved evidence |
| `api.test.ts` | 13 API contract tests: pagination, validation errors, 404s, consent conflict, exception categories |
| `reproducibility.test.ts` | Fixed-seed hash equality/inequality and profile proportionality |

Tests require a loaded database (they assert on real rows) and Python available on PATH for the reproducibility file.

---

## 16. Demo credentials

Authentication is **not implemented** in this prototype, so there are no credentials to share. The API is open on
`localhost` for evaluation. This is documented as a known limitation below.

---

## 17. API endpoint documentation

Base URL: `http://localhost:4000/api`. All list endpoints accept `page`, `pageSize` (max 200), `sortBy`, `sortDir`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + database counts |
| GET | `/dashboard/summary` | All KPIs, segment mix, trends, RFM distribution, action performance |
| GET | `/customers` | Filter by `search`, `segmentSlug`, `consentStatus`, `lifecycle`, `minRfm`, `maxRfm`, `hasOpenCase` |
| GET | `/customers/:idOrCode` | Full profile: orders, events, cases, consent history, RFM, memberships, recommendations |
| GET | `/segments` | 9 segments with counts, share, criteria, rule version |
| GET | `/segments/conflicts` | Customers holding >1 active exclusive segment |
| GET | `/segments/runs` | Segmentation run history |
| POST | `/segments/run` | Execute segmentation (`{ asOfDate? }`) |
| GET | `/recommendations` | Filter by `segmentSlug`, `actionSlug`, `eligibility`, `suppression`, `status`, `search` |
| GET | `/recommendations/:id` | Decision, reasons, input metrics, outcomes |
| POST | `/recommendations/run` | Execute the recommendation engine |
| POST | `/recommendations/:id/explain` | Optional LLM narrative (deterministic fallback) |
| GET | `/actions` | Action catalogue |
| GET | `/consent` | Consent history (`currentOnly=true` for current state) |
| GET | `/consent/summary` | Reachability and suppression rate by channel |
| GET | `/consent/customer/:code` | Consent history for one customer |
| POST | `/consent` | Append a consent change; withdrawing suppresses live promotions immediately |
| GET | `/exceptions` | Filter by `category`, `severity`, `status`, `search` |
| GET | `/exceptions/summary` | Counts by category/severity/status |
| GET | `/exceptions/:id` | Full evidence payload |
| PATCH | `/exceptions/:id` | Set status `INVESTIGATING` \| `RESOLVED` \| `IGNORED` |
| POST | `/exceptions/scan` | Run all four detectors |
| GET | `/outcomes` | Outcome records with filters |
| GET | `/outcomes/metrics` | Funnel, conversion, revenue, segment and action performance |
| POST | `/outcomes` | Record a downstream outcome (mismatch is stored, flagged, and raises an exception) |
| POST | `/outcomes/simulate` | Deterministic seeded outcome generation |
| GET | `/data-quality` | Latest validation run + issues + volumes + generation metadata |
| POST | `/data-quality/run` \| `/data/validate` | Execute validation |
| POST | `/data/generate` | Async job: regenerate dataset, reload, re-run pipeline |
| GET | `/data/jobs/:id` | Job status and progress log |
| GET | `/orders`, `/orders/:code` | Order list/detail with lines |
| GET | `/products`, `/products/categories` | Top products, taxonomy |
| GET | `/engagement/summary`, `/engagement/recent` | Event breakdown and timeline |
| GET | `/support/cases`, `/support/summary` | Case list and service-cost summary |
| GET | `/audit` | Recent audit events |

Error envelope (consistent everywhere):

```json
{ "error": { "code": "BAD_REQUEST", "message": "Invalid request query", "details": [{ "path": "pageSize", "message": "Number must be less than or equal to 200" }] } }
```

Status codes: `200` read, `201` created/executed, `202` accepted async job, `400` validation, `404` missing,
`409` conflict/unique violation, `500` unexpected.

Full request/response examples: [docs/api-documentation.md](docs/api-documentation.md).

---

## 18. Known limitations

1. **No authentication or authorisation.** Single-tenant local evaluation build; every endpoint is open. Production
   would need OAuth/SSO, per-tenant row scoping and an audit actor derived from the authenticated principal.
2. **Outcomes are simulated, not observed.** `action_outcomes` is produced by a deterministic seeded model. It is
   internally consistent and traceable, but it is not evidence of real campaign performance.
3. **No causal uplift measurement.** There is no control group or holdout, so the platform reports attributed
   revenue and conversion rates only, and explicitly refuses to claim incrementality.
4. **Quintile scoring is population-relative.** Scores cannot be computed for one customer in isolation, and a
   material change in the customer base shifts the boundaries. This is intentional and documented, and the rule
   version is stored on every membership.
5. **Single-process job runner.** Dataset regeneration runs in-process with an in-memory job registry; restarting the
   API loses job progress (the data itself is already committed). A real deployment needs a durable queue.
6. **Full-scale generation is configurable but was validated at `small` and by unit-level proportions only.** The
   `full` profile (50,000 / 200,000 / 1,000,000) is implemented and uses streamed `COPY`, but the shipped database
   contains the `small` dataset so the evaluation environment stays fast.
7. **LLM integration is optional and shallow by design.** It rewrites an already-decided explanation; it never
   influences eligibility, suppression, scoring or any monetary value.
8. **Docker Compose is provided but was not exercised here** because the Docker daemon was unavailable on this
   machine; the native PostgreSQL + scripts path is the verified one (see §11–13).

