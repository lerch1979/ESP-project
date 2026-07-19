# HR-ERP PROJECT STATE

**Last updated:** 2026-07-06
**Maintainer:** lerchbalazs@gmail.com

> ⚠️ **PRODUCTION IS LIVE** at **https://app.housingsolutions.hu** — Hetzner VM `167.233.122.3`, Docker Compose stack (caddy → backend + admin → postgres + redis). Deploy = SSH `deploy@167.233.122.3` + `docker compose -f docker-compose.prod.yml pull backend && up -d backend`. CI (push to `main`) builds + pushes GHCR images; the k8s deploy job is `if:false` so the pull is manual. See `HETZNER_DEPLOY.md` (now the as-built reference).

---

## 🚨 READ THIS FIRST IF YOU'RE CLAUDE CODE

Before suggesting or building ANY new feature:

1. **Search this doc** for the system area (billing, expenses, tasks, etc.). If something exists, investigate it first.
2. **Check the "Known overlaps" section** — there are real duplicates in this repo.
3. **Check `git log --oneline -30`** to see what was just touched.
4. **If uncertain, ask the user** before creating new tables, services, or pages.

Companion docs:
- `SESSION_LOG.md` — what was done in each session, what's next
- `CLAUDE_CODE_INSTRUCTIONS.md` — how to use these docs as a Claude Code agent
- `docs/ARCH_COST_TRACKING_OPTIONS.md` — open architectural decision (cost tracking unification)
- `docs/PROJECT_CONTEXT.md` — older context doc (last updated 2026-03-07, do not trust freshness)

---

## SYSTEM ARCHITECTURE OVERVIEW

**Stack** (per `memory/project_stack.md`):
- Backend: Node.js + Express, PostgreSQL (`hr_erp_db`), Redis cache, BullMQ jobs
- Admin frontend: React 18 + Vite + Material-UI 5 (`hr-erp-admin/`)
- Mobile: React Native + Expo (`hr-erp-mobile/`)
- Auth: JWT, role + permission middleware
- AI: Anthropic Claude (sentiment, OCR — usage varies, see Dormant)

**Layout:**
- `hr-erp backend/hr-erp-backend/` — API server, migrations
- `hr-erp-admin/` — admin SPA, served at `/`, API at `/api/v1`
- `hr-erp-mobile/` — mobile RN app
- `docs/` — architecture + sales decks (mixed freshness)
- `migrations/` (under backend) — numbered SQL. On **main/prod** the latest is **137** (2026-07-13, `shift_schedule_three_shifts`); also 136 (`hygiene_fine_config`), 131 (`scheduled_report_run_output`) + 132 (consolidation v1 — schema on main, **NOT applied to prod**). **133–135 are SANDBOX-only** (consolidation v2/v3 branch, not merged) → main deliberately skips 133–135 (gap 132 → 136; the runner auto-discovers numbers, so a gap is fine). ⚠️ mig 137 was applied to **prod + dev via psql** (constraint swap; prod had 0 legacy shift rows). Its `consolidation_config` re-align is guarded on table-existence (prod lacks that table → skipped). ⚠️ Runner blocked at `093` on the **dev DB only** (6 users); fresh DBs (CI/test) migrate cleanly through the latest. Newer migrations (118+) applied to dev AND prod via `psql`; see tech-debt.

---

## ACTIVE SYSTEMS (production, in use)

| System | Location | Status | Last touched |
|---|---|---|---|
| Auth + permissions | backend `src/middleware/`, `users` table | live | ongoing |
| Employees / accommodations / contractors | backend `src/{controllers,services}/`, admin pages | live | ongoing |
| Tickets + SLA | backend `tickets*`, admin `Tickets.jsx` | live | ongoing |
| Inspections + damage reports + compensations | backend `inspection*`, `compensation*`, `fine*` | live | ongoing |
| Tasks / GTD / projects | backend `task*`, `project*`, admin `GTDDashboard.jsx` | live | 2026-03-23 |
| Salary + payroll deductions | backend `salary*`, `compensations/SalaryDeductionsList.jsx` | **execution MOTHBALLED** (flag off; jegyzőkönyv is our end-of-process) | 2026-07-05 |
| **Occupancy billing chain** (NEW) | mig 112, `billingEngine.service.js`, `occupancySnapshot.service.js`, daily + monthly crons | live | 2026-05-21 |
| **Accommodation expenses CRUD** (NEW) | backend `expense.*`, admin `Billing.jsx` Tab 1 | live | 2026-05-21 |
| **Profit dashboard** (NEW) | backend `profit.service.js`, admin `Billing.jsx` Tab 4 | live, fixes pending commit | 2026-05-21 |
| Chatbot (FAQ + decision trees) | `memory/project_chatbot.md`, `chatbot.controller.js` | live | per memory |
| Gamification | `memory/project_gamification.md` | live | Session 23 |
| Slack integration | `memory/project_slack.md` | live | Session 24 |
| WellMind + CarePath | backend `wellmind*`, `carepath*`, admin pages | live | per code |
| Cron orchestration | `src/cron/`, 9 wellbeing jobs + billing + payroll | live | 2026-05-18 → 21 |
| **Resident self-scoped mobile API + UX** (NEW) | backend `residentSelf.{controller,routes}.js` — `/tickets/my[/...]`, `/accommodations/my`, in-ticket chat (reuses `ticket_messages`) + AI auto-translation, photo attachments, **AI category suggestion** (`categoryAI.service.js`, Haiku), self-scoped `/tickets/my/suggest-category`; mobile resident screens fully i18n (5 locales) + `scripts/check-i18n-coverage.js` guard | live (test resident only) | 2026-06-11 |
| **⚖️ Expiry monitor (visa/contract/document)** (AUDIT P0) | backend `expiryMonitor.{service,controller,routes}.js`, migs 120–121 (`employees.nationality`); daily 07:00 cron (runtime toggle-gated); per-attribute threshold rules (nationality/doc-type), most-specific-wins; in-app notifications + admin widget/page | live (no real data — fields empty until HR populates) | 2026-06-11 |
| **⚖️ GDPR anonymization (right-to-be-forgotten)** (AUDIT P0) | backend `gdprAnonymization.{service,controller,routes}.js`, mig 122; superadmin-gated `/anonymization` (dry-run → double-confirm → execute); consent (`employees.data_consent_at`) + grace-period **propose-only** queue + daily 08:00 reminder cron; admin GDPR page + per-employee action in detail modal | live (v1) | 2026-06-11 |
| **🤖 AI agent foundation** | backend `entityStatusHistory.service.js`, mig 123. `entity_status_history` **WIRED**: never-throws, best-effort recorder logs every status transition (create-seed `from=null→initial` + changes) for tickets, employees, damage reports — fired after commit on the shared pool, never the caller's tx. `agent_audit_log` + `agent_suggestions` are **schema-only scaffolding** (no code writes them yet) for the future agent layer's audit log + human-approval queue. | live (collecting history; agents not built) | 2026-06-16 |

---

## DORMANT SYSTEMS (built but not used)

### Invoice classification + email pipeline
- **Built:** 2026-03 → 2026-04-21 (last commit `264eba43`)
- **Code:** `invoiceDraft.controller.js` (560 lines), `classificationRules.controller.js` (212), `costCenterPredictor.service.js` (251), `invoiceClassification.service.js` (204), Gmail polling, email_inbox UI
- **DB state (2026-05-21):**
  - `invoices`: **0 active rows** (none ever finalized)
  - `invoice_drafts`: 5 pending since 2026-04-21, never reviewed
  - `invoice_classification_rules`: 20 rules, 9 with ≥1 match, max match_count = 3
  - `cost_centers`: 32 rows, hierarchical (HR/Operations/Strategic); 10 level-4 entries mirror accommodation names
  - `email_inbox`: 9 messages, 0 unprocessed
- **Why dormant:** pipeline never adopted in production. Drafts produced, no review workflow triggered. Gmail poller may still be polling — needs verification.
- **Can it be reused:** Yes — the OCR + classification stack works. See `docs/ARCH_COST_TRACKING_OPTIONS.md` for unification paths.

### NLP sentiment (Claude crisis detection)
- Per `memory/project_nlp_sentiment.md`: **DISABLED by default**, opt-in feature flag

---

## RECENT WORK (last 30 days, newest first)

| Date | Commit | Summary |
|---|---|---|
| 2026-07-19 | `7f8eeab6` _main→prod_ | **Per-client billing package Phase 1 (addresses audit #10 "$0 billing").** Enter/manage per-client night rates so real invoices bill real gross. mig 138 (client_night_rates: billing_basis per_person/flat + flat_amount + vat_rate; accommodation_billings vat/gross) + mig 139 (client_billing_profiles: invoicing on/off, legal_type company/private, vat_exemption_reason; per-rate vat_exempt; payroll_handoff marker). Engine: per_person = rate×person-nights, **flat = prorated by covered days**, VAT taxable/áfamentes, invoicing-off → client skipped, **private → payroll_handoff + "Bérszámfejtendő magánszemély" (no payroll calc)**; total_amount stays NET (profit reconciles). Admin `/billing-rates`: profile editor + basis/VAT/exempt rate form + **coverage view** (no silent $0) + Nettó/ÁFA/Bruttó. CI test `billingProfileMatrix.test.js` (7/7, full matrix). **Deployed + live-verified** (migs via psql; coverage shows the real gap: 10 accs with workers lacking billing_client_id). Phase 2 = six-line utilities matrix (inert, default we_pay). |
| 2026-07-19 | `0e0717f2` _main→prod_ | **Fixed 2 high-severity audit bugs (profit-rent #5, consolidation-workplace #9).** **#5:** profit dashboard omitted accommodation rent → overstated profit; now `rent = SUM(cost_amount) − expenses`, `profit = income − (expenses+rent) ≡ billing engine margin_amount`; `rent`/`total_rent` in API + Billing Tab 4 column; `profit.script.js` reconciliation cases. **#9:** consolidation engine now reads `workplace` as a HARD constraint — cohort key (gender×shift×workplace), `groupValid` rejects mixed workplace, missing shift OR workplace → flagged (`flagged_incomplete`); constraint-proof test asserts 0 workplace violations on a full run. Both **deployed + live-verified** (profit API returns total_rent + reconciles; consolidation run logs the new flagging). |
| 2026-07-19 | `087c7308` _main→prod_ | **Deep functional audit + fixed 4 resident-reachable data leaks.** Audit (`docs/DEEP_AUDIT_2026-07.md`, 28 findings, exercised on sandbox): billing pro-rata/same-day + expiry/hygiene/GDPR triggers PASS; profit dashboard omits rent (BUG), consolidation ignores workplace (BUG), billing revenue=client_night_rates→$0 on prod (data gap), 4 resident-reachable leaks (critical). **Fixed findings 1-4 only:** `/compensations`, `/fines/salary-deductions`+`/compensations/:id/residents`, `/invoice-drafts`, `/analytics/pulse/*` had only `authenticateToken` → added `checkPermission` (settings.edit / wellbeing.admin.view) + server-side contractor scoping (superadmin bypass; pulse tenant-id-trust fixed). Test `residentLeakGuards.test.js`. **Live-verified with a real resident JWT → 403 on all 4; superadmin → 200.** Findings 5-28 left open for prioritization. |
| 2026-07-13 | `cbc3d1c7` _main→prod_ | **Gap-audit fix round (A1 + A3).** From `docs/GAP_AUDIT_2026-07.md`. **A1:** `/accommodations/consolidation` 500'd because **mig 132 was never applied to prod** (only 132 was missing; 133–135 never existed on main) — applied mig 132 via psql; consolidation_config (identity 3-shift matrix) + consolidation_runs now exist, page read-queries clean. **A3:** Slack page 500 (`column u.name does not exist`) — fixed 3 queries (slack.controller, slackBot.service, nlp/sentimentAnalysis.service) to use `first_name||' '||last_name`; regression test; deployed + verified. **Room-linker** (`scripts/link-room-ids.js`) built + sandbox-tested; **EXECUTED on prod** (287 emps linked → 33 existing + 254 via 116 new beds=0 rooms; `room_id` 0→287/288, rooms 24→140). Per-accommodation bed-count **fill-in Excel** exported (`uploads/reports/agyszam-kitoltendo-2026-07-13.xlsx`). Consolidation now needs bed counts + shifts entered. Item 4 (SMTP/webhook) deferred pending values. |
| 2026-07-13 | `00ca05fc` _main→prod_ | **Three-shift model + same-shift-only consolidation (deployed).** `shift_schedule` value set replaced everywhere: `day/night/rotating/flexible` → **`delelott`/`delutan`/`ejszaka`/`valtott`** ("flexible" removed). Prod verified 288/288 NULL before + after (0 legacy rows). mig 137 swaps the CHECK (discovery-based drop, legacy remap night→ejszaka/rotating→valtott/day+flexible→NULL, guarded consolidation_config re-align). Consolidation engine now **SAME SHIFT ONLY** (identity matrix); an **EMPTY shift is incompatible with everyone → pinned + FLAGGED for data entry, never auto-placed/moved** (reverses old null→flexible). Updated: normalizer + Excel "Műszak" labels, EmployeeDetailModal dropdown/detail, ConsolidationEngine label map + flagged-count alert, seed (3 shifts + empty-shift edge cases + 2 deterministic consolidation-demo accs). Manual `.script.js` suites green (consolidation 30/30 incl. same-shift/cross-shift/empty scenarios; shift + round-trip). CI jest green. i18n: shift labels are staff-only hardcoded HU (no resident enum to translate). |
| 2026-07-13 | `01c0034e` _main→prod_ | **Rate-limit incident fix.** Global `/api/` per-IP limiter had been env-overridden to 200/15min → throttled the owner mid-admin-work. Now a generous anti-DoS ceiling (5000/15min per IP); `authenticatedLimiter` (10000/hr per user) mounted in `authenticateToken`; loud `[RATE-LIMIT]` logging. See decisions log. |
| 2026-07-06 | _main→prod_ | **Stabilization round — production hardening + housekeeping.** (1) **Offsite backup (P0-1):** `deploy/backup.sh` + prod `backup.sh` now encrypt offsite copies (AES-256/PBKDF2 → `backups/offsite/*.enc`), push **only** encrypted artifacts (rsync `--delete` mirror, 30-day retention), and **alert on failure** via `OPS_ALERT_WEBHOOK`. `BACKUP_ENCRYPTION_KEY` generated on the VM. **Restore verified** from the encrypted copy (decrypt → `pg_restore` rc=0 → users=7/employees=288 intact + uploads-extract). `docs/BACKUP_RESTORE.md` written. **Remaining owner action:** provision a Hetzner Storage Box (paid, console) + add the backup pubkey + fill `STORAGEBOX_HOST/USER` — until then offsite is local-only. (2) Cherry-picked the **public/locales → src/i18n/locales** Vite dev-import fix to main (local dev no longer blank; verified). (3) Added **FUTURE ROADMAP — Digital HR services** (Phase A self-service/KPIs · B payroll via integration, never our own calc · C partner API gated on RLS). (4) Housekeeping: Gmail poller disabled on prod (`GMAIL_POLLING_ENABLED=false` — was spamming `invalid_grant`); invoice_drafts already converted (nothing to archive); health check green (containers healthy, hygiene toggle OFF, deduction OFF, disk 12%). |
| 2026-07-05 | _main→prod_ | **Room-hygiene house-rule fine — OUR process, independent toggle (deployed, default OFF).** Business rule: N consecutive failing hygiene inspections on a room → a `HOUSE_RULES` fine (defaults 2 → 10,000 Ft/resident). Discovery: this auto-rule did NOT exist (only the fine types + manual `POST /fines`; `runAutoConversions` is deduction-only) — so built net-new. mig 136 (`hygiene_fine_config`: enabled/consecutive_fails/fail_hygiene_max/fine_amount/fine_type_code, singleton, default OFF). `hygieneFine.service.js` detects rooms whose latest N completed inspections all have `hygiene_score ≤ threshold`, creates ONE fine per room via the existing `createFine` (idempotent, keyed to latest inspection+room), reusing residents from `room_inspections.residents_snapshot`. **Independent of `DEDUCTION_EXECUTION_ENABLED`** — its own config toggle; wired into `inspectionAutomation.runDaily` gated by `hygiene_fine_config.enabled`. Creates the debt record + the existing resident notification only — **NO `compensation_payments`, NO deduction**; payable via cash or forwarded. `createFine` gained an `amountOverride`. Admin page under Ingatlan Ellenőrzés → "Házirend-bírság" (toggle + amount + consecutive-count + threshold + run-now). Tests 14/14 (toggle off/on, exactly-one fine, idempotent, no payments/deductions, cash works, single-fail→no-fine). Sandbox HTTP demo: 2 failing inspections → fine `BIR-2026-0003` (60,000 Ft / 6 residents). Deployed default OFF. |
| 2026-07-05 | _main→prod_ | **Deduction-execution MOTHBALLED (deployed to prod).** Decision: we only produce the damage jegyzőkönyv; the client's payroll runs deductions. New reversible feature flag `DEDUCTION_EXECUTION_ENABLED` (default off) in `src/config/deductionExecution.js`. OFF (prod): `POST /fines/payroll/run`, `POST /compensations/:id/salary-deduction`, `POST /fines/residents/:id/convert-to-deduction` → **403** (clear HU message); the daily auto-conversion (`inspectionAutomation` → `runAutoConversions`) is skipped; the monthly payroll cron is **not scheduled** (logs "MOTHBALLED"). KEPT working: on-site/cash repayments, `compensation_payments` for cash, payment-history reads, GDPR anonymization of `salary_deductions`, and the jegyzőkönyv PDF unchanged in all 5 locales (incl. `payment_plan` section). UI: run-payroll + schedule/convert controls hidden behind a mirrored `DEDUCTION_EXECUTION_ENABLED=false` const (SalaryDeductionsList read-only history; CompensationDetail). Service engine left intact + callable (EOR re-enable = one env + two UI consts). Tests: new mothball guard 7/7 + cash/damage/compensation/inspection suites green (deduction engine still works when flag on). Verified on sandbox (3 endpoints 403, cash 404-not-gated, cron mothballed, admin builds). |
| 2026-07-05 | _sandbox_ | **Room Consolidation Suggestion Engine v1 (SANDBOX ONLY — not deployed).** `consolidationEngine.service.js` + mig 132 (`consolidation_config` weights + shift-matrix, read-fresh-each-run; `consolidation_runs` site-level summary) reusing `agent_suggestions` (mig 123) as the per-move approval queue. Proposes within-accommodation moves to free whole rooms; **never moves anyone** — a human approves a site's plan (atomic apply — moves are interdependent) → applies `room_id` + logs `entity_status_history`; reject archives with reason. HARD constraints (no mixed-gender, shift matrix, bed capacity, same-accommodation) proven on ALL suggestions by `tests/consolidationEngine.script.js` (24/24; 6 seeded conflicts → 0 in touched sites). Admin page `/accommodations/consolidation`. **mig 132 NOT applied to prod.** Shift-matrix default **superseded 2026-07-13** → SAME SHIFT ONLY (identity) + empty-shift flagged, never placed (see mig 137 decision). |
| 2026-07-05 | `b501375b` | **Scheduled-reports prod issue.** Root-caused from prod logs: "Havi költséghely összesítő" failed (`Unknown report type: cost_centers` — no generator), and the 3 "successes" never delivered (every email = `Missing credentials for PLAIN`; SMTP unconfigured) yet were marked success with outputs only emailed (never stored). Fixes: cost-summary generator (accommodation_expenses monthly, SQL `YYYY-MM` string avoids the DATE footgun); executeReport now STORES the Excel (`uploads/reports/<runId>.xlsx`, mig 131 `file_path`) + records true `delivered_count` (no silent success); new download endpoint + admin history "Letöltés" + delivery column; cron failures now fail LOUDLY via `alertOps` (OPS_ALERT_WEBHOOK). Verified live: cost report now success + stored + delivery truthfully 0/1. Tested in sandbox first (11/11). |
| 2026-07-05 | `687a11e6` | **Local sandbox** (`docs/SANDBOX.md`) — synthetic `hr_erp_sandbox` DB + guarded seed for building features off prod. |
| 2026-07-04 | `b1a254c6` | **Room-consolidation foundation:** `employees.shift_schedule` (mig 130, day/night/rotating/flexible) — editable dropdown + bulk-Excel "Műszak" column (hu/en normalizer) + detail display. Engine inputs (occupancy/gender/workplace/shift) now all schema-supported; blocked only on data entry (rooms 0/288, shift 0). Backlogged the suggestion engine. |
| 2026-07-04 | `3212c365`, `2566eb9b` | **Data-integrity (Task 3) fixes.** Live invoice `contractor_id`+`line_items` on the correct controller (`costCenter`; retired dead `invoice.controller` create/update routes). Employee `personal_email`/`personal_phone` editable (resident invites). Accommodation explicit-status no longer overwritten by owner assignment. Retired legacy `/users` page → redirect to `/admin/users`. Orphan scan: 0 orphans across 23 FK checks. |
| 2026-07-04 | `ed271d8b`, `89f5376a` | **GDPR erasure #5 — complete + loud + receipt.** Reaches damage_reports (biometric/salary/photos), all uploaded files, chatbot/ticket free-text (scrubbed), activity_logs (IP+JSONB redacted), push tokens, slack. Fails loudly (207 partial when a file survives), TOCTOU-safe (in-txn RETURNING + savepoints), itemized erasure receipt. Founded on the committed PII inventory. Regression: zero PII remains findable. |
| 2026-07-03/04 | `11719c61`, `bed30cbd` | **Scale-readiness P0.** Payment race → `SELECT … FOR UPDATE` + cancelled guard; DB pool 100→80. Disk/mem alert (hourly cron) + weekly image prune — **reclaimed ~35 GB** of stale images (disk 56%→7%). Scale-readiness report authored (`e4fa944e`) then **corrected** (`95827ff6`): the "4 workers → live cron duplication" finding was withdrawn (prod runs a single `server.js` process). |
| 2026-07-03 | `7dcb94e6` … `876523f5` | **Admin UI overhaul.** Double-`<Layout>` fix (7 pages) → 7-section sidebar → black/gold theme + full page-by-page color sweep (all semantic/chart/identity colors preserved; zero stray decorative blues). Ticket-number hotfix `02dfed27` (poison test tickets 500-ing all creation). PRs #1–#4 merged. |
| 2026-07-02 | `062e1e62` … | **Prod login incident + reliability audit.** (1) Staff accounts on contractor …0001: Eszti (superadmin, `fulop.eszter87`), Timi (admin, `timcsilak`) both pre-existed from 2026-04-23; created path unblocked for Noncsi (`noemi@virtualis-asszisztens-online.hu`, admin — still to create). (2) **Fixed silent password-save bug** (`7ea1780a` line — actually commit on `main`): `PUT /users/:id` (`updateUser`) ignored the `password` field → admin edit form never changed passwords; now accepts + bcrypt-hashes it. **Deployed to prod.** (3) **Rate-limiter fix** (deployed): login is per-client-IP (trust proxy works — verified in prod logs), raised auth cap 5→**10 FAILED/15min** and set `skipSuccessfulRequests` so successful logins don't burn budget (shared-NAT accommodations were the real hazard). (4) **Reliability audit** (4 parallel agents: silent-failure, test-coverage, data-integrity, security) → prioritized CRITICAL/HIGH/MEDIUM plan; **4 per-finding PRs opened** (all with regression tests): PR#1 role-write transaction (self-lockout), PR#2 damage-report authz+tenant-scope (resident-reachable IDOR), PR#3 un-vacuum 8 self-skipping test suites (the `res.body.token`→`data.token` bug; also caught+fixed a live `GET /gamification/leaderboard` 500), PR#4 document cross-tenant IDOR (staff contractor scoping). **Key audit finding: RLS is INERT in prod** (setDatabaseUser middleware unmounted + app connects as postgres superuser which bypasses RLS) → tenant isolation is app-layer `WHERE` only. Decisions taken: retire dead RLS code (don't wire RLS now), rely on IP rate-limiter (no account lockout — shared-WiFi lockout risk). **Next: Phase 1 #5 (GDPR erasure) + #6-7 (money paths).** |
| 2026-06-16 | `6e0b9501` | **Agent foundation:** seed `entity_status_history` on damage-report create too — completes create + status-change coverage across tickets, employees, damage reports. CI green. |
| 2026-06-13 | `09acb7a1` | **Agent foundation:** never-throws status-history recorder + mig 123 (`entity_status_history` WIRED; `agent_audit_log` + `agent_suggestions` schema-only scaffolding). Wired into ticket/employee/damage-report create + status-change. Verified labels + changed_by; full jest 1245/1245. |
| 2026-06-13 | `31c24ea9` | **Infra:** moved project off TCC-protected Desktop → `~/dev/HR-ERP-PROJECT` (permanent EPERM `uv_cwd` fix); rewrote all hard-coded paths + `hrerp` alias. |
| 2026-06-11 | `9e6f2b63` | **AUDIT P0:** GDPR anonymization (right-to-be-forgotten) v1 — engine + lifecycle + admin UI (mig 122). Verified on a throwaway employee (18/18). |
| 2026-06-11 | `989d2ec8` | **AUDIT P0:** visa/contract/document expiry monitor — runtime toggle + per-attribute rules + 07:00 cron (migs 120–121). |
| 2026-06-11 | `c2cf4052` | **CI fix:** resident router blanket-gated all `/api/v1` (per-route auth); actions bumped to v5. CI green again (red since 2026-06-09). |
| 2026-06-11 | `8984deb7` | Resident AI category suggestion (Haiku, self-scoped). |
| 2026-06-11 | `28c06794` | Resident chat language-drift fix + category scoping + i18n guard. |
| 2026-06-10 | `2a142073`,`ff53ac4a` | Billing Day 3–4: invoice_drafts→expenses, accountant share links (public token). |
| 2026-06-09 | `1ad48504` … | Resident self-scope + audit-trigger fix (mig 118), mobile testable, in-ticket chat + AI translation, photo attachments. |
| 2026-05-21 | `dc0887c0` | Tab 4 fixes + Admin `/admin/billing` page, Tab 1 (Expenses CRUD), tabs 2–4 scaffolded |
| 2026-05-21 | `2adbaed5` | GET `/api/v1/profit/by-accommodation` + 19-test integration suite |
| 2026-05-21 | `c9973de2` | Expense CRUD endpoints + 48-test integration suite |
| 2026-05-20 | `b24a9439` | Monthly billing cron + engine `notes` option |
| 2026-05-20 | `ab98aaed` | Monthly billing engine (incoming) |
| 2026-05-20 | `f7df9d29` | Daily occupancy snapshot service + cron |
| 2026-05-20 | `117fed12` | Migration 112 — occupancy billing schema with backfill |
| 2026-05-19 | `a77eaeee` | Cron: schedule monthly payroll deductions (DRY-RUN) |
| 2026-05-19 | `d4c67472` | Cron: schedule daily database backups |
| 2026-05-18 | `3051eee9` | Cron: wire up 9 wellbeing cron jobs |
| 2026-05-17 | `23c497b8` | CI: auto-discover numbered migrations |
| 2026-05-17 | `cd9baeb0` | Migrations 063–094 latent bugs unblocked |

For older history: `git log --oneline --since="2026-04-01"`.

---

## ARCHITECTURAL DECISIONS LOG

| Date | Decision | Reason | Status |
|---|---|---|---|
| 2026-05-20 | Occupancy-based billing: room-level pro-rata, daily snapshots | Original design session — see migration 112 header for full reasoning | ✅ implemented |
| 2026-05-20 | Expense entry is manual UI for MVP, OCR deferred to "Phase 3" | Reduces scope, lets profit dashboard ship | ✅ implemented |
| 2026-05-20 | Same-day transfer: new accommodation gets the day | Encoded in cron query, not schema (mig 112 decision #5) | ✅ implemented |
| 2026-05-21 | Profit endpoint income source: INNER JOIN billing_runs, exclude cancelled + non-incoming | Caught a LEFT JOIN bug that leaked cancelled rows | ✅ tested |
| 2026-05-21 | Profit margin = null when income = 0 | Avoid divide-by-zero / misleading negative-infinity | ✅ implemented |
| _open_ | Unify accommodation_expenses with cost_centers? | See `docs/ARCH_COST_TRACKING_OPTIONS.md` | ⏳ awaiting decision |
| 2026-06-09 | Audit trigger: null-tolerant `entity_id` + `activity_logs.entity_id` nullable (mig 118) | `audit_trigger_func` assumed `NEW.id`; broke all composite-PK inserts → froze role-permission grants system-wide | ✅ fixed (applied via psql; runner blocked at 093) |
| 2026-06-09 | Resident access via dedicated self-scoped `/my` endpoints (Path B), NOT by granting `tickets.view` | `tickets.view`/`accommodations.view` are blanket/overloaded; new auth-only endpoints isolate by `created_by`/`user_id` and leave staff routes untouched | ✅ implemented + isolation-tested |
| 2026-06-11 | Expiry monitor: runtime toggle (config table, read fresh each run) + per-attribute threshold **rules** (most-specific-wins), not hardcoded | Clients who don't want monitoring would get noise → must be one-click silenceable; permit lead-times differ by nationality (PH ~90d vs UA ~30d) so thresholds must vary per attribute | ✅ implemented + verified |
| 2026-06-11 | GDPR erasure = **per-category disposition**, not blanket wipe; KEEP statutory (payroll/contract/billing) pseudonymized, DELETE health, KEEP tickets intact (authorship cascades via pseudonym) | GDPR Art 17(3) yields to legal-obligation (HU 8-yr accounting + payroll) and legal-claims retention; tickets are operational, not sensitive by design | ✅ implemented + throwaway-verified |
| 2026-06-11 | GDPR lifecycle is **propose-only** (grace clock on `end_date`); system never auto-anonymizes | Irreversible + legally sensitive → human must dispose; reminder cron only notifies | ✅ implemented |
| 2026-06-11 | Anonymization audit log stores **counts only**, never removed values; backups age out in ≤30d as the GDPR "ages-out" guarantee | Accountability of the erasure without re-storing the erased PII; backups are not edited | ✅ implemented (see `HETZNER_DEPLOY.md`) |
| 2026-07-02 | **Tenant isolation is app-layer `WHERE`, not RLS.** Retire the dead RLS code (48 policies + `setDatabaseUser`) rather than wire it now | `setDatabaseUser` is unmounted AND the app connects as the postgres superuser (bypasses RLS), so RLS never protected anything; the real boundary is per-query contractor scoping. Proper RLS (non-superuser role + FORCE RLS + per-request txn) is a future architecture project | ✅ decided; scoping-gap fixes in flight (PR#2, PR#4) |
| 2026-07-02 | **No account-level lockout; rely on the per-IP login rate-limiter** (10 failed/15min, successes free) | Residents share accommodation WiFi (one public IP); an account lockout would let a malicious roommate lock others out. `passwordPolicy.js` lockout code is unwired — leave it documented-unused or remove | ✅ decided (rate-limiter deployed); passwordPolicy lockout to be retired |
| 2026-07-13 | **The global `/api/` limiter is a coarse per-IP ANTI-DoS ceiling ONLY (generous), never a brake on legit use; authenticated traffic is bounded PER-USER.** Global default 1000→**5000**/15min per IP (env `RATE_LIMIT_MAX_REQUESTS`, prod set 5000); `authenticatedLimiter` (10000/hr **per user id**, env `RATE_LIMIT_AUTHENTICATED_MAX`) now **mounted** in `authenticateToken`. `authLimiter` stays strict + login-only. | Prod incident: the global limiter had been env-overridden to **200**/15min and counts successful requests, so the owner's normal admin navigation + two background pollers (`/tasks/my/stats`, `/notification-center/unread-count`) 429'd him mid-click (27 blocks from his IP; data-heavy pages fan out 12–20 calls). Per-IP is wrong for authenticated + shared-NAT traffic → per-user budget after auth is the correct boundary (same shared-WiFi logic as the login limiter). | ✅ implemented + **deployed to prod 2026-07-13** (`01c0034e`; CI green; live startup log confirms Global 5000 / Auth 10-FAILED / Authenticated 10000-per-user; 0 × 429 since). 429s now log `[RATE-LIMIT]` loudly to the persistent `/app/logs/combined-*.log`. Tests: `tests/rateLimiter.enforcement.test.js`. |
| 2026-07-02 | **Reliability fixes ship as small per-finding PRs**, each with a regression test, not one branch | Independently reviewable; keeps blast radius small on a now-live prod system | ✅ in progress (PRs #1–#4) |
| 2026-07-13 | **Shifts are THREE (+ rotating): `delelott`/`delutan`/`ejszaka`/`valtott`; room-sharing is SAME SHIFT ONLY; an EMPTY shift is never auto-placed.** Replaces day/night/rotating/flexible ("flexible" removed). The consolidation shift matrix is identity (every cross-shift pairing incompatible); a null/empty shift is incompatible with everyone (incl. other empties) and is pinned + flagged for data entry, never moved. | Matches the real operation (three daily shifts + a rotating pattern). Same-shift-only is the safe default for room-sharing; treating empty-shift as "compatible with anything" (the old behavior) would auto-place people whose shift we don't actually know — better to flag for data entry than to co-locate wrongly. | ✅ implemented + **DEPLOYED to prod 2026-07-13** (`00ca05fc`; mig 137 via psql, prod 288/288 NULL, new CHECK live). Engine/normalizer/Excel/admin/seed/tests updated. See `consolidationEngine.service.js`, `migrations/137_*`. |
| 2026-07-05 | **Room-hygiene house-rule fine is OUR process, switchable INDEPENDENTLY of the deduction executor.** If a room's hygiene is rated failing on N consecutive completed inspections (default 2 → 10,000 Ft/resident, `HOUSE_RULES`), a fine applies. Own runtime toggle in `hygiene_fine_config` (admin-editable, default OFF), NOT the `DEDUCTION_EXECUTION_ENABLED` env flag. | The auto hygiene-fine did **not** previously exist (only the fine *types* + manual `POST /fines`; `runAutoConversions` is deduction-only). Built as net-new (mig 136 + `hygieneFine.service.js` + admin page under Ingatlan Ellenőrzés → "Házirend-bírság"). It creates the debt record via the existing `createFine` flow (compensations + in-app resident notification) — **never** writes `compensation_payments`, **never** schedules/executes a deduction; payable via the existing cash path or forwarded to the client (payment-plan-as-info decision). Idempotent (keyed to latest inspection+room). Amount / consecutive-count / fail-threshold configurable. | ✅ implemented + deployed to prod (toggle default OFF → no behavior change until enabled). Tests 14/14. Sandbox HTTP demo: 2 failing inspections → one 10,000×N fine, idempotent. See `services/hygieneFine.service.js`. |
| 2026-07-05 | **We only PRODUCE the damage jegyzőkönyv; the client's payroll executes deductions.** Our salary-deduction EXECUTION engine is **mothballed reversibly** (feature flag `DEDUCTION_EXECUTION_ENABLED`, default OFF), NOT demolished. | Legally our process ends when the signed jegyzőkönyv is handed to the client; the client deducts via their own payroll. The engine is kept intact behind a flag with a documented re-enable path for a future **EOR** (Employer-of-Record) model where we'd run payroll. Cash repayments, the `compensation_payments` ledger for cash, payment-history reads (compensation PDF), and the jegyzőkönyv PDF (incl. its `payment_plan` info section) **keep working**. GDPR anonymization of existing `salary_deductions` rows keeps working. | ✅ implemented + **DEPLOYED to prod 2026-07-05** (commit `851ae5e0`; CI green, backend+admin pulled + recreated, verified in the running container: `deductionExecution.js` present + `isDeductionExecutionEnabled()=false`). UI controls hidden behind a mirrored `DEDUCTION_EXECUTION_ENABLED=false` const. Re-enable = set env `DEDUCTION_EXECUTION_ENABLED=true` + flip the two UI consts. See `src/config/deductionExecution.js`. |

---

## KNOWN OVERLAPS / DUPLICATIONS

### Cost tracking: NEW accommodation_expenses vs OLD cost_centers + invoice_classification

**Same business question** (what does each accommodation cost?), **different mechanisms** (manual UI per-accommodation/4-cat vs. AI-classified invoice → hierarchical cost_center).

- No schema link between them (`accommodations` has no `cost_center_id`).
- 10 level-4 cost_centers (`X szálló`) mirror accommodations by name, but coverage is incomplete (6 of 16 accommodations have no matching CC).
- Old pipeline has produced 0 finalized invoices since build. 5 drafts pending unreviewed for a month.
- **Risk:** If old pipeline gets unblocked, expenses go to `invoices` while new ones go to `accommodation_expenses` — profit dashboard misses the old side.

**Status:** Open decision. See `docs/ARCH_COST_TRACKING_OPTIONS.md`. Recommendation: deprecate old pipeline as Phase 3, single source of truth in new system.

### docs/PROJECT_CONTEXT.md vs PROJECT_STATE.md (this file)

- `docs/PROJECT_CONTEXT.md` last updated 2026-03-07 — stale by 2.5 months. Has detail this doc doesn't, but freshness can't be trusted.
- **Status:** treat PROJECT_STATE.md as authoritative for "what exists right now". Use PROJECT_CONTEXT.md for historical depth only.

---

## TECHNICAL DEBT

| Item | Severity | Notes |
|---|---|---|
| ~~Gmail poller may still be running~~ ✅ RESOLVED 2026-07-06 | — | On prod `GMAIL_POLLING_ENABLED=true` had the (dormant) universal poller scheduled every 5 min and **failing `invalid_grant`** repeatedly (log spam). Set `GMAIL_POLLING_ENABLED=false` in the prod `.env.production` + recreated the backend → poller no longer scheduled. (`gmailMCP.service.js` is a deprecated stub delegating to `gmailUniversalPoller`; the invoice pipeline stays dormant.) Re-enable only if the invoice pipeline is revived with a fresh Gmail refresh token. |
| **Prod SMTP not configured** | **medium** | `SMTP_USER`/`SMTP_PASS` (or `EMAIL_USER`/`EMAIL_PASSWORD`) are unset on prod — only GMAIL OAuth is set. So scheduled-report **emails don't deliver** (`Missing credentials for "PLAIN"`). Mitigated 2026-07-05: report outputs are now stored + **downloadable in the admin** (Ütemezett riportok → Előzmények → Letöltés) regardless of email. To restore email delivery, set SMTP creds in the prod `.env` (Gmail app-password or a real SMTP). Ties to the "personal-gmail sender" open item. |
| **`OPS_ALERT_WEBHOOK` unset on prod** | low | Backend `alertOps()` + the shell disk-alert both post to a Slack webhook in `OPS_ALERT_WEBHOOK` (in `~/hr-erp/backup.env`). Until set, alerts **log loudly** (error log) but don't reach Slack. Add a Slack incoming-webhook URL to `backup.env` to activate push alerts for cron failures + disk/backup. |
| ~~`uploads/expenses/` not in backup cron~~ ✅ RESOLVED (verified 2026-07-04) | — | STALE. The nightly `backup.sh` (line 20) already tars all of `/app/uploads` → `uploads-$STAMP.tgz` with the same rotation/retention as the DB dump. Verified on prod: a manual backup produced an archive containing real files under `uploads/expenses/2026/06/<id>/…pdf`, `uploads/tickets/…`, `uploads/documents/…`, `uploads/employees/…`. **Offsite (P0-1) — 2026-07-06:** `backup.sh` now produces **AES-256-encrypted** offsite copies (`backups/offsite/*.enc`), pushes **only** encrypted artifacts via rsync (`--delete` mirror, 30-day retention), and **alerts on any failure** via `OPS_ALERT_WEBHOOK`. Encrypt→decrypt→`pg_restore`→data-intact + uploads-extract **verified** from the encrypted copy (see `docs/BACKUP_RESTORE.md`). **Remaining owner action:** provision a Hetzner Storage Box + add the backup pubkey + fill `STORAGEBOX_HOST/USER` in `backup.env` (steps in the doc) — until then offsite is "SKIPPED, local only". `BACKUP_ENCRYPTION_KEY` is on the VM; **store it off-server (password manager)** for DR. S3 migration remains a future decision (`storage.service.js` is the pluggable seam). |
| pg returns DATE columns as JS Date objects (UTC drift footgun) | medium | pg-node parses DATE as local-midnight `Date`. `JSON.stringify` then calls `.toISOString()` which shifts the day by -1 under CEST. Bit us twice (frontend convert dialog 2026-05-21; convert backend smoke 2026-05-21). Workaround: `fmtDateInput` in `Billing.jsx`, `dateToISODate` in `invoiceDraft.controller.js`, `asLocalDate` in tests. **Better systemic fix:** `pg-types.setTypeParser(1082, (v) => v)` to return DATE columns as raw `'YYYY-MM-DD'` strings — single global change, kills the footgun for every consumer. Deferred because broad blast radius (every consumer of DATE columns would suddenly receive strings); should be a dedicated session with full regression. |
| ~~5 stale `invoice_drafts` rows (since 2026-04-21)~~ ✅ RESOLVED 2026-07-06 | — | STALE. On **prod** all 7 drafts are `status='converted'` (0 pending) — they were already turned into `accommodation_expenses` by the Billing Day 3–4 work. Nothing to archive; the doc's recommendation ("review + enter into accommodation_expenses") is done. |
| 11 of 20 classification rules never matched | low | Cleanup candidate once pipeline disposition decided |
| ~~Tab 4 fixes uncommitted~~ ✅ RESOLVED | — | Long since committed; working tree is clean. Stale entry removed. |
| Billing UI tabs 2 + 3 are placeholders | low | "Billing runs" and "Billings list" views not yet built |
| ~~Compensations payroll cron is DRY-RUN~~ ✅ RESOLVED 2026-07-05 | — | **Decision taken: we don't execute deductions** (the client's payroll does; our process ends at the jegyzőkönyv). The engine is **mothballed behind `DEDUCTION_EXECUTION_ENABLED` (default off)** — the monthly cron is no longer scheduled, the manual `POST /fines/payroll/run` + `scheduleDeduction` + `convert-to-deduction` return 403, and the daily auto-conversion is skipped. Reversible for a future EOR model (see decisions log). Cash repayments + jegyzőkönyv PDF keep working. |
| `docs/PROJECT_CONTEXT.md` is stale | low | Decide: refresh or deprecate |
| Sarród I. vs Sarród II. — old CC has only "Sarród szálló" | low | If AI pipeline revived, split needed |
| **🚩 Migration runner blocked at `093 cleanup_demo_data` (dev DB only)** | medium | Guard "expected exactly 1 user, got 6" fails on the **dev** DB → `npm run db:migrate` stops at 093. **Confirmed 2026-06-11: fresh DBs (CI/test) migrate cleanly through 122** — so CI is unaffected and prod-via-dump-restore is fine. Dev migrations (118–122) applied via psql. **Decide 093's disposition (rewrite guard / mark obsolete) before relying on the runner on dev; do not touch 093 blindly.** |
| **⚖️ GDPR: legal/DPO sign-off before first REAL erasure** | **high** before production | All dispositions are configurable (no code change): finalize retention years + which `statutory_document_types` slugs map to real contract docs; confirm payroll/social-security long-retention categories. The engine is built + verified; the *policy* values need DPO confirmation. |
| GDPR v2 backlog (documented) | low | Out of v1 scope: `activity_logs` JSONB scrubbing, `translation_cache` purge, automatic retention-expiry execution, GDPR data export (portability/Art 20). |
| Expiry monitor has no real data yet | low | `employees.visa_expiry`/`end_date`/`nationality` are empty (0/287). Feature is correct + ready; produces nothing until HR populates these fields. |
| `tickets.view` is blanket + overloaded | medium | Gates 6 endpoints incl. writes (comments, messages); `getTickets`/`getTicketById`/`getAccommodations` are contractor-/system-wide, not self-scoped. Residents deliberately do NOT hold it — they use the self-scoped `/my` endpoints. Staff self-scoping (created_by) is a future refactor if non-superadmin staff ever need narrower views. |
| Resident-facing read endpoints lack self-scope (staff side) | low | Only the new `/my` endpoints are self-scoped; the staff `/tickets`, `/accommodations`, `/documents` remain blanket — fine for staff, but no resident may hold those permissions until row-level filtering is added there too. |
| ~~FAQ tab is Hungarian-only (no translation)~~ ✅ RESOLVED 2026-06-24 | — | `getUserFaqEntries`/`getUserFaqCategories` now translate question/answer/category to the resident's language via the cache-backed `translation.translateText` (translation_cache, 30-day TTL), same as chatbot messages. `?lang` or stored preference; `hu` short-circuits; Hungarian original kept for a toggle. Multilingual parity achieved across chatbot + FAQ. |
| 🔁 Anti-pattern: strict `contractor_id = $1` hides GLOBAL content | medium (code-review check) | A query that filters `WHERE contractor_id = $1` with **no `OR contractor_id IS NULL`** silently excludes globally-authored rows. Bit **5 places**: Számlariportok (invoice reports), chatbot KB matchers, FAQ queries, chatbot suggestions, chatbot decision-trees/config — all fixed by 2026-06-24. **In review:** for any resident-facing query against a *content* table (KB, FAQ, categories, trees, config), confirm it includes global rows. Per-contractor *operational/analytics* data (wellmind, carepath, sentiment, slack) is correctly strict. `ticket_categories` is **intentionally** strict (residents get their curated set, not the global staff taxonomy). |

---

## CURRENT FOCUS

**Recently shipped (2026-06-09 → 11):** resident mobile (self-scope, chat + AI translation, photos, AI category suggestion, full i18n), CI red-since-June-9 diagnosed + fixed, and the two **audit P0** features — visa/contract/document **expiry monitor** and **GDPR anonymization** (right-to-be-forgotten v1).

**🔧 Reliability audit — Phase 1 (2026-07-02/03).** Full audit produced a ranked plan (silent failures / test coverage / data-integrity / security). **4 per-finding PRs merged + deployed to prod, each verified live:** #1 role-write txn (self-lockout), #2 damage-report authz + tenant-scope (**resident→403 confirmed live** — the resident-reachable salary/signature IDOR), #3 un-vacuum 8 test suites (also caught+fixed a live `gamification/leaderboard` 500), #4 document cross-tenant scoping. Also a **CRITICAL prod hotfix**: ticket creation was 500-ing for everyone because `createTicket` cast ALL `ticket_number`s to int and 3 test tickets (`#9001-TESZT`, `#9101-IOS`, `#9102-IOS`) poisoned the aggregate — fixed (filter to `^#[0-9]+$`) + loud DB-error messages + deleted the poison rows. **Phase 1 remainder now DONE (2026-07-04):**
- ✅ **#5 — GDPR erasure completeness (`ed271d8b`).** Erasure now reaches everything (damage_reports biometric signatures/salary/photos, all uploaded files, chatbot/ticket free-text scrubbed, activity_logs IP+JSONB redacted, push tokens, slack), **fails loudly** (ok only when every file deleted; controller returns 207 partial otherwise), TOCTOU-safe (files collected in-txn via RETURNING + SAVEPOINTs), and writes an itemized **erasure receipt**. Founded on `docs/PII_INVENTORY_AND_GDPR_GAPS.md` (`89f5376a`). Regression proves zero PII remains findable. Dispositions locked: scrub free-text to tombstone, null IP + redact JSONB, rely on 30-day backup retention. (DPO retention-value sign-off still separate — see tech-debt.)
- ✅ **#6-7 — money paths (`11719c61`).** `payment.service` now locks the invoice row `SELECT … FOR UPDATE` (race-safe status) + guards terminal `cancelled`; DB pool capped 100→80. Task 3 CRUD batch (`3212c365`/`2566eb9b`) applied the invoice `contractor_id`+`line_items` fix on the LIVE path (`costCenter.controller`; the earlier `invoice.controller` edit was on a dead path — those dead create/update routes retired), fixed the accommodations status-override, and made employee `personal_email`/`personal_phone` editable. Plus `shift_schedule` field (`b1a254c6`).
- ✅ **Staff logins.** Eszti (superadmin, logged in), Timi (`timcsilak@gmail.com`, role **task_owner** — note: not admin, contractor …0001), Noncsi (`noemi@virtualis-asszisztens-online.hu`, **admin**, …0001, temp pw set 2026-07-04, login verified 200). Noncsi already existed as admin; only a known temp password was set.

**🎨 Admin UI overhaul — COMPLETE (2026-07-03).** Shipped + deployed: (A) fixed a double-`<Layout>` wrap on 7 pages (shifted content); (B) sidebar regrouped flat ~20 items → **7 labeled sections** (Áttekintés · Munka · Emberek & Szállás · Pénzügy · Jólét · Tartalom & Support · Adminisztráció; approved by Eszti); (C) **black/gold brand theme** — palette in `theme.js` (primary `#8B6B33`, accent `#BF9E69`, brand-black sidebar) + a full page-by-page color sweep of the ENTIRE admin (Dashboard, Tickets, Employees, Accommodations, Finance, Users/Admin, Inspections, Reports, WellMind/CarePath, Chatbot admin, Contractors, Calendar, Documents, Videos, FAQ, Tasks/Projects, Login + all modals). **Rule applied: decorative brand-blue/purple → gold; ALL semantic colors preserved** — money status (paid/overdue/pending), categorical chart palettes (PIE_COLORS/CHART_COLORS/CostCenters picker array), identity maps (ROLE_COLORS, PRIORITY_DOT), skill-level scales. Repo-wide audit confirmed **zero stray decorative blues/purples remain**. **Intentionally kept as user data:** color-PICKER defaults (new CostCenter/category defaults to `#3b82f6` until the user picks) — flip to gold later only if desired.

**Architectural decisions taken 2026-07-02 (see decisions log):** retire the inert RLS code rather than wire it (tenant isolation stays app-layer `WHERE`); rely on the IP rate-limiter, no account-level lockout (a shared-WiFi roommate could otherwise lock out others).

**Production:** ✅ **LIVE** at app.housingsolutions.hu (Hetzner `167.233.122.3`). Original pre-deploy blockers (DNS, `ENCRYPTION_KEY`) are resolved — the stack is serving real logins.
- **GDPR legal/DPO sign-off** on retention years + `statutory_document_types` before any real erasure (config-only).
- Cost-tracking unification decision (see `docs/ARCH_COST_TRACKING_OPTIONS.md`) — still open.
- Billing admin Tabs 2 (Billing runs) + 3 (Billings list) not yet built; Gmail poller disposition (keep/disable/rewire).

**Designed next phase — Room Consolidation Suggestion Engine (strategic, awaiting data):**
- **Goal:** bed-utilization (bed-occupancy) billing — maximize paid-bed utilization by consolidating residents into fewer rooms.
- **Foundation is DONE + live:** `accommodation_rooms.beds` (capacity, 49 beds / 24 rooms), `employees.room_id` (FK, editable via the bed-aware room dropdown in EmployeeDetailModal), `employees.shift_schedule` (**three-shift model — `delelott`/`delutan`/`ejszaka`/`valtott`, mig 130 + mig 137**, editable dropdown + bulk-Excel "Műszak" column + detail display), and `occupancy_snapshots` already capture `room_id`/`room_beds`/`room_occupant_count`. The billing chain is wired; it just needs data populated.
- **Engine to build — inputs (all now schema-supported):** per-room occupancy + `gender` + `workplace` + **`shift_schedule`** (**SAME SHIFT ONLY may share a room; an empty shift is flagged, never auto-placed**) → output = consolidation suggestions (which residents to move to which rooms to free up rooms while respecting gender/workplace/shift constraints). Goal: bed-utilization billing. **(Engine v1 built + reworked to the three-shift model, sandbox-tested; mig 132 still NOT on prod.)**
- **Data entry now via EXCEL round-trip (2026-07-04, live + tested):** (1) rooms+beds bulk-created via the housing-units upload (`Név`/`Szoba`/`Ágyak száma`, upserts); (2) **Employees page → "Szoba-sablon"** downloads a pre-filled Excel of all 288 employees (identity + accommodation + room + shift); (3) fill the `Szoba` column and **"Szoba-kiosztás"** re-uploads → identity-matched update (never duplicates), room resolved within the employee's accommodation, validated for membership + bed capacity. Also fills `shift_schedule` (`Műszak` column). Endpoints: `GET /employees/room-template`, `POST /employees/room-assignments`. Round-trip regression 11/11.
- **BLOCKED only on the user entering the data** (room assignments 0/288, shift 0) — no longer a code gap; the Excel pipeline is ready. Build the suggestion engine *after* rooms + shifts are populated.
- **Sandbox for building the engine (2026-07-05, local only):** `hr_erp_sandbox` DB + synthetic seed (`docs/SANDBOX.md`). `npm run sandbox:reset` = drop + migrate-from-scratch (fresh DB sidesteps the 093 block) + seed 15 accommodations / 95 rooms / 300 employees (70% room-assigned, day/night + mixed-gender edge cases) + 4 test logins (`*@sandbox.local` / `sandbox123`). Run backend via `npm run dev:sandbox`. Seed guards against non-sandbox DBs; prod/dev untouched. Build + test the consolidation engine here.

**Not in current scope:**
- GDPR v2 (translation_cache purge, auto retention-expiry, data export) — NOTE: activity_logs scrubbing is now DONE (folded into the #5 erasure fix, 2026-07-04)
- OCR re-integration (Phase 3); outgoing billing (Phase 2); currency expansion beyond HUF

---

## FUTURE ROADMAP — Digital HR services

**Status: APPROVED DIRECTION, not in current scope.** The strategic arc is to grow from
housing-ops into a digital HR platform. Sequenced so each phase reuses what's already built and
each external-facing step is gated on a security prerequisite.

### Phase A — Employee self-service, digital onboarding & HR KPI dashboards
Extend the resident/employee portal into HR self-service (onboarding flows, document submission,
e-signing of contracts/policies) + management KPI dashboards (headcount, turnover, time-to-fill,
document-expiry compliance, wellbeing trends). **Reuse, don't rebuild:**
- **Signature capture** — the damage-report jegyzőkönyv already captures employee/manager/witness
  signatures; the same mechanism signs onboarding docs.
- **Documents module** — `documents`/`employee_documents` (expiry-aware) already store + scope
  per-employee files; onboarding uploads land here. (Attaching docs to contractor/partner/
  accommodation is a known gap to close first — see the client+partner+contract inventory.)
- **Chatbot + FAQ** — multilingual (5-locale), cache-backed; becomes the onboarding assistant / HR
  helpdesk with no new NLP work.
- **`entity_status_history`** — already records every status transition; it's the substrate for
  onboarding-stage tracking + the KPI/audit dashboards.

### Phase B — Payroll via INTEGRATION with Hungarian payroll software/bureau
**Hard rule: we NEVER build the payroll calculation engine.** HU payroll (adó/járulék tables,
SZÉP, cafeteria, TB) changes constantly and is a compliance liability. We integrate with an
established HU payroll product/bureau and only feed/receive data.
- **v1 — file export/import:** generate the monthly payroll input file (hours, absences, fines/
  deductions-as-data, allowances) in the partner's format; import their output (net pay, payslips)
  for display. Lowest-risk first step. (Note: our own deduction *executor* is mothballed behind
  `DEDUCTION_EXECUTION_ENABLED` — see decisions log; if we ever run payroll ourselves it's an **EOR**
  model, still on top of a licensed engine, never our own calc.)
- **v2 — API integration** once a partner + volume justify it.
- **Candidate products/bureaus:** XL BÉR, Abacus, infotéka, Deltha.
- **OPEN DECISION:** bureau **partner** (they run payroll as a service) vs **in-house licence** (we
  operate their software). Affects data-flow, liability, and cost — decide before Phase B build.

### Phase C — Public partner API + tenant-isolation (RLS) hardening — REQUIRED GATE
Before exposing anything as external SaaS (partner API, multi-tenant self-serve), tenant isolation
must be real. **Today it is app-layer `WHERE` only** — RLS is inert in prod (app connects as the
postgres superuser; `setDatabaseUser` unmounted — see 2026-07-02 decision). That is acceptable for
first-party staff use but **NOT** for an external/public API where a bug leaks cross-tenant data.
- **Prerequisite (blocking):** proper RLS — a non-superuser DB role, `FORCE ROW LEVEL SECURITY`,
  per-request tenant context in a transaction — before the first external consumer.
- Then: a versioned, authenticated, rate-limited partner API.
- **Gate:** no external SaaS exposure ships until Phase C's isolation is in place and tested.
