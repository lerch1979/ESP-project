# MOBILE APP STATE — Resident-facing readiness assessment

**Created:** 2026-06-09
**Scope:** `hr-erp-mobile/` (Expo) — the resident/tenant-facing app. **Assessment only — nothing was built or changed.**
**Method:** static code audit + live DB queries (`hr_erp_db`) + dependency inspection. The app was **not** run (`expo start` not executed), so runtime claims are inferred from code/config and flagged where they can't be confirmed without a live boot.
**Target question:** *"10 tenants can log in and report an issue."* — honest estimate at the bottom.

> 🔄 **SCOPE CHANGED (2026-06-09):** the real goal is **full-workforce production rollout to all 286 employees**, not a 10-person pilot. The §1–§5 assessment below still holds, but the execution plan is superseded by **"FULL-WORKFORCE ROLLOUT PLAN (286 users)"** at the bottom of this file. `MOBILE_PILOT_P0_PLAN.md` (10-person framing) is now historical.

---

## TL;DR

The **app code is in better shape than the data and the ops around it.** Login, accommodation, ticket status, and the in-app notification inbox are all wired end-to-end. The blockers to a real pilot are, in order: **(1) there are zero resident accounts in the database** (the "toth.anna login fails" bug is a *seeding* problem, not a code bug, and it hits **every** resident), **(2) the app points at a dead ngrok tunnel**, **(3) photo-on-ticket is not wired** (though the pieces exist), **(4) push notifications are a complete stub**, and **(5) Ukrainian is translated but not actually shown** on resident screens. None of these are deep code rewrites; the heavy lift is ops (hosting + distribution), not the app.

---

## 1. Does it build & start? — ✅ PROBABLY YES (clean), one runtime caveat

| Check | Result |
|---|---|
| Expo SDK / RN / React | 54.0.33 / 0.81.5 / 19.1.0 — installed versions **match** package.json, mutually compatible |
| `node_modules` | present (463 pkgs), `expo` resolves, `package-lock.json` present |
| Entry chain | `index.js → App.js → AppNavigator → Login \| MainTabNavigator` — clean |
| Assets / plugins | icon/splash/adaptive all present; plugins (`expo-secure-store`, `expo-web-browser`) installed |
| Screens | ~53 screens across 6 stack navigators + 5-tab main navigator |

**Verdict:** `expo start` should bundle and launch to the Login screen cleanly. **Not runtime-verified** (per "no building"). The one caveat is the API URL (see §3) — the app *starts* fine; the first network call is what fails.

---

## 2. The auth bug — ROOT CAUSE FOUND ✅ (and it's worse than "one user")

**`toth.anna@abc-kft.hu` fails because the account does not exist in the database.** Verified directly:

```
users in hr_erp_db: 5 total — ALL internal/admin staff:
  admin@hr-erp.com, fulop.eszter87@gmail.com, lerchbalazs@gmail.com,
  housingsolutionsszamlazas@gmail.com, timcsilak@gmail.com
users matching 'toth.anna': 0
resident/tenant-role users (role 'user' / 'accommodated_employee' / 'employee'): 0
```

- The login **code is correct.** `auth.controller.js` looks up by lower-cased email, has **no role gate** (residents are *not* blocked), checks `is_active` + contractor-active, then `bcrypt.compare` against `password_hash`. Mobile posts `{email,password}` to `/auth/login` — field names and route prefix match. bcrypt mechanism verified sound (`password123` vs a fresh hash → `true`).
- The failure happens at the **user-not-found → 401** branch. `toth.anna` (and `password123`) **are defined in `src/database/seed.js`** (file exists, 20 KB) — **the seed was never run against this DB.**

**Scope: SYSTEMIC, not user-specific.** Every demo/resident credential fails identically because **no resident accounts exist at all.** This is a **data/seeding problem, not a code defect.**

> Fix direction (not applied): run `seed.js` against `hr_erp_db`, or create real tenant accounts via the admin app. Once accounts exist, login should work as-is.

---

## 3. Resident journey — what works end-to-end TODAY

Backend route mounts and mobile screens both verified. Login analysis from §2 applies (works *once accounts exist*).

| # | Step | Mobile screen | Endpoint | Verdict |
|---|---|---|---|---|
| 1 | **Login** | `LoginScreen.js` | `POST /auth/login` | ✅ Code works — **blocked only by missing accounts (§2)** |
| 2 | **See my room / accommodation** | `more/AccommodationListScreen.js`, `AccommodationDetailScreen.js` | `GET /accommodations`, `/accommodations/:id` | ✅ Wired |
| 3 | **Report issue WITH photo** | `tickets/CreateTicketScreen.js` | `POST /tickets` | ⚠️ **Text-only works; photo NOT wired** (see below) |
| 4 | **Ticket status** | `tickets/TicketListScreen.js`, `TicketDetailScreen.js` | `GET /tickets`, `/tickets/:id`, `PATCH …/status`, comments | ✅ Wired |
| 5 | **Notifications (in-app inbox)** | `NotificationsScreen.js` | `GET /notification-center`, mark-read | ✅ Wired (in-app fetch only; push is separate — §5) |

**The photo nuance (matters for the estimate):** "report an issue" as **text works today.** Photo does **not**, but the building blocks already exist:
- ✅ `ticket_attachments` table exists (`file_path, file_name, mime_type, ticket_id, comment_id, uploaded_by`).
- ✅ `ticket.controller.js` already **reads & returns** attachments in `getTicketById`.
- ✅ `multer` is a backend dependency; the expense system already has a pluggable storage adapter.
- ✅ `expo-image-picker` / `-image-manipulator` / `-file-system` are installed and there's a **proven working upload pattern** in `employees/DocumentScanScreen.js` (`employeesAPI.uploadDocument` → image/PDF over the wire).
- ❌ **Missing:** no `POST /tickets/:id/attachments` (or create-with-file) route + multer handler on the backend; `CreateTicketScreen.js` has **no** picker/FormData (grep: zero `image|photo|upload|attach` references).

So photo-on-ticket is a **wire-up of existing parts**, not greenfield.

**Navigation caveat:** there is **no role-based navigation** — every logged-in user sees all 5 tabs and ~30 screens (Employees, Invoices, WellMind, CarePath, Gamification, etc.). Data is gated server-side by `checkPermission`, but a resident sees admin/staff-oriented menu items they can't meaningfully use. Not a blocker for "log in + report issue," but a rough UX for a tenant pilot.

---

## 4. Ukrainian — translated but NOT shown ⚠️

- ✅ i18n is real: `i18next` + `react-i18next`, init at `src/i18n/index.js`, 5 locales (`hu/en/tl/uk/de`).
- ✅ `uk.json` is a **complete, authentic** Ukrainian translation — 139 keys (full parity with hu/en), genuine Cyrillic ("Головна", "Заявки", "Увійти", "Щоденний пульс").
- ✅ Language switcher exists in `ProfileScreen.js` (5 languages w/ flags), persists to storage + backend; `users.preferred_language` column exists.
- ❌ **But almost no screen uses `t()`.** Only ~2 files call `useTranslation()`. Resident-facing screens — **Login, Dashboard, Tickets, CreateTicket, Notifications** — have **hardcoded Hungarian strings** ("Nem sikerült betölteni…", "Nincs értesítés", etc.).

**Verdict: PARTIAL — Profile/Settings renders Ukrainian; the actual resident journey renders Hungarian.** A Ukrainian tenant would hit a Hungarian login, dashboard, and ticket flow. The translation file is done; the **screens were never wired to it.**

---

## 5. Push notifications — STUB ❌

- ❌ `expo-notifications` is **not installed** and **not** in `app.json` plugins. **Zero** permission requests, **zero** push-token registration (`getExpoPushTokenAsync`) anywhere in mobile.
- ❌ Backend has no Expo/FCM/APNs send call. `wellbeing_notifications` rows are created with `channel='push'` and then `processNotificationQueue()` just sets `status='sent'` — **no HTTP call to any push service.**
- ✅ The **in-app inbox** (`/notification-center`) does work — fetch + mark-read.

**Verdict: push is a complete stub.** "Notifications" exist only as an in-app list the user must open the app to see. No device push of any kind.

---

## WORKS / BROKEN / MISSING

**✅ Works today (code-wise):**
- App builds/launches (clean deps, no version mismatch) — not runtime-verified
- Login flow (code) — *pending accounts*
- See accommodation (list + detail)
- Create ticket (text), view tickets, change status, comment
- In-app notification inbox
- i18n engine + complete Ukrainian translation file + language switcher

**⚠️ Broken / blocked:**
- **All resident logins** — no resident accounts seeded (§2)
- **API base URL** — hardcoded to a **dead** ngrok tunnel (`blinker-bronze-evasion.ngrok-free.dev`) in `.env` *and* as the fallback in `api.js:11-20`. Login will hang/error until pointed at a live backend.
- **Photo on ticket** — not wired (parts exist, §3)
- **Ukrainian rendering** — resident screens hardcoded Hungarian (§4)

**❌ Missing entirely:**
- Push notifications (no client lib, no token, no server send) (§5)
- Role-based resident navigation (tenant sees all staff screens) (§3)
- Any distributable build / install path for real tenants (runs via Expo dev only)

---

## P0 FIX LIST (to reach "10 tenants log in + report an issue")

| P0 | Item | Where | Est. |
|---|---|---|---|
| **P0-1** | **Create resident accounts** — run `seed.js` (demo) or create 10 real tenants via admin UI; assign role + contractor + accommodation. | DB / admin | 0.5d |
| **P0-2** | **Point app at a reachable backend** — stand up a stable URL (deployed host, or a stable/paid tunnel) and set `EXPO_PUBLIC_API_URL`; remove the dead ngrok fallback. **A laptop + free ngrok is not viable for 10 real users.** | ops + `.env`/`api.js` | 0.5–3d* |
| **P0-3** | **Distribution path** — how do 10 tenants install/run it? Expo Go + dev URL (scrappy) **or** EAS build → TestFlight/Play internal/APK (proper). | ops | 0.5–3d* |
| **P0-4** | **Wire photo into ticket creation** — backend `POST /tickets/:id/attachments` (multer → `ticket_attachments`, storage adapter); mobile picker + FormData in `CreateTicketScreen` (copy `DocumentScanScreen` pattern). *Optional if "report issue" = text-only.* | BE + mobile | 1–2d |
| **P0-5** | **Smoke-test the real resident path** end-to-end on a device against the live backend; fix surprises (CORS, auth on device, contractor-access middleware for tenant role). | QA | 0.5–1d |

\* The wide ranges on P0-2/P0-3 are the real story: **the app code is mostly ready; the gap is operations** (hosting + how tenants install). These dominate the timeline.

**P1 (pilot quality, not strictly blocking):**
- Wire resident screens to `t()` so Ukrainian (and Tagalog/German) actually render — translation files are already done. ~1–2d for the core journey.
- Role-based navigation so tenants don't see staff screens. ~1d.
- Push notifications (add `expo-notifications`, register token, store it, send via Expo API on ticket-status change). ~2–4d — defer past first pilot.

---

## HONEST DAYS-ESTIMATE → "10 tenants can log in and report an issue"

Stated as ranges with the assumption that dominates each.

**Track A — scrappy pilot (text-only issue, Expo Go + stable tunnel):**
- P0-1 accounts (0.5) + P0-2 stable tunnel/light deploy (0.5–1) + P0-3 Expo Go distribution (0.5) + P0-5 smoke test (0.5–1) = **~2–3 working days.**
- Text issue-reporting already works; photo deferred.

**Track B — proper pilot (with photo, real installable build, hosted backend):**
- P0-1 (0.5) + P0-2 real hosting (2–3) + P0-3 EAS build + TestFlight/Play internal (1–3) + P0-4 photo wiring (1–2) + P0-5 device QA (1) = **~6–10 working days (~1.5–2 calendar weeks).**

**Bottom line:** If "report an issue" means **text**, a scrappy pilot is **2–3 days** away, gated almost entirely by seeding accounts and a reachable backend — not by app code. If it means **with a photo on a properly installable, hosted app**, budget **~1.5–2 weeks**, with backend hosting and app distribution (not coding) as the long poles. The infamous "auth bug" is a **30-minute seed run**, not a defect.

---

## Notes / unverified
- App was **not** booted; build/start verdict is from static analysis + dependency resolution.
- The 5 existing users show no role via the `role_id→roles` join (roles appear to be assigned through a separate `user_roles` join table) — immaterial to the finding that **0 residents exist**.
- "Dead ngrok tunnel" is inferred from the SESSION_LOG note + the URL still hardcoded; not re-pinged here.
- Backend ↔ device connectivity (CORS, `checkContractorAccess` behavior for tenant role) is untested on a real device — flagged in P0-5.

---

# FULL-WORKFORCE ROLLOUT PLAN (286 users)

**Re-scoped 2026-06-09.** Goal: roll the resident app out to the **entire workforce (~286 active employees) for live production use** — not a pilot. This is a different class of problem: the code is the *small* part. The hard parts are **account generation at scale, real app-store distribution, and onboarding logistics for blue-collar workers across 16 accommodations and multiple nationalities.**

## What the DB actually contains (verified 2026-06-09)

| Fact | Value | Implication |
|---|---|---|
| Active employees | **286** (`end_date IS NULL`) | the rollout population |
| Employees with a **user account** | **0** (`user_id` null on all) | **must generate ~286 user accounts** |
| `personal_email` present | **285 / 286** (284 distinct → **1 duplicate**, 1 missing) | email-as-identifier is viable for 285; ~2 manual fixes |
| `personal_phone` present | **226 / 286** (60 missing) | SMS/phone login can't cover everyone |
| Accommodation-mapped | **285** have `accommodation_id`, **285** have `room_number` (but `room_id` null) | "see my room" works off `accommodation_id` + `room_number` |
| `contractor_id` on employee | **null on all 286** | tenant link must be **derived from `accommodation.current_contractor_id`** (3 real contractors: Házi Anikó, Horváth Clean, Barcza Gyuláné) — ⚠️ getting this wrong = cross-tenant data leak |
| Nationality / language | **not stored** (`permanent_address_country` null on all) | language per worker is **unknown** — must be sourced from HR; `tl` locale implies a **Filipino** cohort alongside Ukrainian/Hungarian |

## What changes vs the 10-person pilot

1. **Accounts:** 286 bulk-generated from existing employee rows (not hand-seeded), with correct per-employee contractor derivation.
2. **Distribution becomes mandatory and is the long pole:** 286 production users **cannot** run via Expo Go / a dev URL. You need a **standalone EAS build distributed via the app stores** (review latency, device fragmentation).
3. **Hosting must be real production:** uptime, backups, TLS, secrets — a laptop+ngrok is disqualified.
4. **Role-based nav is now mandatory** (286 workers must not see ~30 staff screens).
5. **Onboarding logistics is the actual bottleneck** — credential delivery + install help for a multilingual blue-collar workforce.

---

## Workstream A — Account generation at scale

**State:** 286 employee records, 0 users. Login is email+password; `users.email` is globally unique; login also checks `is_active` **and** `contractor_active`.

**Identity recommendation (drives onboarding): use the on-file `personal_email` as the hidden account identifier, but onboard via a per-employee QR/token so workers never type it.**
- Email+password alone → 286 people typing a gmail address + password on a phone = mass login-failure + lockout (`failed_login_attempts`/`locked_until`) + support storm.
- Phone/SMS OTP → best UX but 60 have no phone, needs an SMS provider + backend OTP work + per-message cost. Defer to a later iteration.
- **Recommended: bulk-create accounts keyed on `personal_email`; issue each worker a one-time onboarding token rendered as a QR on a printed card → scan opens the app via deep link → worker sets a 4–6 digit PIN.** Language-agnostic, no typing, ideal for on-site handout. Requires modest backend work (onboarding-token table + endpoint + PIN auth + mobile deep-link) — but it's what makes 286 feasible.

**Steps (plan):**
1. Decide identity scheme (above). If QR/PIN: design `user_onboarding_tokens` table + `POST /auth/onboard/:token` + PIN set/verify; otherwise temp-password path.
2. Write `scripts/generate-workforce-accounts.js`:
   - Source rows from `employees WHERE end_date IS NULL`.
   - **Derive `contractor_id` from `accommodation.current_contractor_id`** (join via `accommodation_id`); fail loudly on employees whose accommodation has no contractor rather than defaulting (avoids cross-tenant leak).
   - Insert `users` (email=`personal_email`, `first_name`, `last_name`, `phone`=`personal_phone`, `is_active=true`, `preferred_language` from the HR language list — default per dominant cohort, not blind `hu`), hash a temp secret, link `user_roles` → **`accommodated_employee`**, and set `employees.user_id`.
   - Handle the **1 duplicate email** and **1 missing email** as explicit exceptions (synthetic email or skip-and-flag).
   - Idempotent (`ON CONFLICT DO NOTHING`), dry-run mode first.
3. Dry-run → review a CSV of (employee → derived contractor → email → language) **before** writing. Spot-check contractor derivation hard.
4. Execute against the **production** DB (Workstream B), verify counts + sample logins + that two workers under different contractors cannot see each other's data.

**Effort:** ~1–2 days (script + careful contractor derivation + dedupe + language sourcing). **Risk:** MEDIUM-HIGH — wrong contractor derivation is a **data-isolation breach**; stale/wrong emails on file; language guesses.

---

## Workstream B — Production hosting

**State:** `docker-compose.yml` (postgres, redis, backend-build, admin-build) + backend `Dockerfile` + full `k8s/` manifests exist. **CI** (`/.github/workflows/deploy.yml`): `test` → `build-and-push` (builds **backend + admin** images, pushes to **ghcr.io** on every `main` push — *this already runs*) → **`deploy` (k8s) is hard-disabled `if: false`** pending a cluster + `KUBE_CONFIG` secret.

**Recommendation: single Hetzner VPS with `docker-compose`** (right-sized for 286 users; far less ops than k8s). Treat re-enabling the k8s job as optional/future.

**Steps (compose-on-VPS, recommended):**
1. Provision Hetzner CX22/CPX21 (Ubuntu + Docker). Snapshot/backups on.
2. DNS: `api.<domain>` (+ `admin.<domain>` if hosting the SPA) → VPS IP.
3. **Restore real data:** `pg_dump` current `hr_erp_db` → restore on the VPS Postgres (you need the real 16 accommodations + billing data). **Snapshot before/after.**
4. Pull the prebuilt ghcr.io images (or `docker compose build`); bring up the stack.
5. Backend `.env`: prod `DATABASE_URL`, **fresh** JWT/refresh secrets, `NODE_ENV=production`, `CORS_ORIGIN` (admin origin), Redis URL. Keep secrets off git.
6. TLS reverse proxy (Caddy/Traefik + Let's Encrypt) in front.
7. Run migrations, then Workstream A account-gen on the prod DB.
8. **Nightly backups** incl. `uploads/expenses/` (open tech-debt item) + DB dumps.
9. Point mobile `EXPO_PUBLIC_API_URL` + replace the dead `api.js:11` `FALLBACK_URL` at the prod URL.

**Optional — re-enable the k8s CI deploy** (only if you have/ want a cluster): stand up managed k8s (Hetzner) or k3s on a VPS; base64 the kubeconfig into the **`KUBE_CONFIG`** repo secret; in `deploy.yml` change `if: false` → `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`; review `k8s/*.yaml` (namespace, configmap, PVs, postgres, redis, backend, admin, ingress, network-policy) for prod secrets/host. More robust auto-deploy, more overhead.

**Effort:** ~2–4 days (compose-on-VPS incl. dump/restore + TLS + backups). k8s path: +3–5 days. **Risk:** MEDIUM — data migration (don't lose billing data), TLS, secret hygiene, no HA on a single VPS.

---

## Workstream C — App distribution (NEW — mandatory, the long pole)

286 production users need a **real installable app with auto-update**, not Expo Go.

**Steps (plan):**
1. **Device survey** via HR: Android/iOS split + rough OS versions. Blue-collar ⇒ expect **Android-dominant + older devices**; confirm before investing in iOS.
2. EAS Build → signed **Android App Bundle/APK** (+ iOS build only if the survey warrants).
3. Android delivery — choose:
   - **Google Play closed/production track** (trusted, auto-updates; needs a Play Console account + store listing + **review, days**), or
   - **Direct APK** via a download link/QR (fastest, but "install from unknown sources" friction + manual updates).
4. iOS (if needed): App Store/TestFlight — **review latency + users must install via TestFlight/Store**; this is the painful platform.
5. Bake the prod API URL into the build; verify cold-install login on a real device on mobile data.

**Effort:** ~3–7 days **wall-clock dominated by store review**; +several days if iOS. **Risk:** MEDIUM-HIGH — store review delays, Android version fragmentation, sideload friction, update distribution.

---

## Workstream D — Language at scale

**State:** i18n engine ready; `uk.json` complete (139 keys); `ProfileScreen` switcher; `AuthContext` auto-switches from `user.preferred_language`. **Gaps:** resident screens hardcode Hungarian (only ~2 files use `t()`); login renders before language is known (no device detector); **worker languages aren't in the DB** and the workforce is multi-cohort (HU/UK/Tagalog at least).

**Steps:** (1) source each worker's language from HR → set `preferred_language` in Workstream A; (2) wire `t()` into the 6 core screens (Login, Dashboard, TicketList, TicketDetail, CreateTicket, Notifications), incl. `Alert` strings; (3) add a **language toggle on the login screen** (HU/UK/EN/TL) or enable `expo-localization`; (4) verify `uk`/`tl` key coverage for those screens, add missing keys to all 5 locales.

**Effort:** ~0.5–1 day code + HR data-gathering for languages. **Risk:** LOW (code) / MEDIUM (getting real per-worker language data).

---

## Workstream E — Role-based navigation (mandatory)

**State:** `user.roleSlugs` is in the login response + stored in `AuthContext`; `MainTabNavigator` hardcodes 5 tabs and `More` exposes ~30 entries.

**Steps:** gate `MainTabNavigator` on `accommodated_employee` → reduced tab set (Tickets, Wellbeing, More); filter `MoreMenuScreen` to resident-relevant items; **confirm `/auth/me` returns `roleSlugs`** so gating survives app restart (rehydration calls `getMe()`); verify hidden screens aren't reachable via programmatic `navigate()`.

**Effort:** ~1 day. **Risk:** LOW-MEDIUM (getMe shape; orphaned navigations).

---

## Workstream F — Onboarding logistics (THE BOTTLENECK — process, not code)

286 blue-collar workers, **16 accommodations**, mixed nationalities/tech-literacy/devices. This dominates the timeline and determines adoption.

- **Credential delivery:** do **not** rely on workers accessing the on-file gmail. Print **per-worker multilingual welcome cards** handed out **on-site** at each accommodation: install QR (→ store/APK) + login QR/token (→ deep-link + set PIN). House manager distributes against a name list.
- **Install assistance:** schedule **on-site "install days" per accommodation** with a helper + a **language champion per cohort** (UA/HU/Tagalog). Expect 30–60 min per site of hands-on help.
- **Languages:** cards + app in HU/UK/Tagalog (confirm the full cohort list with HR; `tl` locale strongly implies Filipino workers).
- **Support + resets:** a named support channel and a **fast password/PIN-reset path** (lockout will trigger at scale). Decide who owns "I can't log in" for 286 people.
- **Phased waves:** **pilot ONE accommodation (~15–30 workers)** end-to-end → fix friction → roll the remaining 15 sites in waves. Never big-bang 286.
- **Adoption:** give a concrete reason to open the app (report issues, see room, payslips/notifications) + visible manager endorsement; track activation per accommodation. (PROJECT_STATE notes ~60% adoption is needed for the predictive-analytics value.)

**Effort:** ~2–4 days to build the kit (cards, QR, multilingual install guide, support/reset runbook) + **ongoing per-wave field time**. **Risk:** HIGH — this is where rollouts stall: low adoption, login failures, language gaps, device issues, support overload.

---

## Phasing & ordering

| Phase | Contains | Gate to next |
|---|---|---|
| **0 — Decisions & data** | identity scheme (QR/PIN vs email/pwd); HR sources **languages + corrected emails/phones**; device survey; hosting choice | decisions locked, employee data clean |
| **1 — Infra & accounts** (∥) | Workstream B (prod hosting + dump/restore + backups) **∥** Workstream A (account-gen, dry-run→verify) **∥** Workstream C kickoff (EAS build + store submission — start early for review latency) | prod backend live; 286 accounts created & verified; build in store review |
| **2 — App readiness** (∥) | Workstream D (i18n + login toggle) **∥** Workstream E (role nav); point app at prod | resident build logs in, Ukrainian/Tagalog render, only resident screens show |
| **3 — Single-accommodation pilot** | Workstream F kit + one site (~15–30 workers) end-to-end | friction list resolved; reset/support path proven |
| **4 — Waved rollout** | remaining 15 accommodations in waves, with on-site help | each wave activated |
| **5 — Adoption & iterate** | track activation, then phase-2 features (photo on ticket, push) | ≥ target adoption |

**Honest timeline:** **code work ≈ ~1.5–2 weeks** (accounts + i18n + role nav + onboarding-token flow). **End-to-end to 286 live ≈ ~6–10 calendar weeks**, dominated by **hosting hardening + app-store review + waved on-site onboarding** — not coding. Distribution (C) and onboarding (F) are the critical path; start both as early as possible.

## Top risks (ranked)
1. **Onboarding/adoption (F)** — workers don't install/log in/use it. Mitigate: on-site waves, language champions, QR-no-typing, a real reason to open it.
2. **Distribution latency (C)** — store review + device fragmentation. Mitigate: submit early, Android-first, APK fallback.
3. **Cross-tenant data leak (A)** — wrong `contractor_id` derivation. Mitigate: derive from accommodation, fail-loud, verify isolation before rollout.
4. **Login-failure storms (A/F)** — lockouts + reset burden at 286 scale. Mitigate: QR/PIN onboarding, fast reset path, support owner.
5. **Production reliability (B)** — single VPS, data migration, backups. Mitigate: snapshots, nightly backups (incl. `uploads/`), monitoring.
6. **Language coverage (D)** — multi-cohort (UA/HU/Tagalog) + no per-worker language in DB. Mitigate: source from HR, login toggle, key-coverage check.

## Decisions needed before any building
1. **Identity/onboarding scheme** — QR-token + PIN (recommended, more build) vs email + temp-password cards (faster, more login friction)?
2. **Hosting** — Hetzner `docker-compose` (recommended) vs re-enable the k8s CI deploy?
3. **Platforms** — Android-only first, or Android + iOS? (drives Workstream C) — needs the device survey.
4. **Languages** — confirm the cohort list (UA/HU/Tagalog/other?) and get per-worker language + corrected emails from HR.
