# SESSION HANDOFF LOG

Newest entries first. Each session is one block. Append, do not edit history.

For long-running context (architecture, dormant systems, overlaps) see `PROJECT_STATE.md`.

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
