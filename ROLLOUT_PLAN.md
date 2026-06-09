# ROLLOUT_PLAN.md — Full-workforce mobile rollout (286 users)

**Created:** 2026-06-09 · **Status:** PLAN ONLY — nothing built, awaiting execution approval.
**Decisions locked:** (1) Identity = **QR-token + PIN**; (2) Hosting = **Hetzner `docker-compose`** (not k8s); (3) Platform = **Android-first** (pending HR device survey); (4) Languages = **HR data-gathering required**.
**Companions:** `MOBILE_APP_STATE.md` (assessment + rationale). Supersedes `MOBILE_PILOT_P0_PLAN.md`.

---

## 🚨 Two facts that gate everything

- **Contractor data gap (HARD BLOCKER for accounts):** of 16 accommodations, **only `Bük` has `current_contractor_id` set.** Account-gen derives each worker's tenant from `accommodation.current_contractor_id` and **fails loud** on null. With today's data it would fail for **~255 of 286** workers. → **HR/ops must backfill `current_contractor_id` for the other 15 sites (Phase 0).**
- **Pilot site = `Bük` (31 workers):** it's the **only** site where account-gen works *today* (contractor set), and a manageable single-site size. Smallest sites for reference: Fertőd 4, Sarród II. 12, Sarród I. 18. (1 employee has **no** accommodation — handle as an exception.)

## Parallel tracks & dependency map

| Track | Phases | Start | Notes |
|---|---|---|---|
| **B — HR / data** | Phase 0 | **Day 1** | Longest lead (HR latency). Feeds Phases 2, 4, 5. Start first. |
| **A — Ops / infra** | Phase 1 | Day 1 (∥ with B) | Independent. Prod DB gates Phase 2 *execute* + Phase 4 *final build*. |
| **C — App code** | Phases 2 (script+backend) & 3 | Day 1 (∥) | Code dev independent; Phase 2 *execute* gated on B(contractors/emails/langs)+A(prod DB). |
| **D — Distribution** | Phase 4 | **Day 1 (∥) — start early** | Store review = long pole; final build needs prod URL (A). |
| **— Rollout** | Phase 5 | After 1–4 | Needs everything; pilot site from B. |

**Blocks-summary:** Phase 0 ⟶ blocks Phase 2 (execute), Phase 4 (platform), Phase 5 (pilot). Phase 1 ⟶ blocks Phase 2 (execute), Phase 4 (final build). Phases 2/3/4 *development* run in parallel from Day 1. Phase 5 needs 1+2+3+4 all done.

**Timeline:** engineering ≈ **~1.5–2 weeks**; end-to-end to 286 live ≈ **~6–10 calendar weeks**, dominated by HR data + store review + waved on-site onboarding — not code.

---

## PHASE 0 — Data gathering (Track B · HR action items)
**Effort:** ~0.5d eng to prep templates; **~1–2 weeks calendar** waiting on HR. **Depends on:** nothing. **Blocks:** Phase 2 execute, Phase 4 platform choice, Phase 5 pilot. **Parallel:** with Phases 1, 3, 4-setup.

Spell-out for HR (deliver as one shared spreadsheet, one row per active employee, keyed by `employee_number`):

- [ ] **0.1 — Contractor per accommodation (HARD BLOCKER).** For all **15** accommodations missing it, supply the operating contractor so `accommodations.current_contractor_id` can be set. *(Only `Bük` is set today.)* Without this, accounts can't be generated outside Bük.
- [ ] **0.2 — Per-worker language** — one of `HU / UK / TL (Tagalog) / DE / EN` (or "other → specify") for each of the 286. *(DB has none; `tl` locale implies a Filipino cohort — confirm the real cohort list.)*
- [ ] **0.3 — Email corrections** — confirm/repair the **1 duplicate** email (2 employees share one) and the **1 missing** email. Flag any others HR knows are stale/shared. Decide per exception: real email vs synthetic (`firstname.lastname@workforce.local`).
- [ ] **0.4 — Phone numbers for the 60 missing** (`personal_phone` null) — needed for SMS fallback / reset, not for QR login itself.
- [ ] **0.5 — Device survey** — Android vs iOS count (and rough OS age) across the workforce. Drives Phase 4 (confirm Android-first; decide if/when iOS).
- [ ] **0.6 — Confirm pilot site** — recommend **Bük (31, contractor ready)**; alternatively a smaller site (e.g. Sarród II. 12) *after* its contractor is set in 0.1.

**Risk:** HIGH on schedule — HR data is the critical-path input and is slow. Mitigate: send the template Day 1, chase weekly; let Phase 1/3/4 proceed meanwhile.

---

## PHASE 1 — Hosting foundation (Track A · Hetzner docker-compose)
**Effort:** ~2–4d eng. **Depends on:** nothing (a Hetzner account + domain). **Blocks:** Phase 2 execute, Phase 4 final build, Phase 5. **Parallel:** with Phases 0, 3, 4-setup.

Ordered steps:
- [ ] **1.1** Provision Hetzner CX22/CPX21 (Ubuntu 22.04 + Docker + Compose). Enable provider **backups/snapshots**.
- [ ] **1.2** DNS: `api.<domain>` → VPS IP (+ `admin.<domain>` if hosting the SPA). TTL low during cutover.
- [ ] **1.3** **Snapshot first**, then `pg_dump` the current `hr_erp_db` and restore onto the VPS Postgres (real 16 accommodations + billing data must come along). *(`docker-compose.yml` defines `postgres:15` on 5432, `redis:7` on 6379, `backend` on 3001, `admin` 5173→80.)*
- [ ] **1.4** Backend `.env` on the VPS: prod `DATABASE_URL` (→ `postgres` service), `REDIS_URL` (→ `redis`), **fresh** `JWT`/refresh secrets, `NODE_ENV=production`, `CORS_ORIGIN`=admin origin. Keep secrets off git.
- [ ] **1.5** Bring up the stack (pull prebuilt **ghcr.io** images that CI already publishes on `main`, or `docker compose build`). Confirm `backend` reaches `postgres` + `redis`.
- [ ] **1.6** Run migrations: `npm run db:migrate` (= `node src/database/migrate.js run`). **Do NOT run `db:seed`** (injects demo data).
- [ ] **1.7** TLS reverse proxy (Caddy/Traefik + Let's Encrypt) in front of backend (+admin). Verify `https://api.<domain>/...` → 200.
- [ ] **1.8** **Nightly backups**: DB dump **+ `uploads/expenses/`** (open tech-debt — local FS storage) to off-box storage. Test a restore.
- [ ] **1.9** Basic monitoring/uptime alert on the API health route.

**Risk:** MEDIUM — data migration (don't lose billing data → snapshot + verify row counts), TLS/secrets hygiene, single-VPS = no HA (acceptable at 286).

---

## PHASE 2 — Account generation (Track C · the risky one)
**Effort:** ~2–3d eng (script + QR/PIN backend). **Depends on:** *development* none; ***execute*** needs Phase 1 (prod DB) **+** Phase 0.1 (contractors) / 0.2 (langs) / 0.3 (emails). **Blocks:** Phase 5. **Parallel:** dev runs alongside Phases 1, 3, 4.

### 2A — QR-token + PIN onboarding (backend + mobile additions)
- [ ] **2.1** Migration: `user_onboarding_tokens` (`id, user_id, token UNIQUE, expires_at, consumed_at, created_at`). Tokens are **single-use, expiring, revocable** bearer credentials (printed on cards → treat like passwords).
- [ ] **2.2** `POST /api/v1/auth/onboard/:token` (no auth): validate token (unconsumed + unexpired) → return the bound identity + a short-lived grant to set a PIN.
- [ ] **2.3** PIN model: store the chosen PIN as the user's **`password_hash`** (bcrypt) so the **existing email+password login path works unchanged** — the *app* holds the email in SecureStore and only ever asks the human for the PIN. (Avoids a parallel auth path.)
- [ ] **2.4** Mobile deep-link: handle **`hrerp://onboard/<token>`** (`expo-linking` already installed; scheme `hrerp` confirmed in `app.json`) → Onboarding screen → set PIN → persist email+token outcome in SecureStore → subsequent launches = PIN-only.
- [ ] **2.5** Reset path: endpoint/admin action to **re-issue an onboarding token** (for lockouts / forgotten PIN / new device).

### 2B — generate-workforce-accounts.js
- [ ] **2.6** Source: `employees WHERE end_date IS NULL` (286).
- [ ] **2.7** **Contractor derivation (CRITICAL):** `JOIN accommodations a ON a.id = e.accommodation_id`, take `a.current_contractor_id`. **If null → record an ERROR and SKIP that employee. NO blind default.** Wrong contractor = **cross-tenant data leak**. Emit the skip list.
- [ ] **2.8** For each valid employee: insert `users` (email=`personal_email`, names, `phone`=`personal_phone`, `is_active=true`, `preferred_language` from Phase 0.2), set a placeholder hash, link `user_roles` → **`accommodated_employee`**, set `employees.user_id`, and create a `user_onboarding_token`.
- [ ] **2.9** Exceptions handled explicitly: the **1 duplicate email**, the **1 missing email**, the **1 employee with no accommodation** → flagged, not silently dropped.
- [ ] **2.10** Idempotent (`ON CONFLICT DO NOTHING`); **dry-run mode** default.

### 2C — Dry-run → review → execute
- [ ] **2.11** Dry-run → emit **CSV**: `employee_number, name, accommodation, derived_contractor, email, language, token, STATUS(ok/skip-reason)`.
- [ ] **2.12** **Human review** the CSV — especially every `derived_contractor` and every `skip`. Reconcile skips with HR (usually a missing contractor from 0.1).
- [ ] **2.13** Execute against **prod** DB. Verify: `accommodated_employee` user count == expected; **two workers under different contractors cannot see each other's data** (isolation smoke test); a sample onboarding token completes end-to-end (token → PIN → login).

**Risk:** MEDIUM-HIGH — (a) contractor mis-derivation → data-isolation breach (mitigated by fail-loud + CSV review + isolation test); (b) stale emails; (c) token cards are bearer creds (expiry + single-use + revoke).

---

## PHASE 3 — App readiness (Track C · code, parallelizable)
**Effort:** ~1.5–2d eng. **Depends on:** Phase 0.2 only for final language verification. **Blocks:** Phase 5 (app must be resident-correct before build). **Parallel:** with Phases 1, 2, 4.

- [ ] **3.1** Wire `t()` into the **6 core resident screens**: `LoginScreen`, `DashboardScreen`, `TicketListScreen`, `TicketDetailScreen`, `CreateTicketScreen`, `NotificationsScreen` — including `Alert.alert(...)` strings. (Engine + `uk.json` already complete.)
- [ ] **3.2** **Login-screen language toggle** (HU/UK/TL/EN) — needed because language is unknown pre-login and there's no device detector. (Or enable `expo-localization`.)
- [ ] **3.3** Verify `uk` + `tl` key coverage for those screens; add any missing keys to **all 5** locale files.
- [ ] **3.4** **Role-based nav:** gate `MainTabNavigator` + filter the ~30-item `MoreMenuScreen` on `accommodated_employee` (`user.roleSlugs`); residents see e.g. Tickets / Wellbeing / More(trimmed); hide Employees + staff screens. Ensure hidden screens aren't reachable via programmatic `navigate()`.
- [ ] **3.5** **Confirm `/auth/me` returns `roleSlugs`.** Login *does* (`auth.controller.js:138`); the `me` handler (`:236`) must too, or gating breaks on app restart (rehydration calls `getMe()`). Add if missing.
- [ ] **3.6** Point app at prod: set `EXPO_PUBLIC_API_URL=https://api.<domain>/api/v1` **and** replace the dead `api.js:11` `FALLBACK_URL`.

**Risk:** LOW–MEDIUM — missed hardcoded strings; `getMe` omitting `roleSlugs`; orphaned navigations to hidden screens.

---

## PHASE 4 — Distribution (Track D · long pole — START EARLY)
**Effort:** ~1–2d eng; **~3–7d calendar** (store review dominates); +more if iOS. **Depends on:** Phase 0.5 (platform), Phase 1 (prod URL for final build), Phase 3 (resident-correct app for the *shipping* build). **Setup can start Day 1.** **Blocks:** Phase 5.

- [ ] **4.1** Set up EAS (Expo Application Services) build + signing for the project. *(Do this Day 1 — independent of code.)*
- [ ] **4.2** **Android-first** signed build (AAB/APK) once Phase 3 + 3.6 land.
- [ ] **4.3** **Delivery decision:** Google **Play closed/production track** (trusted + auto-update; needs Play Console + listing + **review latency**) **vs** **direct APK** via download link/QR (fastest; "unknown sources" friction + manual updates). Recommend Play closed track for a captive workforce; APK as fallback for old/no-Play devices.
- [ ] **4.4** iOS: only if Phase 0.5 warrants → App Store/TestFlight (review + users install via TestFlight). Defer if Android-dominant.
- [ ] **4.5** Verify a **cold install + onboarding (QR→PIN)→login** on a real Android device on **mobile data**.

**Risk:** MEDIUM-HIGH — store review delays (submit early), Android fragmentation/old devices, sideload friction, update distribution.

---

## PHASE 5 — Waved rollout (needs Phases 1–4)
**Effort:** pilot ~1 week; full waves ~2–4 weeks calendar (logistics). **Depends on:** ALL prior. **Pilot site:** Bük (per Phase 0.6).

- [ ] **5.1** **Onboarding kit:** per-worker **multilingual welcome card** (HU/UK/TL) with **two QR codes** — *install* (Play/APK) + *login* (`hrerp://onboard/<token>`) — plus a one-page pictographic install guide.
- [ ] **5.2** **PIN-reset path + named support owner** decided and documented (who fixes "I can't log in" for 286 people; how a token is re-issued; lockout handling).
- [ ] **5.3** **Pilot ONE accommodation — Bük (31):** on-site **install day** with a helper + **language champions** per cohort (UA/HU/Tagalog). Hand out cards against the name list.
- [ ] **5.4** **Pilot success criteria (gate to next wave):** ≥ target % activated (recommend **≥70% logged in within 1 week**); ≥1 real ticket created by a worker; reset path exercised at least once; friction list captured + fixed.
- [ ] **5.5** **Waved rollout** of the remaining 15 sites (smallest→largest, or by readiness), one wave at a time, each with on-site help; **don't start a wave until the prior one clears 5.4**.
- [ ] **5.6** Track activation per accommodation; then schedule **phase-2 features** (photo-on-ticket, push notifications) once base adoption holds.

**Risk:** HIGH — adoption/onboarding is where rollouts stall: low uptake, login failures at scale, language gaps, device issues, support overload. Mitigate via QR-no-typing, on-site waves + champions, a real reason to open the app, manager endorsement.

---

## Definition of done (286 live)
- [ ] All 15 missing accommodation→contractor links backfilled (0.1).
- [ ] ~286 `accommodated_employee` accounts generated, contractor-correct, isolation-verified (2.13).
- [ ] Prod backend on Hetzner over HTTPS, nightly backups incl. `uploads/` (Phase 1).
- [ ] Resident app: Ukrainian/Tagalog render, login toggle works, only resident screens visible, points at prod (Phase 3).
- [ ] Android app distributed + cold-install onboarding verified (Phase 4).
- [ ] Bük pilot cleared success criteria; remaining sites rolled in waves (Phase 5).
- [ ] Support + PIN-reset path operational.
- **Deferred to phase 2:** photo-on-ticket, push notifications, iOS (if Android-first).
