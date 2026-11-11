# Final acceptance report

**Project:** Customer Intelligence & Action Recommendation Platform
**Target:** YottaFlex.ai Associate AI Forward Deployed Engineer hackathon
**Commit:** `32f6c6b`
**Report date:** 2026-11-11
**Rule versions:** `rfm-v1.0.0`, `nba-v1.0.0`, `dq-v1.0.0`

Everything in this report was executed against the running system in this environment. Figures are read from
PostgreSQL, test results from the actual suite, and HTTP results from live requests. Nothing here is projected or
assumed.

---

## 1. Verification summary

| Check | Command | Result |
|---|---|---|
| Backend unit + integration tests | `npm --prefix backend test` | **62 passed / 62**, 6 files, exit 0 |
| Backend production build | `npm --prefix backend run build` | `tsc` clean, `dist/server.js` produced and **executed successfully** |
| Frontend production build | `npm --prefix frontend run build` | 12 routes compiled, exit 0 |
| API liveness (production build) | 9 endpoint requests | **9/9 HTTP 200** |
| UI pages (production build) | 9 route requests | **9/9 HTTP 200** |
| Database | `psql` | 500 customers, 2,000 orders, 10,000 events loaded |
| Repository hygiene | `git ls-files` audit | 143 files, **no secrets, no `.pgdata`, no `node_modules`, no build output** |

### Measured dataset and business state

| Metric | Value |
|---|---:|
| Customers / orders / order lines | 500 / 2,000 / 4,627 |
| Engagement events / support cases / consents | 10,000 / 565 / 2,419 |
| Active segment memberships | 501 |
| Recommendations | 501 (376 eligible, 45 suppressed, 80 no-action) |
| Recommendation reasons persisted | 2,186 |
| Outcomes | 376 (100 success, 79 failure, 197 no response) |
| Revenue attributed | ₹337,338.44 |
| Exceptions | 4 (1 per mandatory category) |
| Audit events | 8 |
| Validation score | 100.00% — 27/27 rules, 3 expected anomalies, 0 unexpected failures, 50,619 records checked |
| Segment ground-truth agreement | 500/500 (100%) |
| Dataset hash | `98620a33304967ab47c4b87476281654b4a39d4685146874cdd7f8ba2c551512` |

Segment distribution (active): champions 81, lost 80, loyal 78, high-service-cost 60, new 60, at-risk 44,
potential-loyalists 41, cannot-lose 36, hibernating 23.

---

## 2. Defects found and fixed in this pass

### 2.1 Test failures (3) — all in test expectations, none in business logic

| Test | Diagnosis | Action |
|---|---|---|
| `rfm.test.ts` — quintile ties | Asserted the worst of 4 values scores 1. With rank-min and n=4, `pct=0.75 → 5-floor(3.75)=2`, which is also exactly what the independent Python ground truth computes. | Expectation corrected to 2, with the derivation documented in the test |
| `recommendation-engine.test.ts` — escalated complaint | Expected `SUPPRESSED_ACTIVE_COMPLAINT`, but the documented precedence reroutes any escalated customer to *Support Follow-up* before a promotional action is selected, so no marketing action is ever evaluated. | Replaced with two assertions on the real guarantee: the selected action is non-promotional service follow-up, and no promotional action is ever eligible for that customer |
| `edge-cases.test.ts` — CASE 3 monetary | Compared the customer's **lifetime** net spend (₹51,487.27) against a **single order's** header net (₹38,072.70). The meaningful assertion (segmentation monetary = line-derived) already passed. | Rewrote to compare line-derived total against the header-derived total for the same customer and assert the difference equals the recorded discrepancy exactly |

No test was deleted; the suite grew from 61 to 62 tests.

### 2.2 Genuine implementation defect — production build was not runnable

- **Symptom:** `node dist/server.js` failed with `MODULE_NOT_FOUND` at `dist/middleware/error-handler.js`.
- **Root cause:** `tsc` compiles `src/**/*.ts` but does not copy the Prisma-generated client, which lived in
  `backend/src/generated/prisma`. The relative import resolved in `tsx` (dev) but not from `dist/`.
- **Fix:** generator output moved to `backend/generated/prisma` — outside `src/` and outside `dist/`, so
  `../../generated/prisma` resolves to the same physical directory from both `src/db` and `dist/db`. Imports in
  `db/prisma.ts` and `middleware/error-handler.ts` updated, client regenerated, `.gitignore` and README updated.
- **Verification:** the built server was started and served all 9 API endpoints with 200.

### 2.3 Environment issues (not code defects)

| Issue | Diagnosis | Resolution |
|---|---|---|
| One test run failed with `Can't reach database server at localhost:5433` | Local PostgreSQL cluster had stopped | Restarted the cluster; 500 customers verified intact; no data reset |
| All pages 500 after a production start | An `npm run dev` server and a `next start` server had both been running; `.next` was overwritten by the production build while the dev server held port 3000, producing `Cannot find module './vendor-chunks/tailwind-merge.js'` | Terminated the orphan listener, deleted `.next`, rebuilt cleanly, restarted — 9/9 pages then returned 200 |

---

## 3. Requirement-by-requirement mapping

### 3.1 Mandatory edge cases (§9)

| Case | Implementation | Evidence |
|---|---|---|
| 1 — Conflicting exclusive segments | `inject-anomalies.ts` adds a second ACTIVE membership (`legacy-import-v0`); `SEG-EXCL-01` detects it, flags both memberships, raises a HIGH exception with both segments as evidence | `exception_records`: 1 row, expected `1 active exclusive segment`, actual `2 active exclusive segments`; `/segments/conflicts` lists `CUS-000050` with both memberships; tests `CASE 1` (3 assertions) |
| 2 — Consent violation | Legacy pipeline emits an ELIGIBLE promotional recommendation for a withdrawn-consent customer; `CONSENT-ENF-01` blocks it, preserves the original state in `audit_events`, appends a reason | Recommendation `SUPPRESSED` / `SUPPRESSED_CONSENT`; audit payload `previousEligibility: ELIGIBLE → newEligibility: SUPPRESSED`; tests `CASE 2` (4 assertions) |
| 3 — Returns not netted | Generator zeroes `returnedAmount` and restores `netTotal = grossTotal` on `ORD-2026-000090` while line refunds remain; `RET-01` recomputes from lines | Exception stores `refundSum 5266.00`, `expectedNetTotal 32806.70`, `actualNetTotal 38072.70`, `discrepancy 5266.00`; segmentation monetary equals the line-derived value exactly; tests `CASE 3` (2 assertions) |
| 4 — Incorrect outcome attribution | Injector points one successful outcome at a different action; `ATTRIB-01` detects the mismatch, sets `isAttributionValid = false`, raises an exception, writes an audit event, and does **not** rewrite the row | Exception expected/actual differ; outcome still carries the wrong `actionId`; tests `CASE 4` (3 assertions) |

Ground-truth isolation is itself tested: no table name contains `ground` or `archetype`.

### 3.2 Core entities and database design (§4)

All 11 core entities plus 9 supporting tables exist with PKs, FKs, unique business codes, indexes and timestamps.
History preservation is verified by tests (consent uniqueness, membership history, outcome preservation).
Full column reference: `database/data-dictionary.md`.

### 3.3 Data generation (§6)

Deterministic, seeded (`20261022`), profile-driven (`small`/`medium`/`full`), parents before children, integer-paise
money, exact target totals, `/N` NULL encoding for `COPY`. Reproducibility is proven by test, not assertion:
same seed → identical `datasetHash`, different seed → different hash, counts proportional to profile.

### 3.4 Segmentation (§7)

Quintile RFM (`rfm.ts`, pure), 9 documented segments, single-assignment exclusive tree, assignment reason and
decision inputs stored per membership, conflicts detected rather than resolved. The TypeScript engine agrees with
the independent Python implementation on **500/500 customers**.

### 3.5 Recommendations (§8)

Deterministic engine (`recommendation-engine.ts`, pure), 8-action catalogue, ≥1 reason per recommendation
(`DQ-REC-02` enforces it), input metrics and rule version stored, consent evaluated **before** eligibility,
explicit `NO_ACTION` for lost customers.

### 3.6 Ground truth (§10)

Separate files in `data-engine/ground_truth/` (Version-controlled; never loaded into the OLTP schema). Produced by a
second, independent implementation. Consumed only by the evaluation module and tests — a boundary asserted by a test.

### 3.7 Validation and data quality (§11)

27 SQL rules (`dq-v1.0.0`) covering PK uniqueness, FK integrity, duplicates, enums, required fields, date ordering,
order arithmetic, return reconciliation, net monetary, consent lifecycle, membership rules, recommendation
eligibility and outcome attribution. Persisted per run with per-rule results and a per-rule issue row on failure.

### 3.8 Frontend (§12)

8 pages + customer 360 detail: dashboard (10 KPIs, 5 charts), customers (search/filter/sort/pagination), segmentation
(run + conflicts + rules + history), recommendations (filters + explanation panel + narrative), consent
(summary + history + working change form), exceptions (4 category cards + evidence + resolve actions), outcomes
(funnel, segment/action performance, caveat), data quality (27 checks, ground-truth evaluation, reproducibility,
regeneration form with job polling). All figures come from API calls backed by SQL.

### 3.9 API (§13)

39 endpoints across 13 routers, Zod validation on every input, pagination with metadata, consistent error envelope,
request logging, no hardcoded responses. 13 of these are asserted by `api.test.ts`.

### 3.10 Metrics (§14)

Computed from records, never invented: data metrics (counts, DQ score, reconciliation errors), segmentation metrics
(distribution, ground-truth accuracy, conflict count, unassigned count), recommendation metrics (eligible,
suppressed, consent-prevention, conversion), exception metrics (4/4 detection, extra detections). The outcome module
explicitly refuses to claim causal uplift.

### 3.11 Testing (§15)

62 tests across 6 files covering RFM, net spend after returns, segment assignment, conflicting segments, consent
withdrawal, promotional suppression, eligibility, attribution, FK integrity, fixed-seed reproducibility and API
contract. All four edge cases appear in both tests and the UI.

### 3.12 Documentation (§16)

| Document | Path |
|---|---|
| Project README (18 required sections) | `README.md` |
| Architecture | `docs/architecture.md` |
| Business rules | `docs/business-rules.md` |
| Entity relationships | `docs/entity-relationships.md` |
| API documentation | `docs/api-documentation.md` |
| Data generation + provenance | `docs/data-generation.md` |
| Data dictionary | `database/data-dictionary.md` |
| Acceptance report | `docs/acceptance-report.md` |

---

## 4. Explicitly not verified

Stated so the evaluation is not overstated:

1. **No browser-based visual verification** was performed in this final pass. Page shells return 200 and every
   backing API response was verified, but client-side rendering of charts and tables was not inspected pixel by
   pixel through a browser automation tool.
2. **`docker-compose.yml` was not executed** — the Docker daemon was unavailable on this machine. The file is
   provided and syntactically complete; the verified path is the native PostgreSQL cluster plus `scripts/`.
3. **The `full` profile (50,000 / 200,000 / 1,000,000) was not loaded.** The code path, `COPY` batching and profile
   arithmetic are implemented and the proportionality is unit-tested, but the shipped database contains the `small`
   dataset. Full-scale timings in `docs/data-generation.md` are design estimates and are labelled as such.
4. **No authentication exists** — documented as known limitation 1.
5. **Outcomes are simulated**, not observed from a real campaign system — documented as known limitation 2.

---

## 5. Reproduction

```powershell
pwsh -File scripts/db-start.ps1
npm --prefix backend install ; npm --prefix frontend install
npm --prefix backend run db:generate
npm --prefix backend run db:migrate
pwsh -File scripts/run-pipeline.ps1 -Profile small
npm --prefix backend test
pwsh -File scripts/dev.ps1
```

Then open `http://localhost:3000`. Database state is preserved by every script in this list.
