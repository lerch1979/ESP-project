# HR-ERP PROJECT STATE

**Last updated:** 2026-07-04
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
- `migrations/` (under backend) — numbered SQL, latest is **130** (2026-07-04, `employees.shift_schedule` for the room-consolidation engine). ⚠️ Runner blocked at `093` on the **dev DB only** (6 users); fresh DBs (CI/test) migrate cleanly through the latest. Newer migrations (118+, incl. 130) applied to dev AND prod via `psql`; see tech-debt.

---

## ACTIVE SYSTEMS (production, in use)

| System | Location | Status | Last touched |
|---|---|---|---|
| Auth + permissions | backend `src/middleware/`, `users` table | live | ongoing |
| Employees / accommodations / contractors | backend `src/{controllers,services}/`, admin pages | live | ongoing |
| Tickets + SLA | backend `tickets*`, admin `Tickets.jsx` | live | ongoing |
| Inspections + damage reports + compensations | backend `inspection*`, `compensation*`, `fine*` | live | ongoing |
| Tasks / GTD / projects | backend `task*`, `project*`, admin `GTDDashboard.jsx` | live | 2026-03-23 |
| Salary + payroll deductions | backend `salary*`, `compensations/SalaryDeductionsList.jsx` | live (cron DRY-RUN) | 2026-05-19 |
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
| 2026-07-02 | **Reliability fixes ship as small per-finding PRs**, each with a regression test, not one branch | Independently reviewable; keeps blast radius small on a now-live prod system | ✅ in progress (PRs #1–#4) |

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
| Gmail poller may still be running | medium | Verify `src/services/gmailMCP.service.js` cron registration. If active, new orphan drafts pile up. |
| ~~`uploads/expenses/` not in backup cron~~ ✅ RESOLVED (verified 2026-07-04) | — | STALE. The nightly `backup.sh` (line 20) already tars all of `/app/uploads` → `uploads-$STAMP.tgz` with the same rotation/retention as the DB dump. Verified on prod: a manual backup produced an archive containing real files under `uploads/expenses/2026/06/<id>/…pdf`, `uploads/tickets/…`, `uploads/documents/…`, `uploads/employees/…`. **Caveat:** coverage is LOCAL-only — offsite push is still skipped (`backup.env` unconfigured); that offsite gap is tracked in the scale-readiness report (P0-1), separate from this item. S3 migration remains a future decision (`storage.service.js` is the pluggable seam). |
| pg returns DATE columns as JS Date objects (UTC drift footgun) | medium | pg-node parses DATE as local-midnight `Date`. `JSON.stringify` then calls `.toISOString()` which shifts the day by -1 under CEST. Bit us twice (frontend convert dialog 2026-05-21; convert backend smoke 2026-05-21). Workaround: `fmtDateInput` in `Billing.jsx`, `dateToISODate` in `invoiceDraft.controller.js`, `asLocalDate` in tests. **Better systemic fix:** `pg-types.setTypeParser(1082, (v) => v)` to return DATE columns as raw `'YYYY-MM-DD'` strings — single global change, kills the footgun for every consumer. Deferred because broad blast radius (every consumer of DATE columns would suddenly receive strings); should be a dedicated session with full regression. |
| 5 stale `invoice_drafts` rows (since 2026-04-21) | low | Either review + enter manually into `accommodation_expenses` or archive |
| 11 of 20 classification rules never matched | low | Cleanup candidate once pipeline disposition decided |
| ~~Tab 4 fixes uncommitted~~ ✅ RESOLVED | — | Long since committed; working tree is clean. Stale entry removed. |
| Billing UI tabs 2 + 3 are placeholders | low | "Billing runs" and "Billings list" views not yet built |
| Compensations payroll cron is DRY-RUN | medium | Promote to live mode when ready |
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
- **Foundation is DONE + live (2026-07-04):** `accommodation_rooms.beds` (capacity, 49 beds / 24 rooms), `employees.room_id` (FK, editable via the bed-aware room dropdown in EmployeeDetailModal), `employees.shift_schedule` (day/night/rotating/flexible — mig 130, editable dropdown + bulk-Excel "Műszak" column + detail display), and `occupancy_snapshots` already capture `room_id`/`room_beds`/`room_occupant_count`. The billing chain is wired; it just needs data populated.
- **Engine to build — inputs (all now schema-supported):** per-room occupancy + `gender` + `workplace` + **`shift_schedule`** (day/night must NOT mix in a room) → output = consolidation suggestions (which residents to move to which rooms to free up rooms while respecting gender/workplace/shift constraints). Goal: bed-utilization billing.
- **Data entry now via EXCEL round-trip (2026-07-04, live + tested):** (1) rooms+beds bulk-created via the housing-units upload (`Név`/`Szoba`/`Ágyak száma`, upserts); (2) **Employees page → "Szoba-sablon"** downloads a pre-filled Excel of all 288 employees (identity + accommodation + room + shift); (3) fill the `Szoba` column and **"Szoba-kiosztás"** re-uploads → identity-matched update (never duplicates), room resolved within the employee's accommodation, validated for membership + bed capacity. Also fills `shift_schedule` (`Műszak` column). Endpoints: `GET /employees/room-template`, `POST /employees/room-assignments`. Round-trip regression 11/11.
- **BLOCKED only on the user entering the data** (room assignments 0/288, shift 0) — no longer a code gap; the Excel pipeline is ready. Build the suggestion engine *after* rooms + shifts are populated.

**Not in current scope:**
- GDPR v2 (translation_cache purge, auto retention-expiry, data export) — NOTE: activity_logs scrubbing is now DONE (folded into the #5 erasure fix, 2026-07-04)
- OCR re-integration (Phase 3); outgoing billing (Phase 2); currency expansion beyond HUF
