# SESSION HANDOFF LOG

Newest entries first. Each session is one block. Append, do not edit history.

For long-running context (architecture, dormant systems, overlaps) see `PROJECT_STATE.md`.

---

## SESSION 2026-09-02 — Partner/CRM inventory → Phase 0 security foundation → Phase 1 contracts+contacts (all deployed)

Three rounds in one session: an inventory that turned into a production incident-in-waiting, the security work that had to land before any external user can exist, and the first build of the partner module.

### The find that mattered most

While settling the "migration runner blocked at 093" tech-debt item, 093 turned out to contain
`DELETE FROM employees WHERE contractor_id IS NULL`. That was correct in 2026-04 when a NULL
contractor meant "row from generate_test_employees.js". **It is now false: dev 286/287 and prod
286/288 real employees have a NULL contractor.** The migration would have deleted essentially the
entire workforce plus salaries, notes and documents.

The trap was specifically that the *obvious* fix was the dangerous one. The runner appeared
"blocked" by a stale `users = 1` assertion — but that assertion fires at the END of the
transaction, so **it was the only thing rolling the deletes back**. Repairing it to unblock the
runner, which is what the task looked like, would have caused the loss.

Disposition: `OBSOLETE_MIGRATIONS` in `src/database/migrate.js` records the id and never executes
the SQL; the file carries a DO-NOT-RUN header. **Proven, not asserted:** restored a prod backup
into a scratch DB (288 employees / 286 NULL-contractor / original 89-row ledger), ran the real
runner with all migration files present → `⊘ [093] OBSOLETE, recorded without running`, employees
288 → 288. The counterfactual on that same copy: 093's own WHERE clause matched **286 employees +
4 documents** (rolled back).

A first attempt at that proof was worthless and got thrown away — the runner said "nothing to do"
only because **the image contained no `migrations/` directory at all**. That was the second root
cause: it is why prod's ledger had drifted **45 rows** behind the real schema and why every
migration since 093 went in by hand. Fixed with `COPY migrations ./migrations` (safe only once the
093 guard existed).

### Phase 0 — security foundation (deployed, `e17c336c` + `5f40db00`)

The DEEP_AUDIT permission findings are inert only because every staff account is superadmin; they
go live the moment one limited user exists, which is the prerequisite for external sales agents.

- **Gate A** (reachable with only a login): `/analytics/overview` gated (`dashboard.view` — our
  market intelligence), `/rooms/:id/inspection-history` gated + scoped, 12 unguarded
  CarePath/WellMind frontend routes + BrunoTest guarded, role-aware `HomeRedirect` replacing the
  hardcoded `/dashboard` landing.
- **Gate B**: #6 employees reads, #7 finance reads (invoices, salary, expenses **incl. the
  attachment download**, profit, operating costs **incl. the export**, occupancy reports), #8 tasks
  + timesheets incl. the `contractor_id` body-reassignment hole, plus `/admin/documents/expiring`
  (role-checked but never tenant-scoped).
- `utils/tenantScope.js` is now the ONE scope helper — its predicate builder always returns a
  complete boolean, so a filter-less WHERE cannot be emitted. Out-of-scope single rows answer 404,
  never 403.
- `middleware/moduleScope.js` — fail-closed allow-list at the `authenticateToken` choke point.
  An allow-list because a deny-list across 77 route files rots; route file #78 is denied by
  default. In place BEFORE the role that needs it exists.

**Two of my own earlier claims were wrong and got corrected:** gamification and ai-assistant are
NOT leaks — already scoped by `req.user.id` / server-side `contractorId`. Removed from the gate.

FUNCTEST known-gap 11 → 6 with **PERM-14/15/16/17/18 flipping to FIXED on their own**. Full jest
identical to a stashed baseline (3 pre-existing `role "postgres" does not exist` env failures).

### Phase 1 — partner contacts + contract lifecycle (deployed, `990ead15`, mig 144)

`partner_contracts` covers megbízó/szállásadó/alvállalkozó via one `contract_role`. **An
accommodation lease is a szállásadó contract carrying `accommodation_id`, never columns on
`accommodations`** — one landlord may rent us several properties on different terms.
`notice_deadline` is GENERATED, because that is the date the business acts on and a stored copy
would drift. `partner_contacts` allows many contacts with exactly one primary, enforced by a
**partial unique index** rather than by the controller remembering.

Expiry monitor generalised: `notice` is its OWN field, so one contract runs two independent alert
cycles off the same row — verified live on prod (`notice`@14d + `partner_contract`@30d from one
contract; re-run fired 0). Alerts name the contract and deep-link to `/partners/contracts`.

`documents` gained the party link (closes the gap PROJECT_STATE tracked). Partner master data
(adószám / cégjegyzékszám / bankszámla) went onto `contractors`; `owner_billing_info` — 0 rows,
0 refs, keyed on `user_id` — is marked superseded, not dropped (owner's call).

**mig 144 was applied via the runner, not psql** — the first migration in this project to use the
mechanism end-to-end. Ledger 134 → 135.

FUNCTEST 121 → **133 passed / 0 failed** (12 new PARTNERS scenarios); `partnerPhase1.script.js`
26/26; i18n guard exit 0.

### Prod facts corrected along the way

- **The prod database is `hr_erp`, not `hr_erp_db`** (that is the dev DB). `psql -d hr_erp_db` on
  the prod host fails outright. The deploy header said the wrong name.
- Prod ledger reconciled 89 → 134 by recording 44 already-applied migrations **without executing
  them**, justified by a zero-diff schema comparison against a freshly end-to-end migrated dev DB
  (2195 = 2195 columns).

### Open / next

- **Phase 2 (partner_activities + follow-ups reusing `tasks`) is the agreed next round** — until it
  lands, the Aktivitás tab is a labelled placeholder, deliberately not a fake empty list.
- Phase 3 (leads/opportunities/quotes) then Phase 4 (external agent enablement, gated on Phase 0).
- External agents see **NO financial data at all** (owner decision 2026-09-02) — no prices, quote
  amounts, contract values or margins. Widening later is an allow-list change by design.
- Sidebar/tab rendering was verified at the BUNDLE level (strings + routes present, APIs 200), not
  visually — no browser in the session. Worth a click-through.
- jest integration tests still write `Integration Test Ticket` rows to the dev DB without cleanup.

---

## SESSION 2026-08-08b — Resident video communication built (mig 143, SANDBOX ONLY, not deployed)

Residents get information as VIDEO in their own language, by push, targeted to whoever it concerns, plus a permanent searchable library. Three send modes funnel through ONE path so translation, push, delivery logging and watch evidence behave identically however a video was triggered.

**Inventory first — and a lot already existed.** `videos` / `video_versions` (per-language `playback_url` + `provider_asset_id`, Synthesia-shaped) / `video_subtitles` / `video_views` (progress, completed, `language_watched`) and a `getCompliance` endpoint were all built and unused (0 rows on prod). Push was fully wired end-to-end: `expo-server-sdk`, `user_push_tokens`, mobile token registration, cold-start tap handling and `routeForNotification` deep-linking by `data.type`. **The mobile app already had `VideoListScreen`/`VideoDetailScreen` and a language picker that already persisted to `users.preferred_language`** — `MoreMenuScreen` even carried a comment explaining videos were hidden because the staff endpoints would 403 for residents. So the real gaps were narrow: resident-safe endpoints, free-text push translation, and a sequence engine.

**mig 143 — 6 tables.** `video_sequences` (anchor: move_in / employment_start / calendar) · `video_sequence_steps` (arbitrary day-index OR month-day) · `video_announcements` · `video_announcement_recipients` (language + push result; also the resident's visibility list) · `video_sequence_sends` (**UNIQUE (sequence_id, step_id, user_id)**, the expiry_alert_log idempotency pattern) · `video_delivery_config` (per-day cap, re-nag window).

**Answers to the four questions, as built.** (1) **Late join** — a resident already housed when a sequence goes live gets **day 1 only**, then continues on their own day-index; no backlog, everything else stays in the library. (2) **Language** — the picker already existed on login + profile and already wrote `users.preferred_language`; added `preferredLanguage` to `req.user` so resident content resolves without a lookup. (3) **Mandatory** — watch evidence in `video_views` plus **one** re-nag push after a configurable 3 days, stamped so it can never repeat. (4) **Anchor** — `arrival_date` (287/288) for housing; `start_date` supported as a second anchor for when it is populated.

**Also built:** `videoAudience.service` (one resolver for all modes; **an empty audience reaches NOBODY** — blanket must be chosen explicitly, and the nationality/language filters warn that their source columns are empty rather than silently returning nothing); `videoAnnounce.service` (translate once per language, not per recipient; in-app + push; delivery logged; margin between "sent" and "watched" preserved as the compliance evidence); `videoSequence.service` (one daily job for all three anchor types, per-person cap across ALL sequences with the remainder deferring to tomorrow); a `video_announcement` push type carrying caller-supplied translated copy; resident Path-B routes; admin Videók → **Kommunikáció** tab (send / sequences / history + compliance / config); mobile switched to the self-scoped API with a `video_announcement` deep-link case.

**Verification.** `tests/integration/videoCommunication.test.js` **23/23** (audience, translation per language, late-join day-1-only, cap, calendar month-day, re-nag once-and-only-while-unwatched, sent-vs-watched). FUNCTEST **VIDEO area 12/12** over the real HTTP surface → suite now **121 passed / 0 failed / 11 known-gap** across 132 scenarios, byte-identical across runs. Full jest on a fresh migrated DB: **82 suites / 1483 passed**, three consecutive clean runs. `scripts/check-i18n-coverage.js` **exits 0**. Admin builds clean; all four touched mobile files parse.

**Two of my own test bugs, found and fixed rather than worked around:** a fixture violated the pre-existing `videos_scope_target_check` (a contractor-scoped video must carry a contractor_id), and VID-09 inherited `video_delivery_config` left tuned by the jest suite — the config is now pinned in setup and the assertion sharpened to the real invariant (a step never fires twice) rather than the brittle "nothing new at all".

**⚠️ LAUNCH PREREQUISITE, logged in PROJECT_STATE tech debt:** Android push delivery needs **FCM credentials in the Expo project** — unverified. Without them Expo ACCEPTS the send and never delivers, silently. Prod has 2 push tokens and none tested on a real Android handset. `push_ok = true` currently means "handed to Expo", not "delivered". Must be tested on a real device before residents are told to rely on it; iOS needs the equivalent APNs check.

**Doc correction:** PROJECT_STATE claimed cron lives in `src/cron/` — that directory does not exist. Reality is 8 inline jobs in `server.js` plus `config/cronSchedule.js` (named `wrap()`, explicit Europe/Budapest); the video jobs went in the latter. Noted in tech debt.

**NOT DEPLOYED — sandbox only, awaiting approval.** Deploy would be: push → CI → `pull && up -d backend admin` → mig 143 via psql (additive: 6 new tables, no changes to existing ones).

---

## SESSION 2026-08-08 — Backfill applied to prod + COST side built (rent basis + utilities matrix)

### Part 1 — the history backfill went live (approved after the dry run)

**Verified backup first:** `./backup.sh` → `db-20260808-0449.dump`, restored into a throwaway `hr_erp_verify` (`pg_restore` rc=0) and compared to live: employees 288, users 7, accommodations 16, history 284, snapshots 15 620, billings 71 — **identical**. Scratch DB dropped afterwards.

**Dry run (reported and approved):** 284 stale rows, 3 missing, **0 overlaps**. Key characterisation: all 284 differed **only by `room_id`** — the accommodation matched in every case. History had *never* carried a room (`history rows with a room_id = 0`) while 287 employees got one from the 2026-07-13 room-linker. So accommodation-level occupancy had been right all along; only room-level data was missing.

**Applied:** 284 corrected + 3 opened → 287 open rows, 0 out of sync, 0 overlaps, self-verify green.

**Live-verified:** `recordDailySnapshot` wrote **287 rows** (was 284) and **287 now carry a room** (was 0). A real room change over the public API (`PUT /employees/:id` via Caddy) wrote `reason='employee update'` history; reverting restored both the room and the history. Employee left exactly as found.

### Part 2 — COST side (mig 142)

**⚠️ Found and fixed while building it:** migration 112 allocated rent as `monthly_rent / days / room_occupant_count` **grouped by (accommodation, room)** — so a site's rent was charged **once per occupied room**. Sopronhorpács has 31 occupied rooms, Röjtökmuzsaj 25, Beled 16. It was invisible only because no housed accommodation had a rent set *and* history carried no room; **the backfill in Part 1 is what would have made it reachable**. Now allocation is SITE-level: rooms stay on snapshots for occupancy analytics and never touch cost. `occupancyTracking` divides by site headcount too, so the stored share stops lying.

**Configured PER ACCOMMODATION, never per partner** (one owner may hold several properties on different contracts). Three bases: `flat` (fix havi díj az egész ingatlanra) · `per_bed_night` (foglalt ágy × díj × éj) · `mixed` (flat + the utility lines we pay). A NULL basis behaves as flat over the legacy `monthly_rent`, so nothing silently drops to zero.

**Six-line utilities matrix** (víz és csatorna · internet · áram · gáz · közös költség · hulladékszállítás), per line and independent: who pays (mi/szállásadó) · in whose name the contract runs · passed through to the megbízó · at what share. Where WE pay → cost + profit dashboard. Where passed through → revenue at `recorded amount × share` (VAT per the client's rate) → **margin-neutral at 100%**. An expense recorded on a line the matrix says the szállásadó pays is **flagged**, never silently absorbed. Expenses are tagged with `accommodation_expenses.utility_line`.

**Admin:** Szálláshely részletek → rent-basis selector + amount fields in the edit form, and a new **„Költség & rezsi"** tab with the full matrix (unconfigured lines highlighted). **Coverage:** `/billing/rate-coverage` now returns `cost_issues` — no rent basis / missing amount / incomplete matrix.

**Tests:** `tests/integration/costModel.test.js` **10/10** (FLAT 600 000 across 4 rooms → 600 000 not 2 400 000; PER-BED 10×800×30 = 240 000; VEGYES flat+utilities; pass-through margin-neutral; mismatch flagged; legacy no-basis → flat; profit reconciles under all three). FUNCTEST **COST-01..09** added → **109 passed / 0 failed / 11 known-gap over 120 scenarios**. Full jest on a fresh migrated DB: **80 suites / 1454 passed**.

**Also:** `Dockerfile` now `COPY scripts ./scripts` — the Part-1 backfill had to be `docker cp`'d onto the running container because ops scripts were never in the image.

**Pre-existing flake confirmed, not introduced:** `inspectionWorkflow.e2e` „POST /inspections creates a draft" fails intermittently under jest's parallel workers (~1 in 6 full runs). Verified by stashing every change and running the baseline on a clean DB — it flakes there too (already noted in the 2026-07-19d entry). Worth its own fix; unrelated to this work.

**NOT YET DEPLOYED — awaiting go-ahead.** Deploy = push → CI → `pull && up -d backend admin`, then apply **mig 142 via psql** on prod (additive: 3 nullable columns + 1 table + 1 nullable column; `rent_amount` back-filled from `monthly_rent`). No behaviour changes for prod until a basis is set, because prod's housed accommodations have no rent configured — but the ×room multiplication is fixed *before* anyone enters one, which is the point.

---

## SESSION 2026-08-07b — Fixed the two FUNCTEST findings: frozen billing roster + effective cross-tenant/resident writes

Both findings from the FUNCTEST session are closed, sandbox-tested and covered by regressions. **FUNCTEST is now 100 passed / 0 failed / 11 known-gap over 111 scenarios** (was 90/0/15) — DATA-01, PERM-13, PERM-19 and PERM-20 flipped from ⚠️ KNOWN-GAP to ✅ PASS. Full CI jest on a fresh migrated DB: **79 suites / 1444 passed, 0 failed** (1434 + the 10 new).

### 1. 🚨 The billing roster was frozen (money path) — FIXED

`occupancy_snapshots` is fed **exclusively** by `employee_accommodation_history`, and nothing in `src/` ever wrote that table — the only writes were migration 112's one-time backfill and the sandbox seed. Room moves, accommodation transfers, hires and terminations therefore never reached snapshots, so the billing engine billed the mig-112 roster forever. (Deep-audit row #21 passed because it seeded history rows by hand: it proved the engine, not the feed.) Demonstrated on a freshly reset sandbox: **310 housed employees, 0 history rows, `recordDailySnapshot` → 0 rows written**.

**New `src/services/accommodationHistory.service.js`** — `syncAssignment` / `closeAssignment` / `backfillCurrentRoster` / `findOverlaps`. Wired **inside the same transaction** as the employees UPDATE at every housing path: `updateEmployee`, `createEmployee` (hire), `deleteEmployee` (termination), `bulkImportEmployees`, `bulkAssignRooms` (Excel round-trip), `consolidationEngine.applyGroup`, `room.controller.deleteRoom`. `updateEmployee`, `deleteEmployee`, `bulkAssignRooms` and `deleteRoom` were wrapped in transactions so the row and its history can never disagree.

**Semantics follow mig 112:** a change effective on D closes the old stay at D and opens the new one at D → the handover day lands on the NEW accommodation. A stay opened on D and changed again on D is **replaced**, not closed-and-reopened (no zero-length rows). Hire+termination on the same day leaves no row at all — they never occupied a bed.

**The invariant that matters:** no employee may hold two rows covering one day. `recordDailySnapshot` inserts `ON CONFLICT (snapshot_date, employee_id)`, so a double-covered day would abort the snapshot **for everyone** with "cannot affect row a second time". `findOverlaps()` guards it, the backfill verifies it, and FUNCTEST DATA-06 asserts it globally.

**Backfill:** `scripts/backfill-accommodation-history.js` (`--dry-run` supported). Aligns the current roster **without rewriting past rows** — a mismatch is closed today and a correct row opened today, so tomorrow's snapshot is right and no past invoice is restated. Self-verifies (0 out-of-sync, 0 overlaps) and is idempotent. Sandbox proof: 310 rows opened → `recordDailySnapshot` went **0 → 310 rows written**; re-run reported "already correct: 310".

**Regression:** `tests/integration/accommodationHistory.test.js` (10 tests — open/no-op/room change/same-day replace/close/overlap + the history→snapshot chain + backfill dry-run and apply) and FUNCTEST **DATA-01..07** (room move via real `PUT /employees/:id` → snapshot shows the new room; consolidation approve; hire; termination; long-stay termination closes rather than deletes; global overlap check; roster↔history agreement).

### 2. ⚖️ Effective cross-tenant and resident WRITES — FIXED

All three were confirmed live over real HTTP before the fix, and all three are now 403 with no row changed:

- **`PUT /employees/:id` (DEEP_AUDIT #6, write side).** A tenant-1 `data_controller` mutated a tenant-2 employee row. `updateEmployee` now refuses a foreign `contractor_id` before building the UPDATE. **The READ side of #6 is still open** (FUNCTEST PERM-14 keeps it visible), as are #7 and #8.
- **worker-specializations writes (#13).** A resident POST with a valid body returned **201 and created a real row**. POST/PATCH/DELETE now require `employees.edit` **and** verify the target user's contractor.
- **GTD metadata writes (#16).** A resident PATCH on a real ticket returned **200 and the ticket changed**. `/gtd/tickets/:id/gtd` now requires `tickets.edit` and `/gtd/projects/:id/gtd` requires `projects.edit`, both with a contractor predicate in the UPDATE.

Superadmin bypasses all three; rows with a `NULL` contractor_id stay writable (single-operator deployment — hard-failing them would break legitimate edits; see the "strict contractor_id hides GLOBAL content" anti-pattern in PROJECT_STATE).

### Also

- FUNCTEST scenarios now exercise the REAL application paths rather than raw SQL (DATA-01 goes through `PUT /employees/:id`), and DATA-02 is order-independent so `--only=DATA` works standalone.
- The fixture runs the real backfill, so the roster↔history invariant is asserted across the whole sandbox, not just fixture rows.
- Earlier caveat resolved: the 4 jest suites that failed locally were stale local DBs (`hr_erp_test` at mig 126). On a fresh DB migrated to 141 the whole suite is green.

**Not run:** `scripts/check-i18n-coverage.js` — no resident-facing UI or resident-visible enum was touched.

**NOT YET DEPLOYED — awaiting owner go-ahead.** Deploy checklist: push → CI → `pull && up -d backend` → then **run `node scripts/backfill-accommodation-history.js --dry-run` on prod first**, review the counts (expect ~288 rows to open), then apply and confirm it self-verifies. Until the backfill runs on prod, prod snapshots keep using the mig-112 roster.

---

## SESSION 2026-08-07 — FUNCTEST: automated end-to-end functional suite (sandbox-only)

Built a scenario-driven harness so scenarios stop being tested by hand. **`npm run functest`** resets `hr_erp_sandbox`, seeds a deterministic fixture, runs **105 scenarios**, and writes `docs/FUNCTEST_REPORT.md` (scenario · expected · actual · result, with an exact repro block per failure). Baseline: **90 passed / 0 failed / 15 known-gap**, ~14 s from a cold reset, **byte-identical across consecutive runs**.

**Design** (`docs/FUNCTEST_PLAN.md` = catalog + rationale): scenarios assert VALUES, not status codes. They call the REAL services and read rows back from Postgres — no business logic is re-implemented. Permission scenarios boot the real express app in-process and call it with real signed JWTs against the sandbox (nothing mocked, unlike `residentLeakGuards.test.js` which mocks auth+DB). Six existing jest suites are re-run by the same command and folded into the report; the other ~1428 CI tests are untouched. Deterministic: sentinel month `1903-06`, no RNG/clock, `TZ` pinned, rents chosen so `rent/30/headcount` is exactly 1000 or 4000 Ft.

**SANDBOX ONLY — 4-layer guard**, all four proven: shell refuses a non-sandbox `DB_NAME`; the runner refuses protected names (`hr_erp_db`/prod), non-local hosts, `NODE_ENV=production`, and **refuses to fall back to a default DB when `DB_NAME` is unset**; a live `SELECT current_database()` + `inet_server_addr()` check runs on the pool the services themselves use; the base seed keeps its own guard. Teardown verified to leave zero `FT` rows.

**Coverage.** BILLING 23 (per_person · flat full+prorated · per_bed used-only/used+empty/floor · the worked examples 95→340 000, 80→330 000, 92→334 000, Autoliv 60@90%/40 occ→198 000 · capacity fallback · over-occupancy · VAT taxable/exempt · invoicing on/off · company vs private payroll-handoff with zero payroll rows · two megbízók on one site → two invoices · compensation as a separate line on the right megbízó, out of margin, **disputed excluded** · unattachable claim surfaced · re-run idempotency). CONSOLIDATION 12+3 (independent replay of EVERY suggestion of a full run → 0 gender/shift/workplace/capacity/cross-accommodation violations; approve→apply→history, partial completion, reject, re-apply refused). PERMISSIONS 13+8 (per-role CAN/CANNOT derived from `role_permissions` vs the route's declared permission vs the actual HTTP status — three sources must agree; the 4 resident leaks re-proven 403 with a real login; cross-tenant probes). REPORTS 12+3 (all 6 generators reconciled against independent SQL counts; profit = income − (expenses + rent) ≡ engine margin; committed/lekötetlen/empty-bed columns). DATA 16+1 (transfer pro-rata + same-day handover, expiry buckets + idempotency, hygiene fine 2×7pt → one 20 000 Ft fine + idempotent + no payments/deductions, GDPR erasure + receipt + independent PII sweep + non-repeatable). AUTOMATIONS 8 (stored report output, forced delivery failure → 0/1 recorded + ops alert, loud unknown-type failure, billing draft set, snapshot cron count + idempotency).

**Known-gap bucket** (owner's call): 15 scenarios assert the CORRECT behaviour against documented-open findings, so they are reported loudly but do NOT fail the run — and flip to 🎉 FIXED automatically when closed. Covers DEEP_AUDIT #6,7,8,11,12,13,14,16,17,18 plus the three consolidation constraints that engine v1 does not implement (do-not-move LOCK, 60-day stability window, approve→ticket→confirm lifecycle — migs 133–135 are sandbox-only and not in this repo).

**🚨 Two findings that were NOT in the deep audit** (both added to PROJECT_STATE tech debt, neither fixed):
1. **`employee_accommodation_history` has no application writer.** `recordDailySnapshot` reads it exclusively; the only writes are mig 112's one-time backfill and the sandbox seed. Room moves, transfers, hires and terminations therefore **never reach occupancy snapshots** → billing bills a frozen roster. Audit row #21 passed only because it seeded history by hand. Pinned by DATA-01.
2. **DEEP_AUDIT #6 is also a cross-tenant WRITE.** A tenant-1 `data_controller` mutated a tenant-2 employee via `PUT /employees/:id` (verified live). Also confirmed as effective writes: a resident login **created** a `worker_specializations` row (#13) and **modified** a ticket's GTD metadata (#16).

**Also:** `scripts/sandbox-reset.sh` now evicts open connections before `DROP DATABASE` (a leftover `dev:sandbox` used to make the reset fail).

**Not run:** `scripts/check-i18n-coverage.js` — no resident-facing UI or resident-visible enum was touched.

**Next:** owner decides (a) whether to fix the history-writer gap and how, (b) whether to build the 3 missing consolidation constraints, (c) which known-gaps to close first — each flips to FIXED with no test changes.

---

## SESSION 2026-07-19e — Billing Phase 1b: per-bed formula + compensation pass-through (deployed + live-verified)

Built the confirmed per-bed billing formula into the engine + the compensation→invoice line + lekötetlen on the profit dashboard.

**mig 141:** `client_night_rates` gains `per_bed_night` basis (`rate_used`, `rate_empty`, `occupancy_floor_pct`, `contracted_beds`); `accommodation_billings.compensation_amount`.

**Per-bed engine** (`computePerBed`, day-driven over the whole month so the contracted block bills even on low/zero-occupancy days): `full = max(occupied, ceil(capacity×floor_pct))`, `reduced = max(0, capacity−full)`, `net/day = full×rate_used + reduced×rate_empty`. capacity = `contracted_beds` (lekötött, per megbízó×szállás) else the accommodation's physical beds (Σ `accommodation_rooms.beds`). Degenerates to per-occupied-bed when floor=0 & empty=0. One basis per group/month.

**Compensation pass-through:** approved damage claims billed to the worker's **megbízó** (via `compensation_residents.resident_id → employees.user_id → billing_client_id`) as a SEPARATE line (`compensation_amount`), kept OUT of housing net/margin. Billable statuses = **issued, notified, partial_paid, escalated** (owner-confirmed; **disputed EXCLUDED** — only bill once resolved; draft/waived/worker-settled excluded). Attribution month = `issued_date`. Unresolvable comps (no megbízó / no matching housing group) surfaced in the run summary (`unattached_compensations`), never dropped.

**Profit dashboard "lekötetlen":** per accommodation — physical beds, committed beds, **uncommitted = physical − committed** (rent paid, no megbízó), empty bed-nights (billed vacancy), compensation column + summary totals.

**Admin:** rate form "Ágy / éj (lekötött blokk)" basis + 4 fields (floor entered as %); profit table **Lekötetlen ágy** + **Kártérítés** columns.

**Verified:** owner worked examples exact — cap100/3500/1500/floor90 → 95=340000, 80=330000, 92=334000/night; **Autoliv 60 beds @ 90% floor, 40 occ → 198000/night** (billed at the 54 floor). Unit 17, CI jest `billingPerBed.test.js` 6/6, full-engine integration 12/12 (net 5.94M + VAT + 50k comp separate + profit lekötetlen), regression `billingProfileMatrix`/`OptionC` 14/14 (per_person/flat unchanged).

**Deploy:** commit `43435abc`, CI green (1434 passed), mig 141 applied to prod via psql, backend+admin recreated + healthy. Live-verified: all 3 new engine/profit SQL paths run clean against prod schema (0 rows now — real numbers appear once beds + megbízók + per-bed rates are populated). **Bills real per-bed numbers once the owner enters bed counts (116 rooms @ 0), megbízó-on-employee, and per-bed rates.** Phase 2 = progressive tiered pricing (Autoliv, when signed).

---

## SESSION 2026-07-19d — Full billing model settled: Phase 1a contractor_roles (deployed + live-verified)

Owner **reversed** the earlier "Option A" (accommodation-derived client) after I surfaced the semantic conflict: `accommodations.current_contractor_id` is the **SZÁLLÁSADÓ** (landlord we pay rent → COST), NOT the billing client. Settled model is **per-employee MEGBÍZÓ** (`employees.billing_client_id` → REVENUE). Reverted the uncommitted Option-A engine/coverage edits (back to `billing_client_id`). Produced a full read-only inventory + phased plan; owner approved **Phase 1a** (role foundation + data-entry enablers; no engine change — that's 1b).

**Three roles** (`contractor_roles` junction, mig 140, multi-tag): **megbízó** (client we invoice), **szállásadó** (landlord we pay), **alvállalkozó** (subcontractor). Backfilled from **actual usage** (accommodation partner → szállásadó; night rate / billing_client_id → megbízó), never the unreliable `contractors.type`.

**Business rule:** megbízó ⊕ szállásadó **mutually exclusive** (revenue vs cost); alvállalkozó independent. Enforced in `createContractor` + `PUT /contractors/:id/roles` (400 + HU msg); admin toggles auto-clear the opposite.

**Backend:** roles aggregated into contractor list/detail; `?role=` filter (powers pickers); `PUT /contractors/:id/roles` replace-set. **Admin:** role chips + toggle editor on Contractors; **"Ingatlan tulajdonos" → "Szállásadó"** (picker `role=szallasado`); Employees bulk **"Számlázási ügyfél" → "Megbízó"** (picker `role=megbizo`).

**Sandbox** (`seed_sandbox_billing.js` topology): role backfill + multi-role, exclusivity reject/allow, fix-procedure — **18/18 harness tests pass**; admin build + backend syntax clean.

**Prod conflict fixed (reported before/after):** mig 140 backfill flagged **Házi Anikó = megbízó+szállásadó** (the only conflict). She's Bük's landlord — removed her megbízó role + **deleted the artifact `client_night_rates` row** (Bük, 2500/night, from the old "tulajdonos" mislabel) → now **szállásadó-only**, 0 conflicts. Historical Bük billings = **0.00** (engine keys off `billing_client_id`, never set) → no financial impact. **Barcza Gyuláné** (megbízó-only via a Sarród I. rate, property_owner-typed, not linked as any accommodation's szállásadó) flagged as a **likely same-class mislabel** — left for owner to resolve, not auto-guessed.

**⚠ Coverage gap flagged:** **Bük now has NO megbízó** (31 workers, 0 with `billing_client_id`) — owner must set who actually pays for Bük's workers.

**Deploy:** commit `b964a786`, CI green (1 flaky inspections-auth 401, passed on re-run), images built, `pull && up -d` backend+admin healthy. Prod verified: exact controller SQL runs clean, roles correct, 0 conflicts. **Next: Phase 1b** (per-bed formula rate_used/rate_empty/occupancy_floor_pct/contracted_beds + compensation→invoice line) — needs bed counts + megbízó populated to test.

---

## SESSION 2026-07-19c — Per-client billing package Phase 1 (addresses audit #10, deployed + live-verified)

Goal: occupancy billing produced **$0** because `client_night_rates` was unconfigured (deep-audit #10). Built a proper, owner-set per-client billing model so real invoices bill real gross. Design co-shaped with the owner over three rounds; **Phase 2 (six-line utilities matrix) deferred**.

**Model (migs 138 + 139, applied to prod via psql):**
- `client_night_rates`: `billing_basis` (per_person|flat), `flat_amount`, `vat_rate`, **`vat_exempt`**; `accommodation_billings`: `vat_amount`, `gross_amount`, **`payroll_handoff`**.
- **`client_billing_profiles`** (per client): `invoicing_enabled`, `legal_type` (company|private), `vat_exemption_reason` (alanyi|targyi).

**Engine** (per client × accommodation × day): per_person = `rate × person-nights`; **flat = `Σ per covered day of flat_amount/days_in_month`** (prorated by occupied days — full only when fully covered, headcount-independent); VAT taxable → `gross = net×(1+vat_rate)`, **áfamentes → 0 VAT, gross = net**; **invoicing off → client skipped** (no billing row, `skipped_clients`); **legal_type private → `payroll_handoff=true` + "Bérszámfejtendő magánszemély" marker, NEVER computes net/tax/deduction** (standing no-payroll-engine rule). `total_amount` stays **NET** so profit/margin exclude VAT + pass-throughs (profit dashboard reconciles under all combos).

**Backend:** rate CRUD (basis/flat/VAT/exempt + validation), per-client profile CRUD, coverage endpoint (missing profile / no-billing-client / no-rate; intentional skips shown separately). **Admin `/billing-rates`** extended (no new screen): profile editor (invoicing/legal-type/exemption, "bérszámfejtendő" chip), basis/VAT/exempt/flat rate form, coverage panel, run result → **Nettó / ÁFA / Bruttó** + payroll chip.

**Worked example (flat proration, hand-verified):** flat 900 000/hó, 15/30 covered → daily 30 000 → net 450 000 → ÁFA 121 500 → bruttó 571 500.

**Test (CI):** `tests/integration/billingProfileMatrix.test.js` — full matrix (company/private × taxable/exempt × flat/per_person × invoicing on/off) + profit reconciliation. **7/7**, green in CI. Existing `billingEngineOptionC.test.js` still green (net revenue unchanged).

**Deploy:** committed `7f8eeab6`, CI green, migs 138+139 applied to prod via psql, backend+admin recreated + healthy. **Live-verified:** `/billing/profiles` (5 clients, profiles unset=defaults), `/billing/rate-coverage?month=2026-07` → surfaces the **real gap: 10 accommodations with workers lacking `billing_client_id`** (would bill $0). Audit doc #10 → "tooling shipped" (now a data-entry task). **Phase 2 (six-line utilities matrix, per-line split expenses) inert until built** (mig-138 utilities flag stays default we_pay).

**Owner's remaining data entry to actually bill:** set `billing_client_id` per worker (bulk tool exists), set each client's profile, enter rates. The coverage view flags what's missing per month.

---

## SESSION 2026-07-19b — Fixed 2 high-severity function bugs from the deep audit (profit-rent #5, consolidation-workplace #9)

**#5 Profit dashboard omitted rent (deployed `0e0717f2`, live-verified).** `profit.service.getByAccommodation` computed `profit = income − expenses`, ignoring the accommodation rent the billing engine treats as the primary cost → badly overstated profit (a −240k loss shown as +80k/100%). Now: `rent = SUM(accommodation_billings.cost_amount) − operating expenses` (the engine's rent allocation, clamped ≥0 + COALESCE for legacy 0-cost rows), and `profit = income − (expenses + rent) = income − cost_amount` — which **reconciles EXACTLY with the billing engine's `margin_amount`**. Added `rent`/`total_rent` to the API + a "Bérleti díj" card/column in Billing Tab 4. `profit.script.js` +4 reconciliation cases (rent = cost−expenses; profit = income−(expenses+rent); profit == engine margin; summary totals) — 20/20 green. **Live:** API returns `total_rent`; 2026-07 total_profit (0) == engine margin (0).

**#9 Consolidation ignored workplace (deployed `0e0717f2`, live-verified).** The engine never read `workplace` and merged different employers (Mercedes+Audi) into rooms. Now workplace is a HARD constraint like gender/shift: cohort key = (gender × shift × workplace); `groupValid` rejects mixed workplace; an employee missing shift OR workplace is "incomplete" → pinned + flagged, never auto-placed (renamed `flagged_unknown_shift` → `flagged_incomplete` across engine/admin/tests); `assertAccommodationsValid` checks workplace among placeable residents. Seed: demo employees now share one workplace so the cohort is consolidatable. Constraint-proof test extended — **cross-workplace BLOCKED, empty-workplace flagged, and "NO mixed-WORKPLACE room" asserted on every suggestion of a full run** — suite ALL PASS. **Live:** POST /consolidation/run executed (0 moves as expected — prod shift 0/288), log shows the new "missing shift or workplace" flagging (285 flagged).

**Deploy:** 2 commits, CI green, backend + admin recreated + healthy, both live-verified. Audit doc rows 5 + 9 marked FIXED. Remaining open audit findings: 6-8 (staff cross-tenant IDOR, caveated), 10 (billing revenue = client_night_rates unconfigured), 11-20 (reports/perms medium-low).

---

## SESSION 2026-07-19 — Deep functional audit + fix of 4 resident-reachable data leaks (deployed, live-verified)

**Deep audit** (`docs/DEEP_AUDIT_2026-07.md`, committed `605a856b`): exercised every live feature against the sandbox with the real service code, hand-checked outputs. 28 findings. Highlights — **PASS:** billing pro-rata + same-day-transfer + expense allocation (controlled 3-employee + mid-month A→B transfer, numbers matched); expiry/hygiene/GDPR triggers all fire + idempotent; reports (tickets/occupancy/cost_centers) correct; no date-shift bug. **BUGS:** profit dashboard omits rent → shows a −240k loss-making accommodation as +80k/100% profit; consolidation doesn't enforce the workplace hard-constraint (merged Mercedes+Audi etc.); billing revenue = client_night_rates (0 usable on prod → $0 billed, margin −740,890); reports employees Email/Telefon from wrong source; **4 CONFIRMED resident-reachable data leaks.**

**Fix round (this session, `087c7308`) — ONLY the 4 leaks (findings 1-4):**
- `GET /compensations`(+`/:id`,`/:id/pdf`), `/fines/salary-deductions` + `/fines/compensations/:id/residents`, `/invoice-drafts`(+`/stats`,`/:id`, + the ungated upload/update/re-ocr writes), `/analytics/pulse/*` — all had only `authenticateToken`. Added `checkPermission('settings.edit')` (compensations/fines/invoice-drafts) / `checkPermission('wellbeing.admin.view')` (pulse) → residents (0 perms) get 403; superadmin bypasses.
- **Tenant scoping (server-side, superadmin bypass, mirrors `getTickets`):** compensations + fines scope by the accommodation's `current_contractor_id`; invoice-drafts by `contractor_id`; pulse uses `req.user.contractorId` and only honours a client `?contractorId` for a superadmin (fixes the tenant-id trust bug — finding 4).
- **Regression test** `tests/residentLeakGuards.test.js` (32 cases): resident→403 on all 14 endpoints, superadmin→not-403, scope passed to the query is the server-side contractor id. Cross-tenant "no foreign rows" proven against the sandbox (A-operator sees only A's compensation; getById on B's → null; superadmin sees both). All 4 adjacent auth suites still green (129 tests).
- **Safe on prod:** all prod `settings.edit` holders are superadmin (bypass scoping) → live staff unaffected; pulse is empty + has no frontend caller.
- **Deployed + LIVE-VERIFIED with a real resident JWT** (minted in-container from the prod JWT_SECRET for an actual `accommodated_employee` user): `/compensations`, `/fines/salary-deductions`, `/invoice-drafts`, `/analytics/pulse/export?contractorId=…` all → **403**; superadmin token → **200** on the same. Audit doc rows 1-4 marked FIXED.

**Not fixed this round (per instruction):** findings 5-28 remain open — notably the profit-rent bug (#5), staff cross-tenant IDOR #6-8 (caveated: only live if client-scoped staff accounts exist), consolidation workplace (#9), billing revenue data gap (#10). Owner to prioritize.

---

## SESSION 2026-07-13c — Gap-audit fix round (A1 + A3 fixed & deployed; room-linker built, awaiting approval)

Acting on `docs/GAP_AUDIT_2026-07.md`. Sandbox-tested → deployed → verified live.

**A1 — consolidation page 500 FIXED.** Root cause: migration **132 was the ONLY missing one** — 133–135 never existed on `main` (sandbox-branch-only, never merged), and the deployed engine references nothing from them. Applied **mig 132 to prod via psql**; `consolidation_config` (seeded with the identity 3-shift matrix) + `consolidation_runs` now exist; the page's read queries return cleanly (were `relation does not exist`). Consolidation still data-starved (see room-linker).

**A3 — Slack page 500 FIXED.** `column u.name does not exist` — **three** queries joined `u.name` (users has `first_name`/`last_name`): `slack.controller.getSlackUsers`, `slack/slackBot.service`, `nlp/sentimentAnalysis.service` — all changed to `NULLIF(TRIM(first_name||' '||last_name),'')`. Regression test `tests/slackUsers.test.js` (exercises the real controller query). Deployed (backend recreated) + query verified live on prod. CI green (full jest). *(Slack still has no bot token — unconfigured, but no longer errors.)*

**Room-linker built + dry-run (awaiting owner approval before write).** `scripts/link-room-ids.js` (self-contained, own pg pool, runs inside the prod container). Matches `employees.room_number` text → `accommodation_rooms` per accommodation, creates missing rooms (**beds=0**, flagged — `beds` is NOT NULL so 0 is the "enter real count" sentinel), sets `employees.room_id`; per-accommodation match/miss report; DRY-RUN default, `--execute` to write. Sandbox-tested (existing→original room, missing→new beds=0 room, all linked). **Prod DRY-RUN → EXECUTED 2026-07-13 (owner approved):** 287 employees linked — **33 to existing rooms, 254 via 116 NEW rooms (beds=0)**; 0 already-linked, 0 without accommodation. Post-verify: `room_id` 0→**287/288**, `accommodation_rooms` 24→**140** (116 beds=0 + 24 real). Single transaction. Caveat: consolidation still needs **bed counts** (116 flagged rooms) + `shift_schedule` before it produces useful suggestions. **Fill-in sheet exported** for managers: `uploads/reports/agyszam-kitoltendo-2026-07-13.xlsx` (one sheet per accommodation, `Szoba` + empty `Ágyak száma`; 9 sheets / 116 rooms), also copied to `~/hr-erp/` on the prod host for scp retrieval. Ad-hoc scripts removed from the container; sandbox reset (test scenario cleared).

**Item 4 (SMTP + ops webhook) — deferred:** awaiting owner-provided values; then wire + restart + send one test report email + one test Slack alert.

**Deploy:** commits `cbc3d1c7` (A3 + linker), mig 132 psql-applied to prod. Backend recreated + healthy; A1/A3 verified live. Audit doc A1/A3/C3 marked resolved, B1 annotated.

---

## SESSION 2026-07-13b — Three-shift operating model (shift_schedule) + same-shift-only consolidation (deployed)

**Correction before data entry starts:** the real operation runs THREE shifts, not day/night. Replaced the `shift_schedule` value set **everywhere**: `day/night/rotating/flexible` → **`delelott` (délelőttös) · `delutan` (délutános) · `ejszaka` (éjszakás) · `valtott` (váltott)**. "flexible" removed.

**Prod data report (BEFORE migrating, as asked):** all **288** employees had `shift_schedule = NULL`; **ZERO** rows used any legacy value (no `flexible` anywhere). So the data remap was a genuine no-op on prod (the applied migration logged `UPDATE 0` ×3). Field re-verified NULL/288 after deploy.

**Migration (137, deployed to prod via psql + dev + sandbox):** discovers & drops mig 130's CHECK, maps any legacy data (night→ejszaka, rotating→valtott, day/flexible→NULL — dev/fresh only), adds the new CHECK, updates the COMMENT, and — guarded on table existence — re-aligns `consolidation_config.shift_compatibility` to the identity matrix (prod has no `consolidation_config`, so the guard skipped it there). mig 132's default JSONB also updated for fresh sandbox resets. Prod now shows `employees_shift_schedule_check = (delelott|delutan|ejszaka|valtott)`.

**Consolidation engine — SAME SHIFT ONLY + empty=incompatible.** Matrix is now identity (every cross-shift pairing incompatible). A **null/empty shift is incompatible with everyone (incl. other empties)**: such employees are **pinned, their room locked, and FLAGGED for data entry in the run summary — never auto-placed or moved** (this reverses the old "null → flexible → compatible-with-all" behavior). Cohorts are strictly single-shift (dropped the flexible-merge). `assertAccommodationsValid` checks gender+capacity on all rooms, shift only among known-shift residents. `generateRun` surfaces `flagged_unknown_shift[]` + count; the admin ConsolidationEngine page shows the flagged count + a "fill their shift, then re-run" warning.

**Everywhere else updated:** employee bulk-Excel normalizer + "Műszak" template labels (Délelőttös/Délutános/Éjszakás/Váltott; legacy day/flexible → NULL); EmployeeDetailModal dropdown + detail; ConsolidationEngine label map; sandbox seed (three shifts + ~12% empty-shift edge cases + **2 deterministic consolidation-demo accommodations** giving a clean same-shift merge + a flagged empty-shift resident).

**Tests (manual `.script.js`; NOT in CI's jest set):** `consolidationEngine.script.js` reworked — matrix + `groupValid` incl. empty-incompatible, **deterministic scenarios (same-shift consolidates / cross-shift blocked / empty-shift flagged-not-moved)**, full run→reject→approve — **30/30 green** on a fresh sandbox (run: 4 moves, frees 4 rooms/8 beds, 33 empty-shift flagged). `employeeShiftSchedule.script.js` + `roomAssignmentRoundTrip.script.js` updated to new slugs — all green (against dev, after applying 137 there). **CI full jest green** (no jest test references shifts). Admin build clean.

**i18n:** shift labels are **staff-admin-only hardcoded Hungarian**, not part of the resident 5-locale system — there are **no resident-facing shift enums** to translate, so nothing in the locale JSONs changed. (The resident i18n guard covers ticket category/status/priority, not shifts.)

**Deploy:** merged to main, CI green (both images), **mig 137 applied to prod via psql**, backend + admin pulled + recreated (both healthy). Prod field still 288 NULL — the three-shift model is live and ready for data entry.

---

## SESSION 2026-07-13 — Prod rate-limit incident: legit admin traffic throttled (fix deployed)

**Incident.** The owner was 429'd ("Túl sok kérés ebből a címből… 15 percet") doing NORMAL admin work — not failed logins. **Root cause:** the **global per-IP limiter** (`app.use('/api/', globalLimiter)`, in-memory MemoryStore) was **env-overridden to `RATE_LIMIT_MAX_REQUESTS=200`** /15min and counts *successful* requests, applied to ALL authenticated admin traffic. Data-heavy admin pages fan out per load (**Billing ~20, GTDDashboard ~15, Invoices ~12** calls) and two endpoints are polled continuously by the admin shell (`/tasks/my/stats`, `/notification-center/unread-count`), so ~10–15 page views exhausted the 200 budget and the next click 429'd. The generous `authenticatedLimiter` (per-user) existed but was **never mounted**. The strict `authLimiter` was already correctly scoped (only `POST /auth/login`, 10 FAILED/15min) — *not* the culprit. **Log evidence** (persistent `/app/logs/combined-2026-07-13.log`): **27 × 429 today, all from one IP `145.236.147.180`** (owner), from 18:46, spread across the whole admin surface (tasks, notifications, wellmind admin, rooms, fines, compensations) — confirming broad navigation + pollers, not a single page and not an attack.

**Immediate relief (in-memory store).** Raised the prod env cap 200→20000 and `docker compose up -d backend` (recreate → counters reset + new cap) — owner unblocked within minutes, before any code change.

**Fix (`01c0034e`, deployed + verified live).**
- **globalLimiter is now a coarse per-IP ANTI-DoS ceiling only:** sane generous default **1000→5000**/15min per IP, env-tunable; prod `.env.production` override set 200→**5000** (permanent, aligned with the code default). It still caps a genuine flood.
- **Mounted `authenticatedLimiter`** (10000/hr **PER USER**, env-tunable `RATE_LIMIT_AUTHENTICATED_MAX`) in `authenticateToken`'s success path, keyed by user id → authenticated traffic is bounded per-account; **shared-NAT accommodations are never throttled by their neighbours** (matches the same shared-WiFi principle as the login limiter).
- **authLimiter unchanged** — still strict (10 FAILED/15min), still login-only; brute force still blocked, successful logins never counted.
- **Loud logging:** 429s now log `[RATE-LIMIT] 429 blocked` with the limiter name + `authenticated` flag + userId (greppable in `/app/logs/combined-*.log`) so a legit-use hit is unmistakable next time; every block still returns a clear Hungarian message.

**Regression tests (`tests/rateLimiter.enforcement.test.js`, 8 new, load the limiter in prod mode with small env caps):** normal admin under the cap is never blocked; global flood + per-user overflow + login brute-force all 429 with the correct Hungarian message; **per-user keying proven independent of IP**; successful logins never consume the auth budget. Sibling `rateLimiter.test.js` (test-env passthrough) still green; auth-flow suites (`damageReportAuthz`, `wellbeingPermissions`, `csrf`, `passwordPolicy` — 137 tests) pass with the `authenticateToken` delegation.

**Deploy:** merged to main, CI green (full jest), backend image pulled + recreated on prod. Live startup log confirms **Global 5000/15min per IP · Auth 10 FAILED/15min (login only) · Authenticated 10000/hr per user**; site 200; zero 429s since. **Note for ops/root-cause:** winston info/warn go to the **persistent** `/app/logs/combined-YYYY-MM-DD.log` volume (NOT `docker logs`, which only shows Sentry) — grep `[RATE-LIMIT]` there.

**Still open (not blocking):** offsite Storage Box unprovisioned (owner action; click-path + backup pubkey delivered this session); `BACKUP_ENCRYPTION_KEY` shown to the owner for their password manager → **key-rotation queued** for right after the first offsite push is verified.

---

## SESSION 2026-07-06 — Stabilization round: prod hardening + housekeeping

**1. Offsite backup (P0-1 — the main gap).** Found the offsite mechanism already *built* in `backup.sh` (rsync-to-Storage-Box gated on `backup.env`) but the Storage Box **not provisioned** (`STORAGEBOX_HOST/USER` empty; every nightly run logged "offsite SKIPPED"). Enhanced `deploy/backup.sh` (+ deployed to prod `~/hr-erp/backup.sh`, old backed up): **encryption at rest** (openssl AES-256-CBC/PBKDF2 → `backups/offsite/*.enc`, produced whenever `BACKUP_ENCRYPTION_KEY` is set); offsite push carries **encrypted artifacts ONLY** (rsync `--include='*.enc'`, `--delete` mirror, `RETENTION_DAYS=30`); **failure alerting** via a `trap ERR` + explicit rsync-fail branch → `OPS_ALERT_WEBHOOK` (`alert()` matches the backend `alertOps` Slack format). Generated `BACKUP_ENCRYPTION_KEY` on the VM (appended to `backup.env`; not echoed). Caught + fixed a bug in testing (openssl reads the passphrase from the **environment** → must `export BACKUP_ENCRYPTION_KEY`; the trap correctly fired the alert on that failure). **Verified restore** from the encrypted copy into a throwaway DB: decrypt OK → `pg_restore rc=0, 0 errors` → users=7 / employees=288 / compensations=2 intact; uploads `.enc` decrypted + listed 19 real files; scratch DB dropped. `docs/BACKUP_RESTORE.md` documents local + offsite restore, the **DR key-storage warning** (store `BACKUP_ENCRYPTION_KEY` off-server), and the **Storage Box provisioning steps + the backup pubkey**. **Cannot provision the Storage Box myself** (paid Hetzner-console action) — that + filling 2 env values is the one remaining owner step to close offsite; everything else is turnkey.

**2. public/locales Vite fix → main.** Cherry-picked (re-applied) the consolidation-branch fix: `git mv hr-erp-admin/public/locales → src/i18n/locales` + repointed the 5 imports in `src/i18n/index.js` (Vite 5 refuses to import `public/` assets → dev 503 → blank page). Verified: local dev `/login` renders (rootLen 4167, no blank). Admin build clean.

**3. FUTURE ROADMAP — Digital HR services** added to PROJECT_STATE (approved direction, not in scope): **Phase A** employee self-service / digital onboarding / HR KPI dashboards (reuse signature capture, docs module, chatbot/FAQ, `entity_status_history`); **Phase B** payroll via **integration** with a HU payroll product/bureau — *never* build the calc engine (v1 file export/import, v2 API; candidates XL BÉR / Abacus / infotéka / Deltha; open decision bureau-partner vs in-house-licence); **Phase C** public partner API + **RLS tenant-isolation hardening as a required gate** before any external SaaS.

**4. Housekeeping + health check.** **Gmail poller:** prod had `GMAIL_POLLING_ENABLED=true` → the dormant universal poller ran every 5 min and spammed `invalid_grant`; set it `false` in `.env.production` (+ backup) and recreated the backend → poller no longer scheduled. **invoice_drafts:** the "5 stale pending (2026-04-21)" no longer exist — all 7 are `status='converted'` on prod (already entered into `accommodation_expenses`); nothing to archive (doc updated). **Health check:** all 5 containers healthy; hygiene toggle `enabled=false`; `DEDUCTION_EXECUTION_ENABLED` unset (mothballed); crons present (backup 02:30 / disk-alert hourly / image-prune weekly); disk 12% (8.4/75 GB); last backup local-OK.

**Deploy:** merged to main, CI green, admin pulled + recreated (locale fix live). backup.sh + Gmail-poller-off + encryption key are server-side ops changes (applied directly on prod, verified). Tech-debt updated (Gmail poller / invoice_drafts resolved; offsite-backup caveat rewritten). Docs: PROJECT_STATE (roadmap + decisions unaffected), SESSION_LOG, new `docs/BACKUP_RESTORE.md`.

---

## SESSION 2026-07-05i — Room-hygiene house-rule fine, independent toggle (MAIN → prod, default OFF)

Refinement of the deduction-mothball decision. **Key discovery:** the "2 consecutive failing hygiene inspections → 10,000 Ft fine" rule the task assumed existed **did NOT exist** — exhaustive search found only the fine *types* (`HOUSE_RULES`/`CLEANING_NEGLECT`, both 10,000 Ft) + a **manual** `POST /fines` flow; `runAutoConversions` (which the deduction flag gates) is deduction-conversion, not hygiene fines. So the deduction flag was NOT gating any hygiene path. Confirmed with the user, then **built it net-new**.

**Built (mig 136 + `hygieneFine.service.js`):** `hygiene_fine_config` singleton (enabled / consecutive_fails=2 / fail_hygiene_max=15 / fine_amount=10000 / fine_type_code=HOUSE_RULES; admin-editable, read fresh; **default OFF**). The scan finds rooms whose latest N COMPLETED inspections all have `hygiene_score ≤ fail_hygiene_max`, and creates ONE fine per room via the existing `createFine` (idempotent, keyed to latest inspection+room; residents from `room_inspections.residents_snapshot`, else current room employees). Wired into `inspectionAutomation.runDaily` gated by **its own** `hygiene_fine_config.enabled` — **independent** of `DEDUCTION_EXECUTION_ENABLED`. Creates the debt record + the existing in-app resident notification only — **NO `compensation_payments`, NO salary_deduction**; payable via the existing cash path or forwarded (payment-plan-as-info). `createFine` gained an optional `amountOverride`. New endpoints `GET/PUT /hygiene-fine/config` + `POST /hygiene-fine/run` (settings.edit). Admin page under Ingatlan Ellenőrzés → "Házirend-bírság" (toggle + amount + consecutive-count + threshold + Futtatás most).

**Verified params (as requested):** threshold-count = `consecutive_fails` (default 2), amount = `fine_amount` (default 10,000/resident), "failed" = a room_inspection with `hygiene_score ≤ fail_hygiene_max` (default 15) — all configurable next to the toggle.

**Tests (`tests/hygieneFine.script.js`, 14/14, idempotent/self-cleaning):** toggle OFF → 0 fines; ON → exactly one HOUSE_RULES fine (10,000 × residents) on the latest inspection; ZERO `compensation_payments` + ZERO `salary_deductions`; re-run creates 0 (idempotent); cash on-site payment works (writes cash `compensation_payments`, no deduction); a single failing inspection → no fine. No regressions (deduction mothball guard 7/7, fines/damage suites green). Admin `npm run build` clean (new page bundled).

**Sandbox HTTP demo:** seeded 2 consecutive failing inspections (hygiene 8 ≤ 15) for a 6-resident room → `POST /hygiene-fine/run` → fine **`BIR-2026-0003`, HOUSE_RULES, 60,000 Ft, issued**; idempotent re-run created 0. (Local admin *browser* demo was blocked by a pre-existing **main-only** blank-page bug — the `public/locales` Vite dev-import 503, fixed only on the unmerged consolidation branch; dev-server only, prod build + prod unaffected. Feature verified via tests + HTTP + prod build.)

**Deploy:** merged to main, CI green, **mig 136 applied to prod via psql**, backend+admin pulled + recreated. Toggle **default OFF** → no prod behavior change until an admin enables it.

---

## SESSION 2026-07-05h — Deduction-execution mothballed (MAIN → prod deploy)

Based on **main** (independent of the consolidation branch). **Decision (recorded in the decisions log):** legally we only PRODUCE the damage jegyzőkönyv; the client's payroll executes deductions. Our deduction-EXECUTION engine is **mothballed reversibly**, not demolished — behind a new feature flag `DEDUCTION_EXECUTION_ENABLED` (default OFF) in `src/config/deductionExecution.js`, with a documented re-enable path for a future EOR model.

**Disabled when OFF (prod default):**
- `POST /fines/payroll/run` (the LIVE manual trigger), `POST /compensations/:id/salary-deduction` (scheduleDeduction), `POST /fines/residents/:id/convert-to-deduction` → all return **403** with a clear Hungarian message (gated in the controllers, before any service/DB call).
- The **daily auto-conversion** — `inspectionAutomation.runDaily()` → `fineSvc.runAutoConversions()` — which auto-created new salary_deductions for overdue damage compensations (this was **live**, not the dry-run cron): now skipped when the flag is off.
- The **monthly payroll cron** (`server.js`, was DRY-RUN): now only scheduled when the flag is on (then runs LIVE); otherwise logs "💤 MOTHBALLED".

**Kept fully working (not gated):** on-site/cash repayments (`recordOnSite`/`recordPayment`), `compensation_payments` for cash, payment-history reads (compensation/DebtCollection PDF), GDPR anonymization of existing `salary_deductions` rows, and the jegyzőkönyv PDF exactly as-is in all 5 locales including the `payment_plan` section. Existing `salary_deductions` rows are untouched history. The service engine (processMonthlyDeductions / convertToSalaryDeduction / scheduleSalaryDeduction / runAutoConversions) is left intact + callable so the EOR re-enable is env-only.

**UI:** run-payroll button+dialog (SalaryDeductionsList → now read-only "előzmény") and the schedule/convert controls (CompensationDetail) hidden behind a mirrored client const `DEDUCTION_EXECUTION_ENABLED = false`. The read-only Bérlevonások history/tab, cash-payment recording, and payment_plan info entry stay.

**Tests:** new no-DB mothball guard `tests/deductionExecutionMothball.test.js` (7/7 — 403 when off + engine not called, passes gate when on, cash never gated). Sandbox regression (DB_NAME=hr_erp_sandbox): fines 22, damageReportPdf + damageReport + damageReportAuthz + inspectionWorkflow.e2e 47, compensations green — all pass (deduction engine still works when called directly). Pre-existing unrelated failure: `inspections.test.js:78` (inspection-create status) fails identically on clean main (stash-verified) — not caused by this change. Admin `npm run build` clean.

**Sandbox HTTP verification:** the 3 endpoints → 403 `deduction_execution_disabled` (HU message); cash on-site-payment → 404 "Lakó nem található" (NOT gated); `GET /fines/salary-deductions` → 200; startup log "💤 Monthly payroll cron MOTHBALLED". **Then deployed to prod (backend + admin) per HETZNER_DEPLOY.** Re-enable for EOR = set env `DEDUCTION_EXECUTION_ENABLED=true` + flip the two UI consts; no migration.

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
