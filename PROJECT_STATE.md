# HR-ERP PROJECT STATE

**Last updated:** 2026-05-21
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
- `migrations/` (under backend) — numbered SQL, latest is **112** (2026-05-20)

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
| 2026-05-21 | _uncommitted_ | Tab 4 fixes: 300 ms minimum spinner, removed eager `setData(null)`, refreshKey-based effect |
| 2026-05-21 | `dc0887c0` | Admin `/admin/billing` page, Tab 1 (Expenses CRUD), tabs 2–4 scaffolded |
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
| 5 stale `invoice_drafts` rows (since 2026-04-21) | low | Either review + enter manually into `accommodation_expenses` or archive |
| 11 of 20 classification rules never matched | low | Cleanup candidate once pipeline disposition decided |
| Tab 4 fixes uncommitted | _resolves on next commit_ | `Billing.jsx` working tree modified |
| Billing UI tabs 2 + 3 are placeholders | low | "Billing runs" and "Billings list" views not yet built |
| Compensations payroll cron is DRY-RUN | medium | Promote to live mode when ready |
| `docs/PROJECT_CONTEXT.md` is stale | low | Decide: refresh or deprecate |
| Sarród I. vs Sarród II. — old CC has only "Sarród szálló" | low | If AI pipeline revived, split needed |

---

## CURRENT FOCUS

**Active work:**
- Admin `/admin/billing` page — Tab 1 (Expenses) ✅, Tab 4 (Profit) ✅ with fixes pending commit, Tabs 2 + 3 not yet built.
- Cost-tracking unification decision (see `docs/ARCH_COST_TRACKING_OPTIONS.md`).

**Next steps (proposed):**
1. Commit Tab 4 fixes after browser verification.
2. User picks an architectural option (A/B/C) from the cost-tracking analysis.
3. Build Tab 2 (Billing runs) + Tab 3 (Billings list) for full admin coverage.
4. Decide on Gmail poller status — keep / disable / rewire.

**Not in current scope:**
- OCR re-integration (Phase 3)
- Outgoing billing (Phase 2 per migration 112 header)
- Currency expansion beyond HUF
