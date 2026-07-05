# SESSION HANDOFF LOG

Newest entries first. Each session is one block. Append, do not edit history.

For long-running context (architecture, dormant systems, overlaps) see `PROJECT_STATE.md`.

---

## SESSION 2026-07-05f — Consolidation v3: approval → MOVE TASK lifecycle (SANDBOX ONLY)

Restructured consolidation-plan APPROVAL so it no longer silently rewrites room assignments. Rooms now change in the software ONLY when the physical move is confirmed done — mirroring doing it by hand: **instruct → execute → confirm**. Occupancy snapshots + billing therefore reflect reality throughout (room_id is untouched until confirm), and the stability clock starts at confirm, not approval. **mig 134** (sandbox only): `consolidation_plans` (run_id, plan_key, status `approved_pending_move|moved|partially_moved|cancelled`, ticket_id, assignee_user_id, due_date, move/applied/skipped counts, approved/confirmed by+at). `agent_suggestions.status` gains `approved` / `skipped` / `cancelled` (free VARCHAR).

**Lifecycle (engine `approvePlan`/`confirmMove`/`cancelPlan`/`getPlans`, replacing `applyGroup`):**
- **Approve** → creates ONE move ticket per plan (reuses the existing ticket system; category `moving`/"Költözés", status `new`, assignee + due date chosen at approval; body = the human-readable move list: who, from room → to room, accommodation names). Suggestions go `pending`→`approved`. **NO room_id changes.**
- **Confirm** (the physical move is done) → applies exactly the CHECKED moves atomically, then `entity_status_history` + stability start NOW. Partial completion: a confirm screen lists each move with done/not-done checkboxes (default done); unchecked moves are `skipped` with a logged reason and the plan becomes `partially_moved`. Re-validates against current state at confirm — if the plan went stale (employee left / lost their room / dest room gone) it returns a **conflict** surfaced clearly (not a silent failure); the destination-room validity guarantee (assertRoomsValid) still holds, so an interdependent partial that would overflow a room is rejected as `invalid`.
- **Cancel** an approved-pending plan → closes the ticket (`closed_unsuccessful`), suggestions `cancelled`, **no room changes**.
- Controller/routes: `POST /consolidation/runs/:id/{approve,confirm,cancel}` (edit perm); `GET /runs/:id` now returns `{run, suggestions, plans}`.

**UI (`ConsolidationEngine.jsx`):** plan cards show the full lifecycle chip (Javasolt → *Jóváhagyva — költöztetés folyamatban* [ticket #, felelős, határidő] → Beköltöztetve / Részben beköltöztetve / Visszavonva). Approve opens a dialog (assignee Select from `/users`, due-date picker → creates the ticket); confirm opens a dialog with per-move checkboxes + reason fields for unchecked; cancel button on pending-move plans. Per-suggestion status chips (Javasolt/Jóváhagyva/Beköltöztetve/Kihagyva/…). `api.js` gains `approve/confirm/cancel`.

**Tests (`tests/consolidationEngine.script.js`, 60 checks, idempotent, ALL PASS):** kept all v2 planner/constraint proofs; added the lifecycle — approve creates a `moving` ticket (assignee+due) + sets suggestions `approved` + makes **ZERO room changes** + does not start the stability clock; a stale confirm surfaces a **conflict** and applies nothing; confirm(all-done) applies atomically → rooms change now, ticket `completed`, plan `moved`, history/stability written; **partial** (one unchecked) → skipped+reason logged, others applied, plan `partially_moved`; **cancel** → suggestions cancelled, ticket `closed_unsuccessful`, zero changes; re-confirm refused; stability e2e on confirmed-moved employees. (Also fixed pre-existing seed fragility: `activity_logs`/consolidation artifacts now cleared before deleting users, else reseed 400'd on the FK.)

**Verified in-browser (Claude for Chrome, full loop):** run → approve Szálló 06 plan (assignee Admin Sandbox, due 2026-07-20) → **ticket #13 created** (category Költözés, move-list body shown on the ticket page as the assignee), DB confirms **0 room changes at approval** (all 50 suggestion-employees still in FROM rooms) → confirm with **Rácz Máté (103→106) unchecked + reason** → DB: **7 applied / 1 skipped**, Rácz still in 103, plan **partially_moved**, ticket **completed**, 7 room-history rows. Sandbox reseeded pristine. **mig 134 NOT applied to prod; nothing deployed.**

---

## SESSION 2026-07-05e — Room Consolidation Engine v2: accommodation-level strategy (SANDBOX ONLY)

Extended the consolidation engine (v1→v2) with the strategy layer, keeping every v1 hard guarantee + atomic plan-apply. **mig 133** (sandbox only, NOT prod): `accommodations.consolidation_role` (core/buffer/normal/phase_out) + `consolidation_locked` bool + CHECK; `accommodation_workplaces(accommodation_id, workplace)` binding table; `consolidation_config.stability_days` (60) + `weight_drain`.

**New HARD constraints (impossible to violate — proven on every suggestion):**
- **Workplace binding** — a move may only TARGET an accommodation whose workplace list contains the employee's workplace (empty list = unrestricted). Same severity as the gender rule.
- **Lock** — a locked accommodation is never touched (no moves in or out), regardless of role.
- **Stability** — an employee moved by an applied suggestion is frozen for `stability_days` (60), read from `entity_status_history` (source='consolidation').

**Strategy + cross-accommodation moves.** Roles drive drain/fill order: buffer & phase_out DRAIN first, core FILLS first, normal default. v1 was same-accommodation only; v2 allows cross-accommodation moves (subject to all hard constraints). Engine design: a **pure, exported planner** (`planConsolidation`, unit-tested with no DB) runs two passes that keep every room valid *by construction* — **Pass A** within-accommodation consolidation (v1 logic, now pinning stability-frozen/locked residents), **Pass B** cross-accommodation drain of buffer/phase_out into core-first/normal targets, room-by-room all-or-nothing. Net moves = final-vs-original room diff. **Plans** = accommodations connected by cross-moves (union-find); apply is atomic per plan; a within-only site is its own plan (v1 behavior preserved). `entity_status_history` now records the room change AND (for cross-moves) a separate accommodation change (awaited, not fire-and-forget). Fixed the apply-time validator to check only the rooms a plan **composes** (destination rooms) — validating the whole accommodation wrongly rolled back valid plans when a cross-move drained into a site with a pre-existing unrelated conflict.

**Proof (`tests/consolidationEngine.script.js`, 40 checks, idempotent via snapshot/restore, ALL PASS):** pure-planner unit tests for workplace-only-blocker→skip, admitted→cross-drain, lock (no in/out, never a drain target), stability (10d frozen / 90d movable); full-run constraint proofs that EVERY suggestion satisfies workplace binding + touches no locked site + every composed room is single-gender/shift-ok/within-capacity/workplace-admitted; reject → approve(plan, atomic) → verify room_id+accommodation_id applied + entity_status_history room & accommodation records; committed-DB validity; re-apply refused; stability end-to-end (just-moved employees not re-suggested).

**Seed** (`seed_sandbox.js`) now has a deterministic role cast so cross-moves are guaranteed testable: CORE "Szálló 15" near-full + workplace-bound to Audi Győr with 2 free beds; BUFFER "Szálló 01" (2 Audi day males → drain to core, 1 Bosch whose workplace the core excludes); PHASE_OUT "Szálló 02" (Mercedes → drain to normals); LOCKED "Szálló 03" (under-consolidated, must be left alone); 11 random-filled normals (mixed-gender/shift edge cases). Also fixed a **pre-existing sandbox bug**: the seed set `accommodations.type='worker_hostel'`, which is not in the controller's `VALID_TYPES` → *any* accommodation edit-save 400'd; switched to `dormitory` (Munkásszálló).

**UI.** Accommodation admin (`AccommodationDetailModal`): role Select + lock Switch + workplace-binding Autocomplete (edit) and role/lock/workplace display (view). Consolidation page (`ConsolidationEngine.jsx`) now groups by **plan** (not accommodation), shows a role badge per site, marks cross-accommodation moves clearly (⇄ title, "N szálláshelyközi" chip, per-row "Szálláshelyközi" tag with from/to accommodation names), applies per plan. Fixed an apply bug (`run.run_id` → `run.id`; the loaded run object carries `id`, not `run_id` — latent since v1, never hit via UI).

**Verified in-browser (Claude for Chrome, admin@sandbox.local):** run → the top plan links **Szálló 15 (Mag) ⇄ Szálló 01 (Puffer) ⇄ Szálló 05 (Normál) ⇄ Szálló 02 (Kivezetendő)** with role badges + "6 szálláshelyközi"; approve → `apply` 200; DB confirms the **buffer fully drained into the workplace-bound core** (Audi workers; core 12→14), **phase_out drained into a normal**, and **6 accommodation-change + 12 room-change** history records. Accommodation edit-save round-trip (role=buffer, locked=true, workplaces=[Audi, Bosch]) → 200 + persisted. Sandbox reseeded pristine afterward. **mig 133 NOT applied to prod; nothing deployed.** NEXT: user review on the sandbox; deploying v2 = apply mig 133 to prod + set real roles/locks/workplace lists (a separate go decision).

---

## SESSION 2026-07-05d — fix sandbox admin blank page + one-click desktop launcher (SANDBOX ONLY)

The admin SPA rendered a **completely blank page** at `localhost:5173` against the sandbox backend. Reproduced + diagnosed with Claude-for-Chrome (empty `#root`, no thrown console error): the network tab showed `GET /public/locales/{hu,en,tl,uk,de}/common.json?import` returning **HTTP 503**. Root cause: `hr-erp-admin/src/i18n/index.js` imported the bundled translation JSON from **`../../public/locales/…`**, but **Vite 5 forbids importing assets out of the `public/` directory** — the dev server returns 503 for the `?import` request, the `i18n` module threw during evaluation, and since `main.jsx` imports `./i18n` at top level, the whole React tree never mounted (blank page, no error surfaced). The earlier backend `/public/locales` 404s were the same requests proxied through to :3001 (`vite.config.js` proxies `/public`→backend), a symptom not the cause. **Fix:** `git mv hr-erp-admin/public/locales → hr-erp-admin/src/i18n/locales` and repoint the 5 imports to `./locales/…` (they're now bundled legitimately for both dev AND `vite build`). Nothing else referenced `public/locales` (the resident i18n guard targets the *mobile* app's own `src/i18n/locales`). Verified in-browser: login page renders, login `admin@sandbox.local`/`sandbox123` → dashboard (15 accommodations synthetic data), **Szállások → Konszolidáció runs the engine → 33 moves / 7 freed rooms / 15 freed beds / 4 sites** (`POST /consolidation/run` 200).

**One-click launcher (so the user never touches the terminal again):** `scripts/sandbox/{start,stop}.sh` (version-controlled logic) + two double-clickable Desktop wrappers **`HR-ERP Sandbox.command`** / **`HR-ERP Sandbox – Stop.command`**. Start: fixes GUI `PATH` (adds `/usr/local/bin`+`/opt/homebrew/bin`), bootstraps the sandbox DB via `sandbox:reset` **only if `hr_erp_sandbox` is missing** (non-destructive on re-launch), starts backend `dev:sandbox` (:3001) + admin Vite (:5173) detached via `nohup` (survives closing Terminal), polls `/health` + the SPA until both answer, then `open -a "Google Chrome" localhost:5173`. Reuses already-running servers instead of duplicating. Stop: kills by recorded PID (+`pkill -P` children) with a port-based fallback on 3001/5173; **DB untouched**. Runtime PIDs/logs in `.sandbox-run/` (gitignored). Verified end-to-end: stop freed both ports → start brought both up under fresh PIDs → login page served (confirmed with Chrome automation). Prod never contacted; no deploy.

---

## SESSION 2026-07-05c — Room Consolidation Suggestion Engine v1 (SANDBOX ONLY)

Built the consolidation engine entirely against `hr_erp_sandbox` — no deploy, prod untouched (mig 132 applied to sandbox only). `consolidationEngine.service.js` proposes within-accommodation room moves to free whole rooms for active employees, honoring HARD constraints: no mixed-gender rooms, shift compatibility (configurable matrix — default: day/night never share, rotating own group, flexible ↔ anything), bed capacity, same-accommodation. Prioritization weights + the matrix live in `consolidation_config` (mig 132), read fresh each run (expiry-monitor pattern); defaults work. **Approval model:** the engine NEVER moves anyone — it writes one `agent_suggestions` row per move (reusing the mig-123 scaffold; run-level summary in the new `consolidation_runs`). Because consolidation moves are INTERDEPENDENT (freeing a room needs all its residents to move; a target is valid only once incompatible residents leave), apply is ATOMIC per site/run in a transaction with a final-state validation + rollback — not per-isolated-move. Approve applies `room_id` + logs `entity_status_history`; reject archives with reason. API under `/consolidation/*`; admin page `/accommodations/consolidation` (run, review per-site plans ranked by score, approve/reject). Proof: `tests/consolidationEngine.script.js` 24/24 — hard constraints hold on ALL suggestions (6 seeded conflicts in touched sites → 0 after), full reject→approve→verify flow, committed DB valid, idempotent re-apply refused. API smoke on the sandbox backend confirmed run→get→apply. NEXT: user reviews on the sandbox; deploy (apply mig 132 to prod) is a separate go decision. v1 scope note: consolidates only sites where it can free a room (pre-existing violations in un-consolidatable sites are out of scope — a future "compliance repair" mode); cross-accommodation moves are v2.

---

## SESSION 2026-07-05b — scheduled-reports prod issue (silent email failures + missing generator)

Prod investigation (read-only logs/DB first). The monthly "Havi költséghely összesítő" failed with `Unknown report type: cost_centers` (no generator), and the 3 "successful" reports never delivered — every email failed `Missing credentials for "PLAIN"` (prod SMTP unconfigured; only GMAIL OAuth set) yet each was marked `success`, and outputs were only emailed (never stored) so the user couldn't find them. Fixes (`b501375b`, tested in the sandbox first, 11/11): cost-summary generator (accommodation_expenses monthly, month as SQL `YYYY-MM` string → dodges the DATE UTC-drift footgun; empty month → placeholder not a failure); executeReport now STORES the Excel (`uploads/reports/<runId>.xlsx`, mig 131) + records true `delivered_count` (no silent success) + a download endpoint + admin history "Letöltés"/delivery column; cron jobs fail LOUDLY via `alertOps` (OPS_ALERT_WEBHOOK, logs always). Applied mig 131 to prod, deployed. Verified live: the failed report now succeeds + stores + records delivery 0/1 truthfully. Two ops config items now in tech-debt: prod SMTP unset (emails won't deliver until configured — outputs downloadable meanwhile) and OPS_ALERT_WEBHOOK unset (alerts log-only until added to backup.env).

---

## SESSION 2026-07-05 — synthetic sandbox for building the consolidation engine

Built a safe local sandbox (`docs/SANDBOX.md`) so new features can be developed against fully synthetic data with prod untouched. `hr_erp_sandbox` DB migrates cleanly from scratch (120 migrations — a fresh DB sidesteps the dev 093 block). Idempotent, guarded seed (`src/database/seed_sandbox.js` — refuses non-sandbox DBs) generates 1 contractor, 15 accommodations / 95 rooms / 328 beds (varied utilization incl. under-used + nearly-full sites), 300 synthetic employees (gender/workplace/shift, 70% room-assigned, 30% unassigned, + mixed-gender and day/night edge-case rooms for the engine's constraints), tickets + expenses, and 4 logins (`superadmin@`/`admin@`/`resident1@`/`resident2@ sandbox.local`, pw `sandbox123`). One-command `npm run sandbox:reset` (drop+migrate+seed) + `npm run dev:sandbox`. Verified: backend runs on the sandbox, admin login works, Employees + Accommodations endpoints return the synthetic data. Nothing deployed; prod never contacted. (Caught 3 seed bugs during the build: wrong `accommodation_contractors` column, `billing_month` char(7) format, and a `null`-category ticket tripping the `alert_critical_ticket` wellbeing trigger.)

---

## SESSION 2026-07-04b — room-assignment Excel round-trip (consolidation-engine data entry)

Made the room-consolidation input data fillable via Excel (`7939d954`): verified the existing housing-units bulk already upserts rooms+beds; built `GET /employees/room-template` (pre-filled export of all 288 employees) + `POST /employees/room-assignments` (identity-matched update — never duplicates — with room-belongs-to-accommodation + bed-capacity validation, plus shift column) + Employees-page buttons "Szoba-sablon"/"Szoba-kiosztás". Round-trip regression 11/11; live smoke: template returns a valid 288-row xlsx on prod. Consolidation engine now blocked only on the user entering room+shift data, not code. Deployed backend+admin.

---

## SESSION 2026-07-04 — GDPR #5 + money paths + Task 3 CRUD + shift field; doc sync

Shipped reliability Phase-1 remainder (all deployed + tested): **#5 GDPR erasure** made complete/loud/receipted (`ed271d8b`, founded on the committed PII inventory `89f5376a`), **#6-7 money paths** (payment race `FOR UPDATE`, pool cap), the **Task 3 data-integrity** batch (live-path invoice `contractor_id`/`line_items`, employee personal contacts editable, accommodation status-override, retired legacy `/users`), and the **`shift_schedule`** field for the room-consolidation engine (mig 130). Verified **backup already covers uploads** (incl. `uploads/expenses/`) — the "not in backup cron" tech-debt was stale (offsite still separate/open). Set a known temp password for **Noncsi** (already an admin on …0001) — login verified 200. Then a **doc sync**: reconciled `PROJECT_STATE.md` with `git log --since 2026-07-02` (marked #5/#6-7 done, extended RECENT WORK through 07-04, corrected the header "latest migration 123"→130, closed the stale backup + "Tab 4 uncommitted" tech-debt items). No code changes in the sync.

---

## SESSION 2026-07-03 — reliability PRs merged+deployed, ticket-creation hotfix, full admin black/gold overhaul

Continuation of the 2026-07-02 reliability work, plus a staff-driven UI overhaul. Everything below is **live in prod** (app.housingsolutions.hu, manual `docker compose pull admin/backend`).

**Reliability (backend):**
- Merged + deployed the 4 audit PRs (#1 role-write txn, #2 damage-report authz, #3 un-vacuum tests, #4 doc tenant-scope). **Verified live**: minted a real resident JWT via the prod container's `JWT_SECRET` → `GET/DELETE /damage-reports` now returns **403** (was the resident-reachable salary/signature IDOR).
- **CRITICAL hotfix**: staff couldn't create ANY ticket — `createTicket` cast every `ticket_number` to int for the next-number calc, and 3 leftover test tickets (`#9001-TESZT`, `#9101-IOS`, `#9102-IOS`) poisoned the aggregate (Postgres 22P02). Root-caused from prod logs (no re-click needed). Fixed: filter to `^#[0-9]+$` + map DB errors to loud, specific messages (frontend already surfaces `response.data.message`). Deleted the 3 poison rows.

**Admin UI overhaul (frontend) — all approved via live review with Eszti, done as per-increment PRs:**
- A: removed double-`<Layout>` wrap on 7 pages (EmailTemplates etc — content was shifted).
- B: sidebar → 7 labeled sections (permission-aware, drops empty sections).
- C1: black/gold palette in `theme.js` + brand-black sidebar.
- C2 (5 increments): swept the ENTIRE admin page-by-page, decorative blue/purple → gold, **all semantic/categorical/status colors preserved**. Repo-wide audit → zero stray decorative blues/purples. Details in PROJECT_STATE "Admin UI overhaul — COMPLETE".

**Process notes for next time:**
- CI's admin Docker build hit a **Docker Hub 500** twice (transient, pulling the nginx base image) — `gh run rerun --failed` fixed it both times. Not a code issue.
- A file-exclusion regex `Reports\.jsx` silently also matched `ScheduledReports.jsx` (substring) — caught in the final audit. Watch substring matches when filtering file lists.
- Verifying prod fixes by minting a scoped JWT inside the backend container (`docker exec … node -e "jwt.sign(...)"`) is a clean way to test role-gated endpoints live without a real user's password.

**Next fresh session: reliability Phase 1 #5 (GDPR erasure — first, legally sensitive), then #6-7 money paths. Plus Timi/Noncsi login confirmations.**

---

## SESSION 2026-07-02 — prod login incident → silent-failure fixes → reliability audit (Phase 1)

Started as "create staff test accounts", turned into a production incident + a full reliability audit. **Production is LIVE** at app.housingsolutions.hu (Hetzner `167.233.122.3`, Docker Compose) — the deploy docs that said "no server exists" were stale.

**Incident chain (all diagnosed from server-side truth, deployed to prod):**
- Staff accounts on contractor …0001: Eszti (`fulop.eszter87`, superadmin) and Timi (`timcsilak`, admin→fixed) pre-existed from 2026-04-23; Noncsi (`noemi@virtualis-asszisztens-online.hu`, admin) still to create.
- **Silent password bug:** `PUT /users/:id` (`updateUser`) never read `password` from the body — the admin edit form's password field was a no-op. Fixed (bcrypt-hash on update), deployed. Also reset Eszti/Timi passwords directly on prod (bcrypt via `docker exec`), verified with live `/auth/login` → 200.
- **Rate-limiter:** login 429s were the per-IP auth limiter (5/15min) — trust proxy WAS working (verified distinct client IPs in prod logs; NOT a global bucket). Raised to **10 failed/15min**, `skipSuccessfulRequests:true` (successes free). Real hazard = shared-NAT accommodations. Deployed.

**Reliability audit** (4 parallel sub-agents; findings adversarially verified against code before acting):
- **Headline: RLS is inert in prod** — `setDatabaseUser` unmounted + app runs as postgres superuser → 48 policies do nothing; tenant isolation is app-layer `WHERE` only. Decision: retire dead RLS code (don't wire now).
- **4 per-finding PRs open, each with a real regression test:** #1 role-write transaction (self-lockout), #2 damage-report authz + tenant scope (resident-reachable salary/signature IDOR), #3 un-vacuum 8 self-skipping integration suites (`res.body.token`→`data.token`; also caught+fixed a live `gamification/leaderboard` 500), #4 document cross-tenant IDOR (staff contractor scoping).
- Decisions: no account lockout (shared-WiFi risk) — rely on IP limiter; per-finding PRs.

**In flight / next session (start fresh on #5):**
- Merge PRs #1–#4 + deploy (manual pull on the box).
- **#5 GDPR erasure** file-leak/partial-failure fix (code fix independent of DPO retention sign-off).
- **#6-7 money paths:** invoice `contractor_id` drop, all-COALESCE blind updates, payment-status race (`SELECT … FOR UPDATE`), non-atomic salary close+insert.
- Confirm Timi login (`hajnalpir2026`) + create Noncsi.
- Full audit findings + ranked plan live in this session's transcript (silent-failure / test-coverage / data-integrity / security dimensions).

---

## SESSION 2026-06-19 — push notifications v1 (chat reply + visa/contract expiry), DR hardening, iOS assessment

Three threads: shipped push notifications v1 end-to-end (verified on real hardware), hardened backup/DR (secrets → Bitwarden, orchestration kit version-controlled), and produced an iOS feasibility decision doc. Also recorded 4 ötlettár items.

### ✨ Push notifications v1 — SHIPPED + verified on device (build #9)
First roadmap feature from `docs/BACKLOG.md §1`. Built as a NEW delivery channel on EXISTING notification triggers (purely additive, fire-and-forget — can't break flows).
- **Backend** (commits 3a1a218e + 08aca280 + e62ea1f1; CI green; redeployed to prod):
  - mig 125 `user_push_tokens` (one row/device, unique token, cascade). **Applied to prod DIRECTLY via psql** (the migrate runner is blocked at 093 on prod) — note for DR: future dumps include the table, so restore is fine.
  - `pushNotification.service.js` — Expo send via **expo-server-sdk v3 (CJS — v6 is ESM and breaks jest)**, per-recipient localization (hu/en/uk/tl/de) for `ticket_message` + `expiry_alert`, chunking, dead-token prune on `DeviceNotRegistered`.
  - `inAppNotification.notify()` gained an optional `push` arg (the single choke point all triggers funnel through). Wired `push:true` into the ticket-reply fanout + a NEW resident-facing visa/contract alert in `expiryMonitor` (links to `/calendar`; was admin-only).
  - `POST/DELETE /push/tokens` (auth, self-scoped upsert/delete). Tests: `pushTokens.test.js` (1258 total green). CI quirk fixed: unauth POST is 403 (CSRF) in CI vs 401 locally — assert either.
  - FCM: Firebase project `hr-erp-77ad6`, `google-services.json` committed (no private_key; needed for the git-based EAS build), FCM V1 service-account key uploaded to Expo credentials (kept OUT of git; user has it).
- **Mobile** (build #9, gold icon verified): `expo-notifications/device/constants`; `src/services/push.js` registers the Expo token (permission + Android channel + projectId) on login/resume, unregisters on logout; `AppNavigator` tap-to-navigate (chat→TicketDetail, expiry→Calendar) for foreground + cold-start; `app.json` expo-notifications plugin + `android.googleServicesFile`.
- **Verified on real hardware** (test resident, device "Power Armor 13"): token registered; chat-reply push + visa-expiry push BOTH land on the lock screen and tap-route correctly. Texts (hu): "Új üzenet — #9001-TESZT" / "Vízum lejárat — A vízumod 10 nap múlva lejár."
- ⚠️ **Test-harness gotcha** (not a prod bug): manually triggering `runDaily` with `process.exit(0)` kills the fire-and-forget push before it reaches Expo — add an exit grace delay. Prod cron runs in the always-on server, so unaffected. To re-fire an expiry test, `DELETE FROM expiry_alert_log WHERE entity_id=<emp> AND field='visa'` first (idempotency bucket).
- **iOS push:** the send path is platform-agnostic; iOS needs only an APNs key in Expo creds (no code change). See iOS doc below.

### 🔒 DR / backup hardening
- Secrets (ENCRYPTION_KEY, DB_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY, …) → **Bitwarden** (were only on server + Mac `.env`; closed the "undecryptable backups" risk).
- **`deploy/` kit version-controlled** (commit 0e74e1ae): `docker-compose.prod.yml` + `Caddyfile` + `backup.sh` + `.env.production.example` + `DISASTER_RECOVERY.md` (were server-only). Laptop + Bitwarden alone can now rebuild anywhere. Restore-tested a dump (287 employees). Storage Box offsite leg intentionally skipped (Hetzner is temporary); `backup.env` staged ready. Time Machine still off = the one remaining local-resilience gap.

### 📋 Backlog / ötlettár (`docs/BACKLOG.md §1`, record-only)
Push notifications (T1, **DONE**), show-password login toggle (T1, scope confirmed), biometric login (T2), profile photo resident-set/admin-visible (T2, with storage/resize/GDPR notes). §2 keeps the gated medical-events item.

### 🍏 iOS feasibility — decision: defer to AFTER the Android feature set
Expo/RN is already cross-platform (code has iOS branches; `.ics` works better on iOS). Distribution answer: **TestFlight** (≤10,000 email-invited testers, light beta review — NO public App Store needed for the pilot; enterprise program forbids external users). Needs Apple Developer ($99/yr; org = D-U-N-S, the long pole) + one APNs key (Expo relays, no backend change). ~1–2 days eng once the account exists. **Recommendation: finish Android trio (push✓ → show-password → profile → biometrics) first, but start the Apple Developer account application NOW in parallel.**

### Next
- Continue the roadmap one-at-a-time: show-password toggle (quick) or profile photo next (user's call).
- Test data still seeded on prod (`[TESZT]` events + push token on test resident) — fine to leave for ongoing testing.

---

## SESSION 2026-06-18 — resident calendar: close alignment gaps (inspections + shifts) + List⇄Month grid

Calendar alignment audit (prior session) found 4 gaps between the admin aggregator and the resident feed. This session closed two, confirmed one, and gated one on compliance — then built the grid view. Backend redeployed; mobile EAS build #7 running.

### Gap decisions (per user)
- **Inspections → ADDED.** Scoped by the resident's OWN `accommodation_id`. Sourced from `inspections` instances (`scheduled_at`), excluding `completed`/`cancelled`. Resident with no accommodation matches none (`= NULL` never true).
- **Shifts → ADDED.** Data model already existed (`shifts`: `employee_id` + `shift_date` + `shift_type` ∈ {morning,afternoon,night,full_day}). Scoped by the resident's OWN `employee_id`. "Build the capability, deactivate if unused."
- **Repairs → confirmed `ticket.due_date`** (already in feed as `ticket_deadline`). No change.
- **Medical/personal → STAYS EXCLUDED, GATED.** GDPR Art. 9 special-category data; in-app display = processing → needs Art. 9(2) basis + DPIA + DPO sign-off FIRST. NOT the "build, deactivate later" path. Documented as a blocked item in **`docs/BACKLOG.md`** (new file). `personal_event` held to the same gate (can carry incidental health info).

### Backend — `calendar.controller.js` (commit 759ce222, CI green, redeployed)
- `getMyCalendarEvents`: added `shift` + `inspection` UNION subqueries; threaded the resident's `accommodation_id` as `$5`. **All `related_id` cast to `::text`** across every subquery so the UNION column type is consistent regardless of each source table's PK type.
- `.ics` export: `shift` + `inspection` added to `ICS_TYPES` + `ICS_LABELS` (5 langs) with per-type self-scope checks (shift→`employee_id`, inspection→`accommodation_id`, excluding completed/cancelled).
- Tests: added shift `.ics` export + cross-scope 404 to `calendarIcs.test.js`. **Full suite 1252 green; i18n guard exit 0.**
- Redeploy: pulled `ghcr.io/lerch1979/esp-project-backend:latest`, recreated `hr-erp-backend-1` → `Up (healthy)`. `/calendar/my` → 401 (route live); `/healthz` → 200. No migration needed.

### Mobile — List⇄Month grid (commit 56706bfd)
- **`MonthGrid.js`** (NEW): dependency-free, Monday-first month grid. Chose to hand-roll over `react-native-calendars` (keeps bundle lean + theming/colors ours). Localized month/weekday labels, today marker, prev/next nav, up to 4 color-coded dots per day (one per distinct type). `TYPE_COLOR` shared with the agenda icons.
- **`ResidentCalendarScreen.js`**: refactored to keep raw `events` in state, derive `eventsByDay`/`sections` via `useMemo`. List⇄Month toggle at top; both views read the SAME `GET /calendar/my` (no new endpoint). Tap a day in Month → its events render below as the same cards. Agenda icons now tinted by `TYPE_COLOR`.
- i18n: `eventType.shift` / `eventType.inspection` + `viewList` / `viewMonth` / `tapDay` in all 5 locales. **`expo export` (android) clean.**
- **EAS build #7** queued (git build + `--clear-cache`): `https://expo.dev/accounts/hr-erp/projects/hr-erp-mobile/builds/d972bc04-b78d-40b5-afe0-14fe22576d55`.

### Carried / next
- Verify build #7 APK (download + confirm gold icon `res/gV.png`/`Zt.png`); install on device; smoke-test Month view with real data (feed is mostly empty — only ~285 check-ins; tickets.due_date=0, shifts=0, inspections=0 at audit time).
- `docs/BACKLOG.md` medical-events item awaits DPO/DPIA before any build.

---

## SESSION 2026-06-16 (post-deploy) — mobile cutover, CSRF fix, pre-go-live audit (15/15 PASS), accommodation feature

Continuation of the deploy below. Production hardened, fully audited, two prod bugs fixed, one admin feature added.

### Mobile → prod, verified on device
- App pointed at `https://app.housingsolutions.hu/api/v1` (`.env` + `api.js` fallback); CORS confirmed. Loaded on the phone via Expo Go tunnel; `[API] Base URL` confirmed = prod. Requests land on Hetzner from the phone's IP.

### 🐛 CSRF blocked mobile token refresh (prod-only regression) — FIXED (commit 3e08321e)
- `CSRF_ENABLED=false` in dev but `true` in prod, so the path was dev-untested. Mobile auto-refresh calls `POST /auth/refresh` via raw axios (no Bearer, no x-csrf-token) → CSRF rejected every refresh → residents 401'd and couldn't stay logged in.
- Fix: added `/api/v1/auth/refresh` to the CSRF `exemptPaths` (same rationale as `/auth/login` — the refresh token in the body is the auth factor; a cross-origin attacker can't read the rotated token back). Server-side → fixes every installed app with no rebuild. Verified: `/auth/refresh` now reaches its handler (401 invalid-token, not 403).

### Pre-go-live audit — 15/15 PASS (evidence captured)
- **Security:** (1) only `/public/accountant/:token` is unauth — all data endpoints 401 without a token; (2) **resident self-scope PASS** — test resident saw only **2 of 21** tickets live on prod; (3) CSRF still guards mutations (logout/tickets POST → 403), refresh intentionally exempt; (4) rate limiting active (`ratelimit-limit: 200; w=900`); (5) ufw (22/80/443 only) + fail2ban (sshd jail) + `PermitRootLogin no` + `PasswordAuthentication no`; (6) secrets — ANTHROPIC rotated `sk-ant-…`, ENCRYPTION_KEY SHA-identical to dev, JWT_SECRET ≠ dev, DB pw 48 chars.
- **Data/features:** (7) AI live — direct Anthropic call 200 with `claude-haiku-4-5`; translation+category enabled; (8) PII decrypts (identical key + zero decrypt errors); (9) GDPR config (grace 24mo / backup_retention 30d / reminder on) + expiry monitor enabled; (10) `entity_status_history` recording — admin status change wrote a correct row (ticket: Új→Anyagra várunk, by admin, src=update).
- **Ops:** (11) backups — server cron 02:30 + Mac launchd 09:00, test-restore verified both sides; (12) **stopped the old `blinker-bronze-evasion` ngrok tunnel** (was still exposing the laptop backend); (13) **healthcheck false-negatives fixed** (see below); (14) logs — found + fixed the cache bug below; (15) go-live open items listed.
- Note: temporary boundary test left `JWT_EXPIRES_IN=60s` on prod — **restored to 8h** during the audit.

### 🐛 Cache-warming SQL bug — FIXED (commit 53803fd2)
- `cacheWarming.service.js` queried `tickets.status` (non-existent; schema uses `status_id` → `ticket_statuses`) → dashboard-stats warm threw every 5 min (latent; failed in dev too). Fixed to `LEFT JOIN ticket_statuses … WHERE is_final false/NULL` (mirrors `analytics.service`). Verified live: cache warm flipped `✗ → ✓ dashboard stats`, error spam stopped.

### 🔧 Healthcheck overrides — `docker-compose.prod.yml` (server-only file, not repo-tracked)
- backend + admin showed `unhealthy` (false negatives: backend HC hit `localhost` → HTTPS-redirect → TLS error; admin HC hit IPv6 `localhost` vs IPv4-only nginx). Overrode both: backend probes `127.0.0.1:3001/health` with `X-Forwarded-Proto: https`; admin probes `127.0.0.1:80`. Both now report **healthy** → `docker compose ps` is trustworthy. ⚠️ `docker-compose.prod.yml` is NOT in the repo — server-side edit; consider version-controlling it.

### ✨ Feature: accommodation on admin ticket detail (commit 4cc4eab3)
- Staff couldn't see which housing+room a ticket was about (needed for repair dispatch). Tickets have no `accommodation_id` — derived. Admin `getTicketById` already joined the **linked** employee's accommodation, but resident self-reports (15/21) have no `linked_employee_id` → null. Added a **reporter** derivation (`created_by → employees.user_id → accommodation`) and exposed a COALESCE(linked, reporter) `accommodation` object `{id,name,room_number,address,source}`. Admin `TicketDetail` header now shows `🏠 Szállás: {name} · Szoba {room}`. **Admin-only** — `/tickets/my` + resident app untouched; `TicketChat` unchanged (embedded). Verified in browser: #21 Fertőd/TEST-1 (reporter), #19 Röjtökmuzsaj/100 (linked), #14 none.

### OPEN before real residents (carried)
- **Storage Box offsite leg** — deferred (2 backup legs live; reactivate by ordering BX11 + adding the server key in `~/hr-erp/backup.env`).
- Native-speaker pass on uk/tl locales; HR data population (visa dates, nationality for expiry monitor); DPO sign-off on GDPR retention; EAS Android APK build decision.
- Version-control `docker-compose.prod.yml` + `Caddyfile` + `backup.sh` (currently server-only artifacts).

---

## SESSION 2026-06-16 — PRODUCTION DEPLOY (Hetzner) + backups + mobile→prod

**🚀 `app.housingsolutions.hu` is LIVE on Hetzner over HTTPS, full stack healthy, production data restored.**

### Deploy (per HETZNER_DEPLOY.md)
- **Host:** Hetzner VM `167.233.122.3`, hardened — **ufw + fail2ban + key-only SSH** (only 22/80/443 public; postgres/redis/backend/admin internal-only on the Docker network).
- **Stack:** `docker-compose.prod.yml` — Caddy (TLS) → backend (Node :3001) + admin (nginx SPA) → postgres:15 + redis:7. Images pulled from GHCR. All 5 containers up, **0 restarts**.
- **TLS:** Caddy auto-issued a Let's Encrypt cert for `app.housingsolutions.hu` (tls-alpn-01). HTTP→HTTPS automatic.
- **Routing decision (deviates from runbook's two-subdomain template):** **single domain, path-routed** in `Caddyfile` — `/api/*` + `/public/*` (accountant page) + `/health` → backend:3001; everything else → admin SPA. `CORS_ORIGIN`/`FRONTEND_URL` = `https://app.housingsolutions.hu`.
- **DB restore:** dumped dev `hr_erp_db` (custom format) → scp → `pg_restore --clean --if-exists` into the postgres container. **exit 0, zero stderr, 166 tables**, row counts match dev (users 6 / tickets 21 / accommodations 16 / damage_reports 4). Migration runner deliberately NOT run (still blocked at `093 cleanup_demo_data`) — the dump carries full schema+data.
- **Secrets:** `ENCRYPTION_KEY` **carried over from dev verbatim** (SHA-verified identical → restored PII decrypts); `ANTHROPIC_API_KEY` **rotated** to a fresh key (old/exposed dev key NOT reused). Zero placeholders remain in `.env.production`.
- **Known cosmetic:** backend + admin containers report `unhealthy` — **false negatives** in the images' built-in healthchecks (backend: HTTP→HTTPS redirect when no `X-Forwarded-Proto`; admin: healthcheck hits IPv6 `localhost`, nginx is IPv4-only). Both serve correctly through Caddy (verified `200`). `restart: unless-stopped` doesn't restart on unhealthy → no loop. Fix the healthcheck cmds later if clean `ps` is wanted.

### Backups (durable data + dual-backup, retention 30d = GDPR "ages out")
- **Server nightly (cron 02:30):** `~/hr-erp/backup.sh` → `pg_dump hr_erp` (custom) + `tar uploads_data` → `~/hr-erp/backups/` → prune >30d → (offsite push, gated). Config in `~/hr-erp/backup.env`.
- **Mac daily pull (launchd `hu.hrerp.backuppull`, 09:00):** `~/hr-erp-backup-pull.sh` rsyncs dumps+uploads off Hetzner → `~/hr-erp-offsite/` (provider-independence; laptop copy alone rebuilds the DB).
- **✅ Verified both sides:** manual run created artifacts (db 2.4M + uploads 196B), Mac pull fetched them, **test-restore `exit 0` on BOTH server and Mac copies** (166 tables, counts match).
- Server keypair generated for the (deferred) Storage Box; public key ready to add when ordered.

### Mobile → production
- `hr-erp-mobile/.env` `EXPO_PUBLIC_API_URL` + `api.js` `FALLBACK_URL` → `https://app.housingsolutions.hu/api/v1` (replaced the ngrok tunnel `blinker-bronze-evasion` + stale comments). No ngrok/LAN refs remain in mobile src. CORS preflight confirmed live.

### OPEN
- **Storage Box offsite leg — DEFERRED** (user choice; two legs already protect us). To activate: order Hetzner Storage Box BX11, enable SSH support, add the server's public key (`ssh-ed25519 …BTJINZy hr-erp-backup@hr-erp-prod`), fill `STORAGEBOX_HOST`/`USER` in `~/hr-erp/backup.env`, run `backup.sh` once to verify.
- Optional belt-and-braces: enable Hetzner VM snapshots in the Console.
- After any real restore: re-run outstanding `anonymization_log` entries (GDPR — no selective resurrection).

---

## SESSION 2026-06-11 (night) — GDPR anonymization / right-to-be-forgotten (audit P0, v1)

Legally sensitive; design was reviewed + approved before build (see the personal-data map produced this session).

### WHAT WAS BUILT (decisions locked with user)
- **Engine `gdprAnonymization.service.js`** — `anonymizeEmployee(id,{dryRun,requestedBy,reason})`. Dry-run = counts + file list + kept categories, **zero mutation**; execute = one `transaction()` then file unlink **post-commit** (files can't roll back; `storage.delete` is ENOENT-safe). Two entry points (GDPR request + grace proposal), one engine, one flow.
- **Disposition:** employees → name `TÖRÖLT-<id8>` + all other PII NULLed + `anonymized_at`; **users** → `is_active=false` (auth re-checks is_active → blocks existing JWTs too), email scrambled, password randomized, name→pseudonym (NOT NULL); **employee_documents** → non-statutory scans physically deleted (file+row), statutory types KEPT (configurable list); **health/wellbeing** (~18 tables) → hard DELETE; **financial** (compensations, compensation_residents incl. `signature_data`, salary_deductions) → KEPT, denormalized names→pseudonym, contacts NULLed; **tickets/messages/attachments/chatbot/translation_cache** → KEPT INTACT (authorship cascades via the pseudonymized user record — no edits needed); notifications for/about subject → deleted. **SKIPPED v1 → v2:** activity_logs JSONB scrub, translation_cache purge.
- **Pseudonym** = `TÖRÖLT-<first 8 of uuid>`, same across all retained tables.
- **Lifecycle:** consent (`employees.data_consent_at` + `recorded_by`); grace clock on `end_date + grace_months` (default 24, configurable); **propose-only** queue (`GET /proposals`, live query — never auto-anonymizes); daily 08:00 **reminder cron** notifies superadmin/data_controller of newly-eligible (dedup via `retention_notified_at`); the system proposes, a human disposes.
- **Migration 122:** `employees.{data_consent_at,data_consent_recorded_by,anonymized_at,retention_notified_at}` · `anonymization_config` (grace_months=24, backup_retention_days=30, statutory_document_types[], reminder_enabled) · `anonymization_log` (WHO/WHEN/WHY + **counts-only** summary, never the removed values).
- **API `/anonymization`:** config, proposals, preview, execute (requires `confirm:true`), logs — **superadmin only**; consent — admin. Audit-of-the-anonymization stored (dry-run logged too).
- **Admin UI:** dedicated **GDPR / Anonimizálás** page (config + proposal queue with multi-select → preview → typed `ANONIMIZÁL` double-confirm → execute + log viewer) **and** a per-employee `EmployeeGdprAction` in the employee detail modal (consent chip/record + superadmin-only anonymize → preview → double-confirm). employee detail SELECT now returns the new columns.

### ✅ VERIFIED on a THROWAWAY employee+user (18/18; created fresh, never the real data, fully removed after)
preview = no mutation; execute → name pseudonymized + all PII NULL + anonymized_at; user deactivated + email scrambled + name→pseudonym; non-statutory doc+files physically deleted, **statutory contract file KEPT on disk**; health rows hard-deleted; notifications deleted; **ticket KEPT, author display cascades to pseudonym**; log = counts only (asserted no raw PII like passport/tax/IBAN in summary); idempotent (re-run → already_anonymized). **The throwaway caught a real bug** (`users.first_name/last_name` are NOT NULL → service was NULLing them → fixed to pseudonym). HTTP: resident→403, execute-without-confirm→400, consent works. Admin Vite build clean. **Full jest 1240/1240** (migration 122 applies on fresh DB → 112 total).

### Hetzner runbook updated
Added the GDPR/backup interaction to `HETZNER_DEPLOY.md`: bounded backup retention (≤30d, the "ages out" guarantee) + re-apply `anonymization_log` after any restore (no selective resurrection).

### Still for legal/DPO before first REAL use (no code change needed — all configurable)
Finalize retention years + which `statutory_document_types` slugs map to real contract docs; confirm payroll/social-security long-retention categories. v2 backlog: activity_logs JSONB scrub, translation_cache purge, automatic retention-expiry execution, GDPR data export (portability).

---

## SESSION 2026-06-11 (evening) — visa/contract/document expiry monitor (audit P0)

Server-independent backend+admin feature (built while Hetzner account verification is pending).

### WHAT WAS BUILT
- **Monitors 3 fields:** `employees.visa_expiry`, `employees.end_date` (contract), `employee_documents.expiry_date` (any document_type). All currently empty in prod data (0/287 visa, 0 end_date) — built against the schema, ready when HR populates it.
- **Fully runtime-toggleable (no restart):** `expiry_monitor_config` (single row, mirrors `nlp_sentiment_config`). Cron reads `enabled` fresh each run → exits silently when off; dashboard widget shows **"Kikapcsolva"**; admin flips it from the UI. Default ON. `digest_enabled` flag reserved for the email digest (off until prod SMTP).
- **Configurable per-attribute threshold rules:** `expiry_threshold_rules` (`field`, `nationality`, `document_type`, `contractor_id` [schema only, not in UI v1], `thresholds INT[]`, `include_overdue`). **Most-specific wins** (`nationality 4 > document_type 2 > contractor 1 > field 1`). Seeded default `{60,30,14,7}`+overdue; hardcoded baseline fallback if all rules deleted. Example: `PH→{120,90,60,30,7}`, `UA→{45,30,14,7}` are two rows.
- **Added `employees.nationality VARCHAR(2)`** (mig 121) — no nationality column existed; `permanent_address_country` was empty *and* semantically wrong. Nullable → NULL = default rule (graceful). HR sets it only for non-standard cases.
- **Dedup resilient to rule edits:** `expiry_alert_log UNIQUE(entity_type, entity_id, field, expiry_date, threshold_days)`, keyed on the **threshold value that fired** (not a rule id). `entity_id` is TEXT (employees.id is uuid, employee_documents.id is integer). Firing rule = the single most-urgent bucket the item currently qualifies for → adding a bigger threshold never retro-fires, late data entry fires only the current bucket, renewed expiry_date resets. Atomic via `INSERT … ON CONFLICT DO NOTHING RETURNING id`.
- **Surfaces:** in-app notifications (`inAppNotification.notifyMany` → `notifications` table, type `expiry_alert`) to global HR admins (superadmin/data_controller/admin, contractor_id stamped); **live dashboard widget** (`GET /expiry-monitor/summary`); daily **07:00 cron** (toggle-gated) wired in server.js next to the other daily jobs.
- **API** (`/expiry-monitor`, admin-gated): `GET/PUT /config`, `GET/POST/PUT/DELETE /rules` (descending-positive-distinct validation), `GET /summary`, `POST /run?force=true`.
- **Admin UI:** `ExpiryMonitorWidget` (toggle + severity counts + soonest-expiring list, or "Kikapcsolva") embedded on the Dashboard (compact) and the new **Lejárati figyelő** page (`/expiry-monitor`, nav under Residents) with the rules CRUD table + validated add/edit dialog.

### ✅ VERIFIED
- 12/12 service scenarios (deterministic, seeded on the TEST resident only — `da8462e9…` Eszti/TEST-1, never the 286 real rows; cleaned up after): 25d+default→30-bucket; PH rule wins at 100d→120 (default=none); NULL nat→default; toggle OFF→cron no-ops + summary `{enabled:false}`; same-day re-run→no dup; renewed visa→fresh cycle; notifications fan out to all 4 HR recipients.
- HTTP layer: config GET/PUT, **resident→403** (admin-gated), summary, rule validation (ascending→400), create (nationality upcased), delete, run (recipients=4).
- Admin Vite build clean. Migrations 120/121 apply via the runner on a fresh `hr_erp_test` (111 total). **Full jest 1240/1240, 55/55 suites.**

### Notes / future
- Email digest is built-flagged-off (`digest_enabled`) — switch on once prod SMTP exists.
- Per-contractor rules: `contractor_id` is in the schema but not surfaced in the UI (future EOR need).

---

## SESSION 2026-06-11 (later still) — CI red since 2026-06-09 diagnosed + fixed

### 🐛 ROOT CAUSE — resident router blanket-gated all of `/api/v1` (production regression)
- **CI had been red on every push since 2026-06-09** (last green 2026-05-21); not caused by today's commits — the docs + AI-feature pushes just ran an already-broken suite. Failure was **2 tests** in `tests/integration/chatbot.test.js`: the **public** `GET /chatbot/faq/categories` and `/faq/entries` returned **401** instead of 200/404.
- **Cause:** `a14d96c4` (June 9 self-scope commit) mounts `residentSelfRoutes` at the **bare `${API_PREFIX}`** (`server.js:357`), and that router opened with a path-less **`router.use(authenticateToken)`**. Express runs router-level path-less middleware for *every* request entering the mount — so it 401-gated **all unauthenticated `/api/v1/*` requests** that reached line 357, including the public chatbot FAQ endpoints mounted later (`:378`). **Not just a test artifact — those endpoints were genuinely 401 in production**, and any future public `/api/v1` route after the resident mount would have been silently gated too. (Login at `:353` and the accountant page at `/public/accountant` sit outside the blast radius, which is why only those 2 broke.)
- **Fix (B):** removed the router-level `router.use(authenticateToken)`; attached `authenticateToken` **per-route** in `residentSelf.routes.js` (keeps the bare-prefix mount, removes the catch-all). Added a header comment warning against re-introducing a blanket `.use()` here.
- **CI hygiene:** bumped `actions/checkout@v4`→`v5` and `actions/setup-node@v4`→`v5` (Node 20 actions deprecated, forced to Node 24 on 2026-06-16).

### ✅ VERIFIED before push
1. Full `jest --coverage` on a fresh `hr_erp_test` (mirrors CI: 109 migrations applied — confirms the `093` blocker is **dev-DB-only**, never blocks CI/fresh DBs) → **1240/1240, 55/55 suites green**.
2. Public FAQ endpoints **without token** → `200`/`200` (was 401).
3. Resident `/my` endpoints **without token** → `401`; with the test resident's token → `200` (self-scope intact).
4. Resident journey with auth (login, `/tickets/my`, `/tickets/my/categories`, `/accommodations/my`, `suggest-category`, `/messages`) all `200`; `suggest-category` still returns `viz-csotores` (95).

---

## SESSION 2026-06-11 (later) — AI category suggestion for resident issue reporting

### WHAT WAS DONE
- **"AI suggests, resident confirms" category pre-selection.** Resident types a description in any language → Haiku classifies it → the matching category auto-fills with a subtle **✨ AI-javaslat** badge; resident can accept (do nothing) or override with one tap (badge clears, AI never overwrites again).
- **Backend** — new `categoryAI.service.js` (reuses the SAME `ANTHROPIC_API_KEY` + Haiku model as translation.service; **never-throws** → null on any error/disabled/empty, so manual selection is always available). New self-scoped `POST /tickets/my/suggest-category` (auth-only) in `residentSelf.controller` — classifies against the resident's **OWN 6 contractor categories** (same source as `getMyCategories`, never the global 33), maps slug→`category_id` only within those rows, and returns a suggestion **only at confidence ≥ 70** (else `{category_id: null}`).
- **Mobile** — `ticketsAPI.suggestMyCategory`; `CreateTicketScreen` debounced suggestion (residents only, ≥15 chars, 600ms pause, sequence-guarded against stale responses, fire-and-forget on error); ✨ badge + spinner; manual pick sets a ref that permanently disables auto-suggest for that ticket. Staff create flow untouched. `ticketForm.aiSuggestion` added in all 5 locales.
- **Cost** (confirmed against the Claude API reference): Haiku 4.5 = $1/1M in, $5/1M out → ≈ **$0.0005 per classification**; debounce + 15-char gate ⇒ ~1–3 calls/ticket. Prompt-caching does **not** engage — the ~350-token prefix is below Haiku's 4096-token minimum cacheable prefix (not worth pursuing at this size).
- **Verified by curl** against the test resident: HU "csöpög a csap" → `viz-csotores` (95); **UK** same meaning → `viz-csotores` (85, cross-language proven); **TL** heating → `futes` (95); EN electrical → `elektromos` (95); short/vague → `null`; **isolation** — payroll/IT (global-only) → `null`, and across 15 multilingual samples **only the resident's own 6 slugs ever returned, zero global-33 leaks**. i18n guard green; backend + JSX parse clean.

### ⚙️ Notes for next session
- Photo input deferred to v2 (text-only classify for v1, by design).

---

## SESSION 2026-06-11 — resident i18n completion, photo attachments, category scoping + i18n guard

### ⚙️ STANDING WORKFLOW (run automatically in future sessions)
**Before committing any change that touches resident UI or DB enums, run the i18n guard:**
```
node scripts/check-i18n-coverage.js     # must exit 0 (also documented in CLAUDE.md)
```
It checks every resident-visible enum slug (categories for contractors with residents, all statuses, all priorities) has a key in all 5 locales, and that resident-only screens have no hardcoded Hungarian. Exit 1 = gaps (fix first); exit 2 = DB/env problem.

### WHAT WAS DONE
- **Finished resident inner-screen i18n** — wired `t()` into ResidentTicketList / ResidentTicketDetail / CreateTicketScreen / room / More / Notifications / Profile; added `category`/`status`/`priority`/`ticketForm`/`ticketList`/`roomView`/`menu`/`attach` namespaces in all 5 locales. Enum labels use static `t('status.<slug>')`/`t('category.<slug>')`; free-text chat uses the AI service.
- **Photo attachments (resident issue reporting, create-time, self-scoped)** — `ticketAttachments.controller` (multer images/8MB/max 3 → `storage.saveAtPath(uploads/tickets/…)` + `ticket_attachments`); resident `POST/GET /tickets/my/:id/attachments` (requireOwnTicket); staff view-only `GET /tickets/:id/attachments[/:attId]`. Mobile picker + client compress (1600px@0.8) + ≤3 preview + sequential upload with **honest count**; ResidentTicketDetail photo strip + viewer; admin TicketChat thumbnail strip + lightbox. (`uploads/` still not in backup cron — tech debt.)
- **🐛 Category-picker bug FIXED** — `GET /categories` returned all 33 global categories (no contractor scope); only the 6 Housing Solutions ones were translated, so EN/UK/TL showed Hungarian for the other 27. Fix: new self-scoped `GET /tickets/my/categories` (resident's contractor only → 6), CreateTicketScreen role-conditional; added 4 missing status keys (`invoicing`, `payment_pending`, `transferred`, `not_feasible`). Resident enum sweep now clean across all 5 locales.
- **i18n guard** `scripts/check-i18n-coverage.js` + CLAUDE.md rule (above). Verified green on current code; negative test (drop a key) correctly exits 1. (It also caught a real `uk.json` regression mid-session.)
- **🐛 Chat language drift FIXED** — `ticketMessages.list` translated to the viewer's **DB `preferred_language`**, which drifts from the app UI (the login-screen toggle changes only local i18n with no persist; the Profile persist was fire-and-forget with a swallowed `.catch`). Symptom: UI=hu but DB=en → chat rendered in English. **Fix (primary):** message endpoints accept an optional **`?lang=`**; mobile resident + admin pass their current i18n language, used as `viewerLang` (fallback to DB) → chat always matches the UI, drift impossible. **Fix (secondary):** Profile switcher now `await`s the persist and surfaces failures (`settings.languageSaveFailed`) instead of swallowing them — DB stays the reliable source for notifications/emails. Verified with a stale DB (`en`): `?lang=hu/uk/tl` all render correctly; admin renders its UI language. Staff-safe (`lang` is optional).

### 🔐 STILL OPEN before real-tenant go-live
- **Rotate `ANTHROPIC_API_KEY`** (March audit C-01 insurance).
- Add `uploads/` to the backup cron.
- Native-speaker pass on uk/tl strings.
- `093 cleanup_demo_data` migration-runner blocker; production hosting (`ROLLOUT_PLAN.md`).

---

## SESSION 2026-06-10 — in-ticket chat + AI auto-translation (resident ↔ staff)

### WHAT WAS DONE

**In-ticket chat — resident ↔ staff, self-scoped, live (DONE)** — commits `290cead8`, `68d6533c`:
- Reused the existing **`ticket_messages`** thread (migration 106) — resident + staff share ONE conversation; no rebuild.
- Resident endpoints `GET`/`POST /tickets/my/:ticketId/messages`, auth-only, fronted by **`requireOwnTicket`** guard (404 on any non-`created_by` ticket — the sole ownership scope, since `_detectSenderRole` returns a role for any ticket). Reuse staff `ticketMessages.list`/`send`. No `tickets.view`/`comment` granted; staff routes untouched.
- Mobile `ResidentTicketDetail` = chat view (bubbles "Én" vs "Housing Solutions" via `sender_id===user.id`, **focus-only ~12s polling** + pull-to-refresh + send). Isolation proven by curl (own 201 / other 404 / shared thread both ways).

**AI auto-translation — everyone sees their own language (DONE)** — commit `68d6533c`:
- **Reused the existing Claude Haiku `translation.service`** (`translateText`, cache-first via `translation_cache`, same-lang skip, **never throws → falls back to original**). No new provider.
- `send` stores `source_language` + async best-effort pre-warm to participants' langs (`hu` + creator). `list` translates each message into the **viewer's** language; returns `display_text` / `original_text` / `is_translated` / `translation_unavailable`. One change serves both resident `/my` and staff admin.
- Mobile + **admin `TicketChat.jsx`**: show reader's-language text, tiny **"eredeti"** toggle → original, subtle "fordítás nem elérhető" on failure. i18n `chat.*` (hu/en/uk/tl/de).
- **Live test passed both ways** (resident uk ↔ staff hu), original toggle + fallback confirmed on a real phone + admin UI.

**Migration 119:** `ticket_messages.source_language VARCHAR(5)` (applied via psql; translated text reuses `translation_cache`, not a new column).

### 🔐 SECURITY TODO — before real-tenant go-live
- **Rotate `ANTHROPIC_API_KEY`** in the Anthropic console (2-min insurance). A real key was committed historically per `hr-erp-admin/SECURITY_AUDIT_REPORT.md` (C-01, 2026-03-11). The live key is **not** in current git history/tree (evidence it was rotated), but if history was BFG-scrubbed that can't be proven — so rotate once more for zero doubt before onboarding real tenants.

### CONNECTIVITY (current dev setup)
- Backend tunneled over https: **`https://blinker-bronze-evasion.ngrok-free.dev`** (stable reserved ngrok domain) — removes the recurring LAN-IP-drift / iOS-cleartext failures. Metro tunnel `exp://tvtlo7i-anonymous-8081.exp.direct`. App `.env`/`api.js` point at the backend tunnel. Both are laptop-local processes — relaunch `npm start` + `npx expo start --tunnel` after a reboot/sleep.

### WHAT'S NEXT
- Rotate the Anthropic key (security TODO above).
- Finish inner-screen i18n for the remaining resident screens (CreateTicket, room) — chat + Home + ticket list done; CreateTicket/room still partly HU.
- Decide `093 cleanup_demo_data` migration-runner blocker (still open).
- Production hosting for real rollout (`ROLLOUT_PLAN.md`), not laptop tunnels.

---

## SESSION 2026-06-09 — mobile-readiness audit → resident self-scope + audit trigger fix

### WHAT WAS DONE

**Portfolio + mobile assessment (docs only):**
- `MASTER_TODO.md` — cross-project audit. Key finding: "Workforce Platform", "Pulse Solutions", and "AI onboarding videos" are **not separate repos** — they're subsystems of HR-ERP. Real standalone code projects: HR-ERP, StockMaster (dormant 60d), hedge-fund-agent (not git), sg-intel-agent (healthy, shipping daily).
- `MOBILE_APP_STATE.md` — resident-app readiness. Builds (Expo 54); the "toth.anna login fails" bug was a **seeding gap** (DB had 0 resident accounts), not a code bug. Ukrainian translation complete but screens hardcode HU; push notifications are a stub. Now includes the **286-person rollout plan**.
- `MOBILE_PILOT_P0_PLAN.md` (10-person, superseded) + `ROLLOUT_PLAN.md` (full-workforce, 286 users, QR-token+PIN identity, Hetzner docker-compose, Android-first, waved rollout).

**🐛 Audit trigger bug — FIXED (migration 118):**
- `audit_trigger_func()` used `NEW.id`/`OLD.id` unconditionally → every insert/update/delete on composite-PK tables (e.g. `role_permissions`, no `id` col) failed with `record "new" has no field "id"`. This had **silently frozen ALL role-permission management system-wide** (existing grants predate the trigger from mig 055).
- Fix: null-tolerant `COALESCE((to_jsonb(NEW)->>'id')::uuid, NULL)` + made `activity_logs.entity_id` nullable. Verified both table shapes (id-table audits with real id, id-less audits with NULL entity_id), audit coverage intact.
- **Applied via psql, NOT the migrate runner** (see OPEN blocker below). Migration file is registered (auto-discovered) for when the runner is unblocked.

**Resident role made functional + self-scoped (Path B):**
- The `accommodated_employee` role was **inert** — 0 permissions. Now granted **`tickets.create` only**.
- New auth-only, self-scoped endpoints (staff route files byte-for-byte untouched): `GET /tickets/my`, `GET /tickets/my/:id` (404 if not theirs), `GET /accommodations/my`. New files `residentSelf.controller.js` + `residentSelf.routes.js`, mounted before the staff `/tickets` + `/accommodations` routers.
- Created contractor **Housing Solutions Kft** (`dff75eff-506c-45fd-9115-011115956c38`) + a test resident **Eszti Teszt** (`teszt.lakos@housingsolutions.hu`) mapped to **Fertőd / room TEST-1**, plus 6 HU ticket categories for HS.
- Full journey + isolation proven by curl: resident creates a ticket, sees only their own ticket (`#20`) + own room; gets 403 on blanket `/tickets`, `/accommodations`, comments, messages, tasks; 404 (not 403) on another tenant's ticket id. Staff (`admin@hr-erp.com`) still sees all tickets via `/tickets` (total 21).

**Resident mobile app — testable on phone + UX redesign:**
- Pointed the app at the local backend over **LAN** (`.env` + `api.js` fallback → `192.168.1.8:3001`); reachable, firewall off. Expo Go connects via **tunnel** (`npx expo start --tunnel`) — LAN discovery + iOS "no manual URL field" worked around. **Tested live on a phone via the Expo tunnel — working.**
- Wired the app to the self-scoped `/my` endpoints (role-conditional; staff paths unchanged); login **HU/UK/TL** language toggle + `t()`; role-based nav.
- **Resident UX redesign:** profile-centric **Home dashboard** + **chronological Open/Closed ticket list** (replaced the kanban/filter-chip list for residents).
  - New components/screens: `ActionCard`, `ResidentTicketRow`, `ResidentHomeScreen`, `ResidentTicketList`.
  - Resident tabs: **[Home, Tickets, More]** (Home is the landing tab).
  - Backend `/my` additions: `is_final` + `category_icon` on `/tickets/my`; resident name on `/accommodations/my`; `notificationsAPI.getUnreadCount`.
  - **Staff UI untouched** — everything gated on `isResident` / lives in resident-only screens; `TicketListScreen` is now a thin wrapper that keeps the original staff list as `StaffTicketList`.
  - Commits: `cf028099` (LAN + /my wiring + nav + lang) and the resident-home/Open-Closed commit.

### OPEN / FLAGGED

- **Mobile dev runtime is local + LAN/tunnel** — backend on `192.168.1.8:3001` (LAN-only; the tunnel carries Metro, not the API, so the phone must stay on the same WiFi). Production hosting still pending (`ROLLOUT_PLAN.md`). Tunnel URLs are ephemeral.
- **Inner resident screens still render Hungarian** — `t()` wired only into login + tab bar; ticket/room/home screen strings are HU literals (translations exist; broad wiring deferred).
- **🚩 Migration runner blocked at `093 cleanup_demo_data`** — its guard "expected exactly 1 user, got 6" fails (the DB has real data), so `npm run db:migrate` stops there and never reaches 118+. Running the chain is unsafe (093 is a demo-data *cleanup*). **Do NOT run the full chain / do NOT touch 093** until its disposition is decided. Migration 118 was applied directly via psql as a workaround.
- **`tickets.view` is blanket + overloaded** — gates 6 endpoints incl. writes (comments, messages). `getTickets`/`getTicketById`/`getAccommodations` are contractor-wide or system-wide, not self-scoped. **Residents deliberately do NOT get `tickets.view`**; they use the self-scoped `/my` endpoints instead.
- **Schema-migration hygiene:** `093` failing means the explicit migration history diverged from this dev DB's actual state (real data vs demo-cleanup expectation).

### WHAT'S NEXT

1. **Decide `093 cleanup_demo_data` disposition** — rewrite its guard for real data, or mark obsolete — so the migrate runner is unblocked end-to-end.
2. **Wire the mobile app** to the `/my` endpoints (currently calls `/tickets`, `/tickets/:id`, `/accommodations`) — Path B's planned app change.
3. **i18n**: wire `t()` into the 6 resident screens + login language toggle (uk/tl cohorts).
4. **Role-based nav** so residents don't see ~30 staff screens.
5. Then Phase 0/1 of `ROLLOUT_PLAN.md` (HR data gathering + Hetzner hosting) for the 286-person rollout.

### NOTES
- Test resident's ticket `#20` intentionally kept (legit test data). Test password is in `scripts/create-test-resident.js` (test account only).
- Backend dev server was run locally for curl verification; Redis absent (non-critical).

---

## SESSION 2026-05-21 — afternoon → evening (VAT → Day 3 drafts → Day 4 share links)

### WHAT WAS DONE

**Migration 114 + VAT backend** (`bbe4df1d`):
- `net_amount / vat_rate / vat_amount / vat_exemption_reason / is_reverse_vat` columns + CHECKs (rate 0-100, net/vat split consistency)
- pg_trgm vendor fuzzy index already in migration 113; VAT 27% default helper in model
- `computeNetVat`, `defaultVatRateForCategory`, `validateVatFields` shared helpers
- Service auto-fills net/vat on create, recomputes on update when amount or rate changes, clears on null-rate
- 27 new VAT cases in `tests/expense.script.js` (68 → 95 total)

**VAT UI + HTTP smoke** (`599cc73e`):
- Tab 1 form: ÁFA kulcs single-select (27/18/5/0/AAM/Tárgyi mentes/Egyéb), net+vat fields auto-filling with sticky manual override, is_reverse_vat checkbox under Speciális beállítások, exemption info alert, category-default rate suggestion
- `tests/expenseVatHttp.script.js` — 21 HTTP cases including the "edit-reload integrity" contract that catches stale-Node-process regressions

**Day 3 — invoice_drafts → accommodation_expenses conversion** (`ff53ac4a`):
- Migration 115: `invoice_drafts.final_expense_id` + status CHECK (adds 'converted')
- Migration 116: `invoice_drafts.performance_date DATE`
- OCR Claude prompt extended with `performanceDate` (5 HU label variants) + `paymentMethod`. Regex fallback extended too.
- POST `/api/v1/invoice-drafts/:id/convert` — single transaction creates the expense + copies the PDF + marks draft converted + links final_expense_id. Idempotent (re-convert returns 409 with existing link).
- Tab 2 "Beérkezett számlák" UI — compact convert dialog pre-filled from draft metadata, PDF auto-attaches server-side
- Dry-run OCR script (`scripts/ocr-dry-run.js`) verified `performanceDate` extraction on real PDFs: KZC ELEKTRO-KLÍMA (perf == invoice == 2026-04-21) and MVM gas bill (perf=2026-04-23 vs invoice=2026-04-11 → 12-day gap proves real teljesítés extraction).
- All 5 historical invoice_drafts manually converted to expenses by user during this session.
- `tests/invoiceDraftConvert.script.js` — 21 HTTP cases including response-shape contract (camelCase keys present, snake_case absent) + performance_date priority chain

**Day 4 — accountant share links** (just committed, `2a142073`):
- Pivot mid-session: original plan was per-month-package (PDF + Excel + ZIP saved to disk + email delivery). Scrapped after user feedback. New shape: tokenised public URL accountant opens without login, server-rendered HTML, on-demand ZIP stream.
- Migration 117 — `accountant_share_links` table. `DROP TABLE accountant_packages CASCADE` torn down in-line (zero rows on prod).
- Service: `crypto.randomUUID()` tokens, atomic accessed_count via UPDATE…RETURNING, Excel (2 sheets — Tételes + Összesítő), archiver streaming directly to express response, server-rendered Hungarian HTML.
- Public route `/public/accountant/:token[/download-all|/file/:e/:f]` — no auth, rate-limited 30 req/min per token, `Cache-Control: no-store` + `X-Robots-Tag: noindex,nofollow`.
- Admin route `/api/v1/accountant-links` (list / POST / DELETE). Tokens truncated to last-6 in activity_logs.
- Tab 5 "Könyvelői hozzáférés" — year/month/expiry picker + just-created-banner with copy-to-clipboard + active links table (expiry chip colour-coded).
- Public-URL base cascade: `PUBLIC_BASE_URL → FRONTEND_URL → X-Forwarded-* → req.host`. Vite proxy gained `/public/*` forwarding to backend so single ngrok tunnel pointed at Vite serves both admin + public origin.
- `tests/accountantShare.script.js` — 23 HTTP cases.

**All 7 backend suites still green: 95 + 22 + 25 + 21 + 21 + 23 + 19 = 226/226.**

### WHAT'S IN PROGRESS

- **Mobile end-to-end test for Tab 5** — blocked by stale ngrok tunnel. Code is correct (verified `localhost:5173/public/accountant/<token>` proxies through Vite to backend and returns the Hungarian HTML).
- **Day 5** — Gmail poller reactivation + AI suggestion mode (planned).

### WHAT'S NEXT

In priority order:
1. **Re-establish ngrok tunnel** pointing at Vite port 5173 (`ngrok http 5173`). Update `FRONTEND_URL` in `.env` with new URL. Restart backend.
2. **Re-test Tab 5 mobile path** (step 12 from the earlier test plan). Open generated public URL on phone, verify expense table renders + ZIP download works + individual file links work.
3. **MASTER_TODO.md — cross-project audit.** User flagged significant gaps in tracking. Tomorrow's first task: walk every project the user owns and pull pending items into one master list. In scope (at minimum):
   - HR-ERP (this repo) — accumulated open items: AI suggestion in Tab 2 convert dialog, Tab 2/3 billing-runs/billings list placeholders, Gmail poller reactivation, S3/backup of `uploads/`, payroll-cron promote from DRY-RUN, pg DATE serialisation systemic fix
   - **Pulse Solutions** — separate project, current state unknown to me
   - **Workforce Platform** — separate project, current state unknown to me
   - **Onboarding videos (AI-generated)** — user explicitly flagged as "significantly behind"
   - **StockMaster** — separate project, current state unknown to me
   - Any other repos / initiatives the user lists when we start
4. **Day 5 — Gmail poller reactivation:** flip `GMAIL_POLLING_ENABLED=true` in `.env`, OAuth refresh-token regen (it's been `invalid_grant` since 2026-04-21), watch for new drafts to land with the new prompt (vendor + invoice + dates + amounts + performanceDate + paymentMethod).
5. **Day 5 — AI suggestion mode:** the predicted cost_center from OCR pipeline should flow into the Tab 2 convert dialog as a pre-fill (existing `suggestedCostCenter` field on the draft, not currently surfaced in the UI).

### BUGS / TODOs DISCOVERED

- **ngrok tunnel `blinker-bronze-evasion.ngrok-free.dev` is dead** — returns ngrok's offline page on every path. Either rotate or restart.
- **LAN IP drift** — PROJECT_STATE noted `192.168.1.29`; current is `192.168.1.15`. Not worth tracking; mobile dev uses ngrok URL anyway.
- **`ACCOUNTANT_EMAIL` still placeholder** (`konyvelo@placeholder.hu`). No code uses it in the current share-link model — only needed if email delivery returns.
- **pg DATE → JS Date → UTC drift** — workaround helpers in 3 places (`fmtDateInput`, `dateToISODate`, `asLocalDate`). Systemic fix `pg-types.setTypeParser(1082, v => v)` remains tech debt in PROJECT_STATE.md.
- **🚨 Cross-project tracking gap (USER-FLAGGED)** — pending items live in scattered places across the user's portfolio. Onboarding videos (AI-generated) explicitly identified as significantly behind. Other projects (Pulse Solutions, Workforce Platform, StockMaster, etc.) have unknown current state from this session's vantage. Tomorrow's MASTER_TODO.md audit is the response.

### ARCHITECTURAL DECISIONS

- **Share-link model over per-month package** (mid-Day-4 pivot): no email delivery, no PDF summary, no on-disk ZIP. Tokenised public URLs + on-demand ZIP streamed from express response. Excel-only summary (accountant has own bookkeeping software).
- **Public-URL base cascade** — single env knob (`FRONTEND_URL`) makes both admin SPA and accountant link work through one ngrok tunnel. `PUBLIC_BASE_URL` available for cases where they need to differ (S3-hosted public + same-host admin etc.).
- **Vite `/public/*` proxy** — single-origin dev story. One tunnel.
- **Token entropy = `crypto.randomUUID()` (122 bits).** No need for custom generator. UNIQUE constraint doubles as lookup index.
- **No JSONB access history** — single most-recent IP + counter only. JSONB array is tech debt if forensics need it.
- **Convert endpoint skips dedup gate** (Day 3): same vendor + amount on recurring monthly bills is expected and shouldn't bounce the user.
- **OCR prompt instructs Claude to return performanceDate even when equal to invoiceDate** — don't deduplicate, accountant uses teljesítés date for VAT period.

### CONTEXT FOR NEXT SESSION

**When resuming:**
1. Read `PROJECT_STATE.md` Active Systems — both Day 3 (drafts conversion) and Day 4 (share links) should be listed; check it's up to date.
2. `git status` — working tree should be clean (everything committed).
3. Run `git log --oneline -15` — recent commits: VAT (3) → Day 3 (1) → Day 4 (1) + session log.
4. **First task: MASTER_TODO.md.** Before touching HR-ERP code, sit with the user and enumerate every project + pending item. The user explicitly named: HR-ERP, Pulse Solutions, Workforce Platform, Onboarding videos (AI-generated — flagged as behind), StockMaster. Likely more. Goal is a single audit doc that surfaces everything in flight so the next prioritisation conversation has data behind it.
5. Open Tab 5 (`/admin/billing?tab=shares`) to confirm UI loads after HMR/restart cycles, then proceed with mobile-path verification once ngrok is back.

**To unblock mobile:**
```
ngrok http 5173
# copy the https://*.ngrok-free.dev URL
# update FRONTEND_URL in .env to the new URL
# restart backend
```

Then generate a new share link in Tab 5 → URL in the success banner is the ngrok URL → open on phone.

**Don't forget:**
- 226/226 tests green; running `node tests/<file>.script.js` for any suite gives same result.
- Backend and Vite both running with today's changes (PIDs may differ; check `lsof -i :3001 :5173`).
- The "stale Node module" bug class is now caught by the VAT HTTP smoke (`expenseVatHttp.script.js`) AND the camelCase contract in `invoiceDraftConvert.script.js`. Next time we refactor a service, those will catch it.

**Watch out for:**
- pg DATE columns serialise to UTC ISO via JSON — use one of the three helpers (`fmtDateInput` / `dateToISODate` / `asLocalDate`), never `String(d).slice(0,10)`.
- `activity_logs.action` is `VARCHAR(20)` — new action names must fit. Current actions: `dedup_override`, `file_upload`, `file_download`, `file_delete`, `draft_convert`, `from_draft`, `share_create`, `share_revoke`.
- Adding new model/service functions: restart the live `npm start` before browser-testing — `node tests/*.script.js` loads fresh modules every run and won't catch a stale process.

---

## SESSION 2026-05-21 (occupancy billing → admin UI → docs)

### WHAT WAS DONE

**Backend — occupancy billing chain** (committed earlier in session, pushed to `origin/main`):
- `117fed12` Migration 112: occupancy billing schema (`owner_billing_info`, `employee_accommodation_history`, `accommodation_expenses`, `occupancy_snapshots`, `billing_runs`, `accommodation_billings`) + backfill of existing employees.
- `f7df9d29` Daily occupancy snapshot service + cron.
- `ab98aaed` Monthly billing engine (incoming) — pro-rata per-day-per-occupant math.
- `b24a9439` Monthly billing cron + `notes` option on engine.
- `c9973de2` Expense CRUD endpoints (`POST/GET/GET/:id/PUT/DELETE /api/v1/expenses`) + 48-case integration test (`tests/expense.script.js`) hitting real DB.
- `2adbaed5` Profit endpoint `GET /api/v1/profit/by-accommodation?month=YYYY-MM` + 19-case integration test (`tests/profit.script.js`). Bug found and fixed mid-run: `LEFT JOIN billing_runs` with cancellation filters on the ON clause leaked cancelled/outgoing rows; switched to `INNER JOIN`.

**Admin frontend:**
- `dc0887c0` `/admin/billing` page with 4 tabs scaffolded; Tab 1 (Expenses CRUD) fully built — filter bar, table, create/edit dialog, soft-delete, Hungarian formatting. Tabs 2–4 placeholders.
- _uncommitted_: Tab 4 (Profit dashboard) — 4 summary cards, Recharts bar chart (income vs expenses), detailed per-accommodation table with per-category breakdown. Two bugs caught in browser test and fixed: (a) loading spinner invisible (API too fast); (b) chart glitch on month change. Root cause: eager `setData(null)` + `useCallback`/`useEffect` indirection. Refactored to single inline effect with `cancelled` flag and `refreshKey` state, plus 300 ms minimum spinner visibility.

**Investigation:**
- Audited overlap between old cost_centers + invoice classification pipeline and new accommodation_expenses. Findings: same business question, no schema link, old pipeline dormant since 2026-04-21 with 0 finalized invoices and 5 stale drafts. Full analysis in `docs/ARCH_COST_TRACKING_OPTIONS.md`.

**Docs (this batch):**
- `PROJECT_STATE.md` — live architecture doc, active/dormant systems, recent work, decisions, overlaps, tech debt, current focus.
- `SESSION_LOG.md` — this file.
- `CLAUDE_CODE_INSTRUCTIONS.md` — read-order for future sessions.
- `CLAUDE.md` — minimal pointer to the above (this filename is the one Claude Code auto-loads).
- `scripts/session-start.sh`, `scripts/session-end.sh`.
- `docs/ARCH_COST_TRACKING_OPTIONS.md` — three-option analysis for cost-tracking unification.

**Git identity fix:**
- Set global `user.email=lerchbalazs@gmail.com` and `user.name="Lerch Balázs"`. Earlier commits in this branch (before fix) had auto-derived `lerchbalazs@mac.t.hu`.

### WHAT'S IN PROGRESS

- **Tab 4 fixes uncommitted** — `hr-erp-admin/src/pages/Billing.jsx` modified in working tree. Awaiting browser re-verification before commit.
- **Cost-tracking architectural decision** — awaiting user choice between options A/B/C in `docs/ARCH_COST_TRACKING_OPTIONS.md`.

### WHAT'S NEXT

In priority order:
1. Verify Tab 4 fixes in browser → commit.
2. User picks A/B/C for cost tracking.
3. Build Tab 2 (Billing runs list) + Tab 3 (Billings list with JSONB detail modal) on `/admin/billing`.
4. Decide Gmail poller status — confirm whether it's still running and either disable or rewire.
5. Move payroll-deduction cron from DRY-RUN to live.

### BUGS / TODOs DISCOVERED

- **Gmail poller** registration status unknown. `src/services/gmailMCP.service.js` may still be polling and producing orphan `invoice_drafts`. Verify before deciding pipeline disposition.
- **5 stale invoice_drafts** from 2026-04-21 — need a one-time decision: re-enter as `accommodation_expenses` or archive.
- **`Sarród I.` vs `Sarród II.` accommodations** vs old CC `Sarród szálló` — split mismatch if AI pipeline ever revived.
- **`docs/PROJECT_CONTEXT.md` is 2.5 months stale** (2026-03-07). Either refresh or deprecate.

### ARCHITECTURAL DECISIONS

- Profit endpoint: `INNER JOIN billing_runs` (not LEFT) so cancelled / non-incoming runs can't leak income. Also exclude `accommodation_billings.status='cancelled'`. Documented in `profit.service.js` docstring.
- Profit margin returns `null` (not `0`, not `-Infinity`) when income is 0. Frontend renders as "—".
- Soft-delete pattern for `accommodation_expenses` (deleted_at column). List and getById both filter it out at the SQL level.
- Schema deviation from user's original spec: `accommodation_billings` has no `deleted_at` — cancellation lives in `status='cancelled'` on both `billing_runs` and `accommodation_billings`. Used the real schema.

### CONTEXT FOR NEXT SESSION

**When resuming:**
1. Read `PROJECT_STATE.md` end-to-end (it's the source of truth).
2. Skim this entry.
3. Run `git status` — Tab 4 fix may still be uncommitted.
4. If user wants to keep building billing UI, Tab 2 + Tab 3 are next.
5. If user wants to resolve cost-tracking unification, see `docs/ARCH_COST_TRACKING_OPTIONS.md`.

**Don't forget:**
- Tests for backend changes go in `tests/*.script.js` (pure-Node, real-DB integration style). They clean up after themselves.
- Frontend builds clean with `npm run build`; no test runner wired for admin yet.
- Backend dev server: port 3001. Admin Vite: port 5173. Postgres: local on 5432, db `hr_erp_db`, user `lerchbalazs`, no password.
- Categories on `accommodation_expenses` are hardcoded CHECK constraint (`rezsi/karbantartas/takaritas/egyeb`) — NOT a separate table.

**Watch out for:**
- Hungarian labels everywhere in admin UI — keep that convention.
- The `accommodations` table has no `cost_center_id` FK; do not assume one exists.
- The mac/jp keyboard or different system may flip user.email back to `mac.t.hu`. Re-verify with `git config --global user.email`.

---
