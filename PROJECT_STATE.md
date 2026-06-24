# HR-ERP PROJECT STATE

**Last updated:** 2026-06-16
**Maintainer:** lerchbalazs@gmail.com

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
- `migrations/` (under backend) — numbered SQL, latest is **123** (2026-06-13, agent foundation). ⚠️ Runner blocked at `093` on the **dev DB only** (6 users); fresh DBs (CI/test) migrate cleanly through 123. New migrations applied to dev via `psql`; see tech-debt.

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
| `uploads/expenses/` not in backup cron | **high** before production | Local-filesystem storage adapter writes expense file attachments to `hr-erp-backend/uploads/expenses/YYYY/MM/<id>/`. **Add this path to the nightly backup** OR migrate to S3 before production cutover. Pluggable storage interface (`src/services/storage.service.js`) is designed for the S3 swap. |
| pg returns DATE columns as JS Date objects (UTC drift footgun) | medium | pg-node parses DATE as local-midnight `Date`. `JSON.stringify` then calls `.toISOString()` which shifts the day by -1 under CEST. Bit us twice (frontend convert dialog 2026-05-21; convert backend smoke 2026-05-21). Workaround: `fmtDateInput` in `Billing.jsx`, `dateToISODate` in `invoiceDraft.controller.js`, `asLocalDate` in tests. **Better systemic fix:** `pg-types.setTypeParser(1082, (v) => v)` to return DATE columns as raw `'YYYY-MM-DD'` strings — single global change, kills the footgun for every consumer. Deferred because broad blast radius (every consumer of DATE columns would suddenly receive strings); should be a dedicated session with full regression. |
| 5 stale `invoice_drafts` rows (since 2026-04-21) | low | Either review + enter manually into `accommodation_expenses` or archive |
| 11 of 20 classification rules never matched | low | Cleanup candidate once pipeline disposition decided |
| Tab 4 fixes uncommitted | _resolves on next commit_ | `Billing.jsx` working tree modified |
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
| FAQ tab is Hungarian-only (no translation) | medium | `getUserFaqEntries` (`chatbot.controller.js`) ignores `?lang` and returns KB entries as stored (HU), **unlike chatbot messages which translate** via `safeTranslate`. The resident FAQ tab now populates (global-KB fix 2026-06-24) but shows Hungarian to all 5 locales. If residents will rely on the FAQ tab in their own language, apply the translation layer (cache-backed `translation.translateText`) to the entries/categories. |
| 🔁 Anti-pattern: strict `contractor_id = $1` hides GLOBAL content | medium (code-review check) | A query that filters `WHERE contractor_id = $1` with **no `OR contractor_id IS NULL`** silently excludes globally-authored rows. Bit **5 places**: Számlariportok (invoice reports), chatbot KB matchers, FAQ queries, chatbot suggestions, chatbot decision-trees/config — all fixed by 2026-06-24. **In review:** for any resident-facing query against a *content* table (KB, FAQ, categories, trees, config), confirm it includes global rows. Per-contractor *operational/analytics* data (wellmind, carepath, sentiment, slack) is correctly strict. `ticket_categories` is **intentionally** strict (residents get their curated set, not the global staff taxonomy). |

---

## CURRENT FOCUS

**Recently shipped (2026-06-09 → 11):** resident mobile (self-scope, chat + AI translation, photos, AI category suggestion, full i18n), CI red-since-June-9 diagnosed + fixed, and the two **audit P0** features — visa/contract/document **expiry monitor** and **GDPR anonymization** (right-to-be-forgotten v1).

**Pending / next:**
- **Production deployment to Hetzner** — plan ready in `HETZNER_DEPLOY.md`; on standby until the user's Hetzner account clears identity verification. Two pre-deploy blockers: domain/subdomains (DNS ahead of time) + `ENCRYPTION_KEY` carry-over-vs-rotate.
- **GDPR legal/DPO sign-off** on retention years + `statutory_document_types` before any real erasure (config-only).
- Cost-tracking unification decision (see `docs/ARCH_COST_TRACKING_OPTIONS.md`) — still open.
- Billing admin Tabs 2 (Billing runs) + 3 (Billings list) not yet built; Gmail poller disposition (keep/disable/rewire).

**Not in current scope:**
- GDPR v2 (activity_logs scrub, translation_cache purge, auto retention-expiry, data export)
- OCR re-integration (Phase 3); outgoing billing (Phase 2); currency expansion beyond HUF
