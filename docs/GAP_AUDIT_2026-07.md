# GAP AUDIT — 2026-07-13

**Scope:** what does NOT work today, from the owner's perspective. Read-only audit; no fixes made.
**Method:** every claim verified against the **live prod system** on 2026-07-13 — Postgres row counts + field fill-rates, `/app/logs/combined-*.log` (last 14 days), the host crontab, the backend container env, and the report-generator source. **Not** taken from PROJECT_STATE/SESSION_LOG.
**Severity key:** **blocks** = stops real work · **annoys** = usable but degraded/confusing · **cosmetic** = looks unfinished, no functional loss.

> Honest headline: the platform's **core operational spine works** (auth, employees, accommodations, tickets, cost-centers, occupancy billing, damage/compensation, activity log). Most of the *breadth* — wellbeing, carepath, inspections, projects, salary, documents, videos, chatbot trees, consolidation — is **either empty (no data ever entered) or not wired up**. Two menu pages return HTTP 500 today. All outbound email is dead.

---

## Data completeness on prod (the inputs features depend on)

288 employees (all active, 0 with `end_date`). 16 accommodations, 24 rooms, 49 beds.

| Field | Filled | Starved feature |
|---|---|---|
| `workplace` | **283 / 288 (98%)** | — (fine) |
| `room_number` (free text) | **287 / 288 (99.7%)** | shown in reports (OK) |
| `arrival_date` | **287 / 288** | shown in reports (OK) |
| **`room_id` (FK to a real room)** | ✅ **287 / 288 (99.7%)** *(linked 2026-07-13 by the room-linker; was 0)* | Consolidation/bed-billing — FK gap closed. **BUT** 116 of the 140 rooms were created with `beds=0` (unknown) → still need bed counts before consolidation is useful |
| **`shift_schedule`** | **0 / 288 (0%)** | **Consolidation engine** (just migrated to the 3-shift model; nobody assigned yet) |
| **`nationality`** | **0 / 288 (0%)** | **Expiry monitor** per-nationality permit lead-times |
| **`visa_expiry`** | **2 / 288 (0.7%)** | **Expiry monitor**; "Vízum lejárat" column in the employee report |
| `passport_number` | 84 / 288 (29%) | expiry monitor (partial) |
| `position` (Munkakör) | **0 / 288 (0%)** | "Munkakör" column in the employee report (blank) |
| `user_id` (has a login) | **2 / 288 (0.7%)** | Email/phone columns in reports; any resident-facing feature |
| `end_date` | 0 / 288 | tenure/offboarding reports |

---

## (A) BROKEN — real bugs (verified erroring on prod, last 14 days)

| # | What | Evidence (prod, 2026-07-13) | Severity |
|---|---|---|---|
| A1 | ✅ **FIXED 2026-07-13.** Room-consolidation page no longer 500s. | Was: `relation "consolidation_config"/"consolidation_runs" does not exist` (mig 132 never applied to prod). **Fix:** applied mig 132 to prod via psql — both tables now exist; `consolidation_config` has the identity 3-shift matrix; the page's read queries (`SELECT ... consolidation_runs`, `consolidation_config`) return cleanly. *(Note: still data-starved — `room_id`/`shift` 0%, see B1 + the room-linker.)* | ~~blocks~~ → resolved |
| A2 | **Scheduled-report emails never deliver.** All 4 active reports run and store an .xlsx, but 0 recipients ever receive it. | `scheduled_report_runs`: every recent run `status=success` but `delivered_count=0/2`; log: `Email küldési hiba: Missing credentials for "PLAIN"` to real addresses (nagy.eva@abc-kft.hu, kiss.janos@abc-kft.hu, admin@hr-erp.com) on 07-10 & 07-13. Root cause = SMTP unset (see C1). **Pending owner-provided SMTP creds (audit item 4).** | **blocks** (clients get nothing; mitigated only by manual download in the UI) |
| A3 | ✅ **FIXED 2026-07-13.** Slack admin page no longer 500s. | Was: `column u.name does not exist` — three queries joined `u.name`, but `users` has `first_name`/`last_name`. **Fix:** all three (`slack.controller.getSlackUsers`, `slackBot.service`, `nlp/sentimentAnalysis.service`) now use `NULLIF(TRIM(first_name||' '||last_name),'')`; deployed + query verified live; regression test `tests/slackUsers.test.js`. *(Slack still unconfigured — no bot token, C4.)* | ~~annoys~~ → resolved |

No other distinct application errors in the last 14 days. The high log-line counts for `invalid_grant` (1916) are **historical** — the Gmail poller was disabled 2026-07-06 and produced **0** such errors from 07-07 onward (verified per-day). The rate-limiter incident is **resolved** (see appendix).

---

## (B) EMPTY — the feature works but is starved of data

Row = a page/feature that loads without error but shows nothing (or near-nothing) because its table is empty on prod. "Who provides" = who must enter the data for it to become useful.

| # | Page / feature | Prod data | Who must provide the data | Severity |
|---|---|---|---|---|
| B1 | **Consolidation engine** (A1 fixed) | `room_id` ✅ 287/288 (linked), but 116 rooms `beds=0`; `shift_schedule` 0/288 | **Room-linker EXECUTED on prod 2026-07-13** (`scripts/link-room-ids.js`): 287 employees linked (33 to existing rooms, 254 via **116 new rooms, beds=0**). **Remaining for HR:** (a) enter **bed counts** for the 116 flagged rooms — a per-accommodation fill-in Excel was exported to `uploads/reports/agyszam-kitoltendo-2026-07-13.xlsx` (9 manager sheets); (b) fill `shift_schedule` | **blocks** until beds+shifts entered |
| B2 | **Expiry monitor** (`/expiry-monitor`, toggle ON) | `visa_expiry` 2/288, `nationality` 0/288, `end_date` 0/288 | HR: enter visa/permit dates + nationality | **blocks** (monitors ~nothing) |
| B3 | **Inspections module** (dashboard, reports, schedules, tasks, room-trends) | `room_inspections` 0, `inspection_schedules` 0, `inspection_tasks` 0, `inspection_item_scores` 0, `inspection_photos` 0, `*_trends` 0 — only **1** inspection ever | Inspectors: actually perform inspections in-app | **blocks** (5 empty menu pages) |
| B4 | **Hygiene fine** (`/inspections/hygiene-fine`) | Depends on `room_inspections` (0); can never fire | Needs B3 first (+ enable toggle, see C3) | annoys |
| B5 | **WellMind** (dashboard, risk-employees, trends, interventions, team-metrics, sentiment) | `wellmind_assessments` 0, `wellmind_pulse_surveys` 0, `wellmind_interventions` 0, `wellmind_ml_predictions` 0, `wellmind_team_metrics` 0 (only 28 questions configured) | Employees complete pulse/assessments — which needs a working prompt channel (Slack/email/mobile, currently not delivering) | **blocks** (6 empty pages) |
| B6 | **CarePath** (dashboard, cases, bookings) | `carepath_cases` 0, `carepath_provider_bookings` 0, `carepath_sessions` 0 (10 providers, 6 categories configured) | Staff: open cases + create bookings | annoys |
| B7 | **Projects** (`/projects`) | `projects` 0 (tasks exist separately: 12) | Anyone: create a project | annoys |
| B8 | **Salary transparency** (`/salary-transparency`) | `employee_salaries` 0 (6 bands configured) | HR/payroll: enter salary data | annoys |
| B9 | **Documents** (`/documents`) | `documents` 0 (4 employee-attached docs exist elsewhere) | Upload documents | annoys |
| B10 | **Videos** (`/videos`) | `videos` 0 | Upload training videos | cosmetic |
| B11 | **Chatbot** sub-pages: decision-trees, faq-categories, analytics, config | `chatbot_decision_trees` 0, `chatbot_faq_categories` 0, `chatbot_analytics` 0, `chatbot_config` 0 (KB 17 + 15 conversations DO work) | Build decision trees / let analytics accrue | annoys |
| B12 | **Calendar** (`/calendar`) | `leave_requests` 0, `medical_appointments` 0, `personal_events` 0 — only 3 `shifts` | Create events; leave/medical modules unused | annoys |
| B13 | **Gamification** (leaderboard/badges) | `user_badges` 0, `wellbeing_points` 0, `wellbeing_streaks` 0 (7 badges defined) | See C5 — points aren't being awarded, so no user has any | cosmetic |
| B14 | **Worker specializations** (`/admin/worker-specializations`) | `user_skills` 0 (5 specializations defined) | Map employees→skills | cosmetic |
| B15 | **Employee status report** (delivered weekly) | Columns **Munkakör** (position 0/288), **Email/Telefon** (2/288 have logins), **Vízum lejárat** (2/288) come out blank; identity/workplace/accommodation/room/arrival are fine | HR: fill position + visa; provision logins | annoys |

---

## (C) NOT WIRED — built but not connected or switched on

Row = the feature exists in code but is disconnected. "One step" = the single action to connect it. Items marked *(by design)* are intentional decisions, listed for completeness, not as defects.

| # | Feature | Why it's dark | The one step to enable | Severity |
|---|---|---|---|---|
| C1 | **All outbound email (SMTP)** | `SMTP_HOST/USER/PASS` + `EMAIL_USER/PASSWORD` all **unset** on prod → every email silently fails `Missing credentials`. Breaks scheduled reports (A2), expiry digests, wellbeing manager summaries, high-risk alerts. | Set SMTP creds in prod `.env.production` + `up -d backend` | **blocks** (systemic — kills every email output) |
| C2 | **Ops alerting (Slack webhook)** | `OPS_ALERT_WEBHOOK` **unset** → backup/disk/cron-failure alerts only write to the log, never reach a human. You are flying blind on infra failures. | Add a Slack incoming-webhook URL to `~/hr-erp/backup.env` | annoys (until something fails) |
| C3 | ✅ **DONE 2026-07-13.** Room-consolidation tables | mig 132 applied to prod (A1). Tables exist, identity matrix seeded. *Still needs B1 data to produce useful suggestions.* | resolved |
| C4 | **Slack integration** | `SLACK_BOT_TOKEN` unset + `slack_users`/`slack_checkin_config` 0 rows + the A3 query bug | Set the bot token, configure check-in, fix the `u.name` query | annoys |
| C5 | **Gamification point-award** | Badges (7) seeded but `wellbeing_points`/`user_badges`/`streaks` all 0 — the hooks that award points on activity aren't firing on prod | Investigate whether the award hooks are wired to real events (needs a code trace, not just config) | cosmetic |
| C6 | **Google Calendar sync** | `google_calendar_tokens` 0 → not connected | OAuth-connect a Google account | cosmetic |
| C7 | Hygiene fine toggle | `hygiene_fine_config.enabled = false` | Flip toggle — *but useless until B3/B4 supply inspection data* | annoys |
| C8 | Gmail/invoice pipeline *(by design)* | Poller disabled 2026-07-06 (was flooding `invalid_grant`); `invoices` 0 | Intentionally dormant — leave off unless the invoice pipeline is revived | — |
| C9 | Salary-deduction executor *(by design)* | `DEDUCTION_EXECUTION_ENABLED` unset | Intentional mothball (client's payroll executes) | — |
| C10 | NLP sentiment *(by design)* | `nlp_sentiment_config` 0 / disabled by default | Intentional opt-in | — |

---

## Appendix — crons, reports, incident status (items 2, 3, 6)

**Scheduled jobs on prod.** Host crons (verified in `crontab -l`): backup 02:30, disk-alert hourly, image-prune Sun 04:00 — all fire; failure alerts go nowhere (C2). In-app crons (node-cron in `server.js` + `cronSchedule.js`, "9 jobs initialized" logged on each of 18 restarts in 14d): occupancy snapshot 00:30, expiry monitor 07:00, GDPR reminder 08:00, monthly billing 1st-01:00 (ran 2026-06 OK), monthly payroll 1st-03:00 (logs `MOTHBALLED`, by design), + wellbeing set (pulse/assessment/carepath reminders, high-risk alert, manager summary, notification queue every 5min, summary refresh). **Delivery reality:** crons that write **in-app notifications** work (`notifications` 77, `wellbeing_notifications` 67 rows). Crons that **email or Slack** produce nothing a human receives — email dies at SMTP (C1), Slack has no token (C4). So the expiry digest, wellbeing manager summary, and high-risk alerts effectively reach no one.

**Report types (4 active).** All generate + store an .xlsx; none deliver by email (A2).
- `occupancy` — source `occupancy_snapshots` (8236 rows): **complete**.
- `tickets` — source `tickets` (23): **complete**.
- `cost_centers` — monthly `accommodation_expenses` (18): **complete** (the earlier `Unknown report type` failure is fixed; 07-13 run succeeded).
- `employees` — see B15: identity/workplace/accommodation/room/arrival populated; **Munkakör, Email, Telefon, Vízum lejárat columns blank** due to missing source data. `start_date`/`end_date` are SELECTed but not emitted (cosmetic).

**Known-broken from logs (14 days, deduplicated):** A1 (consolidation tables), A2 (email creds), A3 (slack `u.name`). Everything else is historical: the `invalid_grant` flood **stopped 2026-07-06** (0/day since).

**Rate-limiter incident: RESOLVED.** Fixed + deployed 2026-07-13 (global 5000/15min per-IP, per-user 10000/hr, login-only strict limiter); **0 × 429 since**; acceptance test guards it in CI. Not an open item.
