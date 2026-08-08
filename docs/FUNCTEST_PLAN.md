# FUNCTEST — scenario catalog & design

**What it is:** one command that resets the sandbox, seeds a deterministic world, exercises
every major subsystem end-to-end, checks ACTUAL output against EXPECTED output, and writes
`docs/FUNCTEST_REPORT.md`.

```bash
cd "hr-erp backend/hr-erp-backend"
npm run functest                      # reset → seed → run all 120 scenarios → write the report
npm run functest -- --no-reset        # reuse the current sandbox (fast iteration)
npm run functest -- --only=BILLING    # one area
npm run functest -- --case=BILL-09    # one scenario
npm run functest -- --keep            # leave the fixture in the DB to poke at
FUNCTEST_DEBUG=1 npm run functest     # also print anything teardown had to skip
```

Exit code is **1 only on FAIL**. KNOWN-GAP rows are documented-open findings; they are
reported loudly but do not fail the run.

---

## SANDBOX ONLY — how that is enforced

This suite seeds, mutates, bills, anonymizes and drops. Four independent checks stand
between it and any real database; all four are tested (see "Guard proofs" below).

| # | Check | Where |
|---|---|---|
| 1 | `DB_NAME` must contain `sandbox` — shell refuses otherwise | `scripts/functest.sh` |
| 2 | `DB_NAME` not in the protected list (`hr_erp_db`, `hr_erp_prod`, `hr_erp_production`), must contain `sandbox`, `DB_HOST` local, `NODE_ENV != production`, and **no fallback to the default DB if `DB_NAME` is unset** | `tests/functest/lib/guard.js` → `assertSandboxEnv()`, run before any socket opens |
| 3 | `SELECT current_database()` on the pool **the services themselves use** must be a sandbox, and `inet_server_addr()` must be loopback | `guard.js` → `assertSandboxLive()` |
| 4 | The base seed's own guard (refuses a non-sandbox `DB_NAME`) | `src/database/seed_sandbox.js` |

Prod is never contacted by anything in this suite. There is no code path that reads a
production DSN, and the sandbox reset only ever drops the database named by check #1.

**Guard proofs** (all verified):

| Attempt | Result |
|---|---|
| `SANDBOX_DB=hr_erp_db npm run functest` | refused, exit 1 |
| `DB_NAME=hr_erp_db node tests/functest/run.js` | `DB_NAME="hr_erp_db" is a protected database` |
| `DB_NAME` unset | refused (dotenv's default is the protected dev DB) |
| name says sandbox but the connection is `hr_erp_db` | live guard trips |

---

## Design

**Scenario-driven, not test-file-driven.** A scenario is `{ id, name, expected, run() → actual }`.
The runner deep-compares actual against expected (money compared numerically within half a
fillér, since the engine accumulates `round2` per day), assigns PASS / FAIL / KNOWN-GAP / FIXED,
and renders one table row. Everything a failure needs — the diff, the repro command, the SQL to
inspect the seeded state — travels with the scenario.

**It does not re-implement business logic.** Scenarios call the real services
(`calculateMonthlyBilling`, `consolidationEngine.generateRun`, `expiryMonitor.runDaily`,
`hygieneFine.runHygieneFines`, `gdprAnonymization.anonymizeEmployee`, `report-scheduler.executeReport`,
`profit.getByAccommodation`) and read the resulting rows back out of Postgres.

**Permissions run over real HTTP.** The express app is booted in-process and called with real
signed JWTs against the sandbox DB — `authenticateToken` does its real user lookup, the real
role→permission SQL runs, every controller executes its real query. Nothing is mocked. (The
existing `residentLeakGuards.test.js` mocks auth + DB + services: that proves the middleware is
*wired*; this proves a real login is actually *refused*.)

**It composes the existing suites rather than duplicating them.** Six jest files whose subject
matter overlaps these areas are re-run by the same command and folded into the same report. The
other ~1428 CI tests stay exactly where they are.

**Deterministic.** Fixed sentinel month `1903-06` (30 days — every per-night figure × 30 is the
monthly figure, and a far-past month can never collide with real snapshots or the other suites'
`1902-06`). No RNG, no clock, no month-of-today; `TZ` is pinned to `Europe/Budapest`. Rents are
chosen so `monthly_rent / 30 / headcount` is exactly 1000 or 4000 Ft — which is what
"hand-checkable" means here. Two consecutive full runs produce **byte-identical** reports.

**Layered on the base seed, never replacing it.** The base sandbox seed supplies the messy
310-employee dataset (mixed-gender rooms, cross-shift rooms, empty shifts) that the consolidation
constraint proof runs over; the fixture adds the surgical arithmetic-exact sites. Everything the
fixture creates is `FT`-tagged and is dropped and rebuilt each run.

### Layout

```
tests/functest/
  run.js                    entrypoint: guard → reset → fixture → scenarios → report
  fixture.js                the deterministic world (+ teardown)
  lib/guard.js              sandbox enforcement (env + live)
  lib/compare.js            expected-vs-actual, money-aware
  lib/report.js             docs/FUNCTEST_REPORT.md writer
  lib/http.js               real express app + real JWTs
  scenarios/billing.js consolidation.js permissions.js reports.js dataIntegrity.js automations.js composed.js
scripts/functest.sh         the single command
```

---

## Result states

| State | Meaning |
|---|---|
| ✅ PASS | actual == expected |
| ❌ FAIL | real defect or regression — **fails the run (exit 1)** |
| ⚠️ KNOWN-GAP | asserts the CORRECT behaviour against a feature that is documented as missing or broken (`docs/DEEP_AUDIT_2026-07.md`, unbuilt consolidation constraints). Reported, does not fail the run |
| 🎉 FIXED | a KNOWN-GAP case now passes → close the gap in the docs |

The third state exists so a real regression stands out instead of drowning in a dozen
already-known findings — and so each gap flips to FIXED on its own the day it is closed.

---

## Catalog — 120 scenarios

### BILLING (23) — every formula path with hand-checkable numbers

| ID | Scenario | Expected |
|---|---|---|
| BILL-01 | per_person, 2 fő × 30 éj × 3500, rent 300 000 | net 210 000 · VAT 56 700 · gross 266 700 · cost 300 000 · margin −90 000 |
| BILL-02 | flat, fully covered month | net 300 000 (headcount-independent) |
| BILL-03 | flat, prorated 15/30 covered days of 900 000 | net 450 000 · VAT 121 500 · gross 571 500 |
| BILL-04 | VAT taxable 27% | gross = net × 1.27 |
| BILL-05 | VAT áfamentes | VAT 0, gross = net |
| BILL-06 | legal type company | payroll_handoff false, no marker |
| BILL-07 | legal type private | payroll_handoff true + HU marker, **and zero payroll rows written** |
| BILL-08 | invoicing OFF | client skipped entirely, no billing row |
| BILL-09 | per_bed cap 100 / 3500 / 1500 / 90%, 95 foglalt | **340 000/éj** · avg_full 95 · 5 empty beds |
| BILL-10 | same, 80 foglalt → floor lifts to 90 | **330 000/éj** |
| BILL-11 | same, 92 foglalt | **334 000/éj** |
| BILL-12 | Autoliv 60 ágy @ 90%, 40 foglalt | **198 000/éj** billed at the 54 floor |
| BILL-13 | per_bed floor 0 + rate_empty 0 | plain per-occupied-bed: 42 × 3000 × 30 |
| BILL-14 | contracted_beds NULL | capacity falls back to the 60 physical beds |
| BILL-15 | over-occupancy 65 in a 60-bed block | all at rate_used, empties clamped to 0 |
| BILL-16 | one accommodation, two megbízók | **two separate invoices**, one run |
| BILL-17 | mixed site, megbízó A @ 3000 | net 180 000 · cost 280 000 (rent 240 000 + expense 40 000) · margin −100 000 |
| BILL-18 | mixed site, megbízó B @ 5000 | net 450 000 · cost 420 000 · margin +30 000 |
| BILL-19 | compensation → the worker's megbízó, separate line | housing net 60 000, compensation 57 000, margin unaffected |
| BILL-20 | compensation status filter | issued + escalated billed; **disputed** and waived excluded |
| BILL-21 | compensation with no resolvable megbízó | surfaced in the summary, never dropped |
| BILL-22 | run summary | partner_count 5 · no-client groups 2 · skipped 1 |
| BILL-23 | re-run the month | prior run cancelled, identical totals, exactly one active run |

### COST (9) — what WE pay the szállásadó, per accommodation

| ID | Scenario | Expected |
|---|---|---|
| **COST-01** | **FLAT — rent 600 000, 12 fő across 4 rooms** | **allocates 600 000, NOT 600 000 × 4** (the mig-112 per-room multiplication) |
| COST-02 | FLAT — rooms still on snapshots | 12 rows, 12 with a room, 4 distinct rooms (analytics keep working) |
| COST-03 | PER-BED | 10 foglalt ágy × 800 Ft × 30 éj = 240 000 |
| COST-04 | VEGYES | flat 300 000 + the utility lines we pay (70 000) = 370 000 |
| COST-05 | VEGYES pass-through | only áram re-billed (50 000 @ 100%), margin-neutral |
| COST-06 | expense on a line the matrix says the szállásadó pays | flagged in the row AND in the run summary, never silently absorbed |
| COST-07 | profit dashboard under all three bases | profit ≡ engine margin, identity holds |
| COST-08 | utilities matrix over real HTTP | always six lines, round-trips, resident → 403 |
| COST-09 | coverage view | flags no rent basis / missing amount / incomplete matrix |

### CONSOLIDATION (12 + 3 gaps)

| ID | Scenario | Expected |
|---|---|---|
| CONS-01 | shift matrix is identity | cross-shift blocked; empty shift compatible with nobody, incl. other empties |
| CONS-02 | `groupValid` | rejects mixed gender / cross-shift / mixed workplace; allows an identical cohort |
| CONS-03 | solvable site (4 residents, 4 two-bed rooms) | 2 rooms freed, 2 moves, 4 beds |
| CONS-04 | cross-shift site | no proposal at all |
| CONS-05 | shift-less resident | flagged, never moved; the rest still consolidate (1 room freed) |
| **CONS-06** | **independent re-verification of EVERY suggestion in a full run** | **0 gender · 0 shift · 0 workplace · 0 capacity · 0 cross-accommodation violations** |
| CONS-07 | flagged residents in moves | zero |
| CONS-08 | approve one site | room_id applied, suggestions `applied`, move logged in `entity_status_history` |
| CONS-09 | partial completion | run `partially_applied`, other sites still pending |
| CONS-10 | reject | archived with reason, room unchanged |
| CONS-11 | committed DB after apply | zero invalid rooms on the approved site |
| CONS-12 | re-apply the same site | refused (`nothing_pending`) |
| ⚠️ CONS-13 | do-not-move **LOCK** | **NOT BUILT** — no lock field on employees or suggestions |
| ⚠️ CONS-14 | **60-day stability** window | **NOT BUILT** — no config knob, engine never reads move recency |
| ⚠️ CONS-15 | approve → **ticket** → confirm → room change | **NOT BUILT** — apply writes `room_id` directly; the only staging is `agent_suggestions.status`, and partial completion exists at RUN level (CONS-09) |

CONS-06 does not trust the engine's own validator: it replays every suggestion into a simulated
post-state and re-derives each constraint from raw employee/room rows, so an unsafe move is caught
even if `groupValid` is the thing that broke.

### PERMISSIONS / DATA ISOLATION (16 + 5 gaps)

| ID | Scenario | Expected |
|---|---|---|
| PERM-01 | DEEP_AUDIT 1–4 leak endpoints, real resident login | 403 on all 10 |
| PERM-02 | same endpoints, superadmin | never 403 (the fix did not over-block) |
| PERM-03 | resident vs every gated staff endpoint | 403 on all 16 |
| PERM-04…12 | **one case per role** (superadmin, admin, data_controller, property_owner, contractor, property_inspector, maintenance_worker, task_owner, accommodated_employee) | HTTP status agrees with `role_permissions` for the permission each route declares — zero mismatches |
| PERM-21 | unauthenticated caller | 401 everywhere, no anonymous surface |
| PERM-13 | cross-tenant **WRITE** of a tenant-2 employee | 403, row unchanged |
| ⚠️ PERM-14 | cross-tenant employee list | 0 foreign rows — returns 3 (DEEP_AUDIT #6) |
| ⚠️ PERM-15 | finance reads (expenses / profit / operating-costs) | no foreign data — all three leak (DEEP_AUDIT #7) |
| ⚠️ PERM-16 | timesheets by task id | no foreign hours — returns them incl. the logger's email (DEEP_AUDIT #8) |
| ⚠️ PERM-17 | `GET /rooms/:id/inspection-history` | 403 for a resident — returns 200 (#11) |
| ⚠️ PERM-18 | `GET /analytics/overview` | 403 for a resident — returns 200 (#12) |
| PERM-19 | worker-specialization write (valid body) | 403, no row created |
| PERM-20 | GTD metadata write on a real ticket | 403, ticket unmodified |

The role matrix is not a hand-copied allow-list. For each endpoint it takes the permission the
ROUTE declares, asks the DATABASE whether the role holds it, and checks the HTTP response agrees —
three independent sources that must line up, so it fails if a route's gate changes without the
permission model, or vice versa.

### REPORTS (12 + 3 gaps)

| ID | Scenario | Expected |
|---|---|---|
| REP-01…06 | all six generators (employees, accommodations, tickets, contractors, occupancy, cost_centers) | row count reconciles with an independent SQL count of the source table; sheet named; columns present; zero all-blank rows |
| REP-07 | profit identity | `profit = income − (expenses + rent)` on every seeded site |
| REP-08 | profit ≡ engine margin | per accommodation and in total |
| REP-09 | mixed-client site | income 630 000 · expenses 100 000 · rent 600 000 · profit −70 000 |
| REP-10 | capacity columns | physical 100 · committed 60 · **lekötetlen 40** · empty bed-nights 180 · occupied 1200 |
| REP-11 | compensation on the dashboard | 57 000 as pass-through, never inside profit |
| REP-12 | operating-costs totals | reconcile with `accommodation_expenses` |
| ⚠️ REP-13 | employees report Email/Telefon | must come from `company_email`/`company_phone` — comes from `users` (#14) |
| ⚠️ REP-14 | cost_centers report filters | must change the output — silently ignored (#17) |
| ⚠️ REP-15 | occupancy "as of" date | must be the LOCAL date — uses UTC (#18) |

REP-15 is a real functional probe, not a source grep: `Date` is frozen at
2026-06-15 00:30 Europe/Budapest (= 2026-06-14 22:30Z) and a worker arriving 2026-06-15 is
present locally but invisible under UTC.

### DATA-CHANGE INTEGRITY (23)

| ID | Scenario | Expected |
|---|---|---|
| DATA-01 | room move via `PUT /employees/:id` → next occupancy snapshot | shows the NEW room; exactly one open history row |
| DATA-02 | consolidation approve | history followed every applied move, reason `consolidation` |
| DATA-03 | hire via `POST /employees` | an open history row exists immediately |
| DATA-04 | termination via `DELETE /employees/:id` | stay ends, bed stops counting today (same-day hire+leave leaves no row) |
| DATA-05 | termination of a long-standing resident | stay is CLOSED, not deleted — past billing keeps its days |
| DATA-06 | **overlap invariant** | no employee has two rows covering one day (a double-covered day aborts the snapshot for EVERYONE) |
| DATA-07 | roster ↔ history | every housed employee has a matching open row |
| DATA-08 | mid-month A→B transfer | 15 occupancy days each, never 31 or 29 |
| DATA-09 | same-day handover | the day belongs to the NEW accommodation only |
| DATA-10 | transfer pro-rata | each site bills its own 15 days + its own rent share |
| DATA-11 | visa expiring in 10 days | fires in the 14-day bucket |
| DATA-12 | contract (5 days) + document (45 days) | buckets 7 and 60 |
| DATA-13 | expiry 400 days out | not alerted |
| DATA-14 | expiry monitor re-run | idempotent, zero duplicates |
| DATA-15 | hygiene toggle OFF | nothing created, even with two failing inspections |
| DATA-16 | 2 consecutive fails @ 7 pt | exactly ONE fine, 10 000 × 2 lakó = 20 000 |
| DATA-17 | hygiene re-run | 0 created, `skipped_existing` 1 |
| DATA-18 | room with a single fail | never fined |
| DATA-19 | the fine's side effects | zero `compensation_payments`, zero `salary_deductions` |
| DATA-20 | GDPR erasure | identifying fields nulled, surname pseudonymized, `anonymized_at` set |
| DATA-21 | erasure receipt | itemized rowcounts + file outcomes + completeness, persisted to `anonymization_log` |
| DATA-22 | **independent PII sweep** | the seeded marker survives in **zero** text columns (scans every text/varchar column of `employees` + `users`, without trusting the receipt) |
| DATA-23 | second erasure request | refused (`already_anonymized`) |

### AUTOMATIONS (8)

| ID | Scenario | Expected |
|---|---|---|
| AUTO-01 | scheduled report run | generates, STORES the xlsx on disk, delivery accounting honest (delivered ≤ recipients, shortfall always recorded) |
| AUTO-02 | **forced** delivery failure | 0/1 recorded on the run + ops alert raised + file still stored — deterministic, stubs `sendEmail` |
| AUTO-03 | every configured report type | all 6 execute and store an output |
| AUTO-04 | unknown report type | `failed` + error_message, never a silent success |
| AUTO-05 | alertOps on a forced failure | `[ops-alert]` emitted, job does not crash |
| AUTO-06 | billing draft run | 19 billings, all `draft`, one `calculated` run |
| AUTO-07 | daily occupancy snapshot cron | 14 175 employee-days for the month |
| AUTO-08 | snapshot cron re-run | idempotent, zero duplicate `(date, employee)` keys |

### COMPOSED (6) — existing jest suites, re-run and folded in

`billingPerBed` · `billingProfileMatrix` · `billingEngineOptionC` · `residentLeakGuards` ·
`deductionExecutionMothball` · `damageReportAuthz`.

---

## Findings this suite surfaced that were NOT in the deep audit — both now FIXED

**1. `employee_accommodation_history` had no application writer (high, money path).** ✅ fixed 2026-08-07
`occupancyTracking.recordDailySnapshot` reads that table exclusively, and nothing in `src/`
ever wrote it — the only writes were migration 112's one-time backfill and the sandbox seed. So
room moves, accommodation transfers, hires and terminations never reached occupancy snapshots,
and billing billed a frozen roster. Deep-audit row #21 passed because it seeded history rows by
hand — it proved the engine, not the feed.
*Fix:* `accommodationHistory.service.js` writes history **in the same transaction** as every
employees UPDATE that changes housing (employee edit, hire, termination, bulk import, Excel room
round-trip, consolidation approve, room deletion), plus
`scripts/backfill-accommodation-history.js` for the rows that accumulated while it was frozen.
Now covered by **DATA-01..07** and `tests/integration/accommodationHistory.test.js`.

**2. DEEP_AUDIT #6 is also a cross-tenant WRITE (severity escalation).** ✅ writes fixed 2026-08-07
The audit documented `employee.controller.js`'s missing `contractor_id` filter as a read leak.
`PUT /employees/:id` had the same gap: a tenant-1 `data_controller` successfully mutated a
tenant-2 employee's row (**PERM-13**). *Fix:* `updateEmployee` refuses a foreign owner before
building the UPDATE. The READ side (**PERM-14/15/16**) is still open and still reported.

**3. DEEP_AUDIT #13 and #16 were effective writes, not just missing gates.** ✅ fixed 2026-08-07
A resident login created a real `worker_specializations` row (201) and modified a real ticket's
GTD metadata (200) — previously code-analysis findings only. *Fix:* both now require a
permission (`employees.edit` / `tickets.edit`) **and** carry a tenant predicate
(**PERM-19/20**).

---

## Maintenance notes

- The fixture is the single source of the world. Adding a site changes `AUTO-06` (billing count)
  and `AUTO-07` (employee-days); both are asserted deliberately so fixture drift is loud.
- `--keep` leaves everything in the sandbox for manual inspection; teardown is otherwise automatic
  and verified to leave zero `FT` rows.
- `scripts/sandbox-reset.sh` now evicts open connections before `DROP DATABASE` (a leftover
  `npm run dev:sandbox` used to make the reset fail).
