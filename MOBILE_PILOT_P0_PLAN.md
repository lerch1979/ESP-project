# MOBILE PILOT — P0 EXECUTION PLAN (text-only, 10 tenants)

**Created:** 2026-06-09
**Goal:** 10 real Ukrainian tenants can **log in** and **report an issue (text)** from their phones. Photo deferred to phase 2.
**Status:** PLAN ONLY — nothing built. Awaiting approval. Companion to `MOBILE_APP_STATE.md`.

---

## Ordering (fastest path to unblock the pilot)

P0-1 and P0-2 are the **hard blockers** and are independent — run them **in parallel**. P0-3 is a soft blocker (UX for a Ukrainian audience). P0-4 is polish.

| Order | P0 | Hard blocker? | Effort | Can start | Depends on |
|---|---|---|---|---|---|
| 1 (parallel) | **P0-1 Seed resident accounts** | YES (no accounts → no login) | ~0.5d | now | nothing |
| 1 (parallel) | **P0-2 Reachable backend URL** | YES (unreachable → nothing works on a phone) | 0.5–2d | now | hosting choice |
| 2 | **P0-3 Ukrainian on core screens** | Soft (works in HU, but bad UX for UA tenants) | ~0.5–1d | after P0-1 (needs `preferred_language='uk'`) | P0-1 |
| 3 | **P0-4 Role-based nav** | No (polish) | ~1d | anytime | nothing |

**Critical-path estimate:** P0-2 dominates. Scrappy bridge (reserved-domain ngrok): ~2–3 days total. Robust (Hetzner): ~3–5 days.

---

## P0-1 — Seed resident accounts

### Your question: generic test users, or real accounts? → **Real accounts, via a targeted script. Do NOT run the full `seed.js`.**

**Why not `seed.js`:** it's idempotent but it *inserts demo business data* into whatever DB it touches — a fake `ABC Kereskedelmi Kft.` contractor, 5 demo invoices, 6 demo tickets, 3 projects, 10 tasks, cost centers, salary bands. Your current DB already holds **real billing data** (accommodation_expenses, accountant share links, VAT). Running the full seed mixes fake invoices/tickets into that. Keep the seed for a throwaway dev DB only.

### The seed's user structure (the part worth reusing) — `seed.js:46–85`
```js
const passwordHash = await bcrypt.hash('password123', 10);          // bcrypt cost 10
// per user:
INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, phone, is_active)
  VALUES ($cid, $email, $hash, $fn, $ln, $phone, true) ON CONFLICT (email) DO NOTHING;
INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES (...) ON CONFLICT DO NOTHING;
```
- **Resident role = `accommodated_employee`** ("Szállásolt Munkavállaló") — confirmed present in `roles`. (`user` is a generic role; use `accommodated_employee` for housed workers.)
- `users.email` is **globally unique** (`users_email_key`) AND unique per contractor. `password_hash` NOT NULL. `preferred_language` defaults `'hu'` — **set it to `'uk'`** for these tenants so the app auto-switches on login (`AuthContext` → `setLanguageFromProfile`).
- Reference data already exists to attach tenants to: **4 contractors, 16 accommodations, 4 priorities, 12 ticket statuses, 32 ticket categories.** No need to create any of it.

### ⚠️ Identity decision (needs your input before writing the script)
Login is **email + password**. Arriving blue-collar tenants often have no work email. Pick one:
- **(A) Synthetic emails** — e.g. `vlad.kovalenko@tenant.hs.hu`, per-tenant simple password printed on a welcome card. Simplest; works with current login as-is. **Recommended.**
- **(B) Phone-based login** — requires a small backend change (login by phone). Out of scope for a scrappy pilot.
- Password policy: there's a lockout (`failed_login_attempts` / `locked_until`) — use a memorable per-tenant password, not something fat-finger-prone; document the reset path (admin or re-seed).

### Exact steps
1. Collect the 10 tenants: first name, last name, phone, which **contractor** they belong to, which **accommodation** they live in.
2. Decide identity scheme (A/B above).
3. Write `hr-erp-backend/scripts/seed-pilot-tenants.js` (modeled on `seed.js:68–85`):
   - Input: an array/CSV of the 10 tenants.
   - For each: INSERT user (`preferred_language='uk'`, `is_active=true`) + `user_roles` row with `accommodated_employee`.
   - **Optional (for "see my room"):** insert the accommodation-assignment row linking user → accommodation. *(Verify the assignment table name first; not required for the text-only login+report goal.)*
4. Run: `DATABASE_URL=… node scripts/seed-pilot-tenants.js` against the **pilot** DB (see P0-2 re: which DB).
5. Verify:
   - `select count(*) from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where r.slug='accommodated_employee';` → 10
   - `curl -X POST $API/auth/login -d '{"email":"…","password":"…"}'` → 200 + token for one tenant.

**Effort:** ~0.5 day (mostly collecting the 10 real tenants' data + one careful script).
**Risk:** LOW. Pitfalls: email-uniqueness collisions (synthetic scheme must be unique); accidentally running full `seed.js` (don't); forgetting `preferred_language='uk'` (breaks P0-3's auto-switch).

---

## P0-2 — Reachable backend URL

### Current state
- `hr-erp-mobile/.env`: `EXPO_PUBLIC_API_URL=https://blinker-bronze-evasion.ngrok-free.dev/api/v1` (**dead** free tunnel).
- `api.js:11` hardcodes the **same dead URL** as `FALLBACK_URL` — so even a missing `.env` lands on a dead host.
- Good news: **CORS won't block the native app** — `server.js` allows requests with no `Origin` header (native fetch sends none); the allowlist only matters for web. And `docker-compose.yml`, backend `Dockerfile`, and `start-all.sh` already exist.

### Options
| Option | Robustness | Cost | Setup | Verdict |
|---|---|---|---|---|
| **LAN IP** (192.168.x) | ❌ same-wifi only | free | mins | **Reject** — tenants are on mobile data / different networks |
| **Reserved-domain ngrok** (paid) | ⚠️ laptop must stay on, home ISP | ~$10–20/mo | ~1h | **Bridge only** — fine for a 48h smoke test |
| **Hetzner VPS + Docker** | ✅ real uptime, survives laptop off | ~€4–8/mo | ~1–2d | **Recommended for the real pilot** |

### Recommended: Hetzner VPS (with ngrok as a same-day bridge if needed)
**Exact steps (Hetzner):**
1. Provision Hetzner CX22 (Ubuntu 22.04, Docker). ~€5/mo.
2. DNS: point a subdomain (e.g. `api.housingsolutions.hu`) A-record → VPS IP.
3. **DB decision:** the pilot needs your real **16 accommodations** so tenants map to real rooms → **restore a `pg_dump` of the current `hr_erp_db`** onto the VPS Postgres (don't start empty). Then run the P0-1 tenant script there.
4. Bring up backend via `docker-compose.yml`; set backend `.env`: production `DATABASE_URL`, fresh `JWT`/refresh secrets, `NODE_ENV=production`, `CORS_ORIGIN` (admin origin if web admin is also hosted).
5. TLS: put Caddy/Traefik (or nginx + certbot) in front for `https://` + Let's Encrypt. *(Check whether `docker-compose.yml` already includes a reverse proxy; if not, add one.)*
6. Mobile: set `EXPO_PUBLIC_API_URL=https://api.housingsolutions.hu/api/v1` in `.env` **and** update/remove the `FALLBACK_URL` in `api.js:11` so it never points at a dead host again.
7. Verify: `curl https://api…/api/v1/health` (or any public route) → 200; tenant login from a phone on mobile data → success.

**Bridge (same-day, optional):** paid ngrok reserved domain → `ngrok http 3001` on the laptop; set both `.env` and `api.js` fallback to it; restart backend. Buys time while the VPS is set up.

**Effort:** 0.5d (ngrok bridge) / 1–2d (Hetzner incl. DB restore + TLS).
**Risk:** MEDIUM. Pitfalls: losing real billing data (use dump/restore, snapshot first); TLS misconfig; secrets in `.env` on the VPS (don't commit); laptop dependency if you stop at the ngrok bridge.

---

## P0-3 — Ukrainian on the core resident screens

### Current state (good bones, not connected)
- i18n engine ready (`i18next`), `uk.json` is a **complete 139-key Cyrillic translation**, language switcher exists in `ProfileScreen`, and `AuthContext` already calls `setLanguageFromProfile(user.preferred_language)` on login + rehydration. So **once a tenant has `preferred_language='uk'` (set in P0-1), everything that uses `t()` switches automatically after login.**
- The gap: resident screens hardcode Hungarian and don't call `t()`. Only ~2 files use `useTranslation()`.

### Exact steps
1. **Verify key coverage** — confirm `uk.json` (and `hu/en/tl/de`) have keys for every string on: `LoginScreen`, `DashboardScreen`, `TicketListScreen`, `TicketDetailScreen`, `CreateTicketScreen`, `NotificationsScreen`. Add any missing keys to **all 5** locale files (missing keys fall back to `hu` gracefully).
2. **Wire `t()`** into those 6 screens: add `const { t } = useTranslation();` and replace hardcoded literals (incl. `Alert.alert(...)` strings like `'Hiba'`, `'Nem sikerült…'`).
3. **Login-screen language problem:** `preferred_language` is unknown *before* login, and i18n defaults to `hu` with **no device detector**. So the login screen renders Hungarian for everyone. Fix one of:
   - **(Recommended)** add a small 2–3-flag language toggle on `LoginScreen` (HU / UK / EN) that calls `i18n.changeLanguage`; or
   - enable `expo-localization` device-locale detection to set initial `lng`.
4. Verify: set a test tenant to `uk`, log in → Dashboard/Tickets/Notifications render Ukrainian; the report-issue form is Ukrainian.

**Effort:** ~4–8 hours (½–1 day). ~15–40 strings across 6 screens + login toggle + any missing keys.
**Risk:** LOW. Pitfalls: missed `Alert`/placeholder strings; forgetting the login-screen toggle (tenants hit a Hungarian login first).

---

## P0-4 — Role-based navigation (hide staff screens from tenants)

### Current state
- `AppNavigator` only checks `user` truthy. `MainTabNavigator` hardcodes 5 tabs (Dashboard, Tickets, Wellbeing, Employees, More); `More` exposes ~30 entries.
- **Role IS available:** the login response includes `user.roleSlugs` (and `roles`), stored in `AuthContext`. So gating is straightforward.

### Exact steps
1. In `MainTabNavigator`: `const { user } = useAuth(); const isResident = (user?.roleSlugs||[]).some(r => ['accommodated_employee','user'].includes(r));`
2. Render a **reduced tab set** for residents — e.g. **Tickets, Wellbeing, More** (hide **Employees**; keep Dashboard only if it's tenant-relevant).
3. Filter `MoreStackNavigator`'s menu (`MoreMenuScreen`) by role: residents see Profile, My accommodation, Notifications, Documents, FAQ/Chatbot — hide Invoices, Projects, staff CarePath/admin, Gamification-admin, etc.
4. **Verify `getMe()` returns `roleSlugs`** (the rehydration path in `AuthContext.loadStoredAuth` calls `authAPI.getMe()`); if it doesn't include role slugs, add them to the `/auth/me` response so gating survives an app restart.
5. Verify: log in as a tenant → only resident tabs/menu items show; staff screens unreachable.

**Effort:** ~1 day (tab gating ~2–3h; More-menu filtering ~3–5h; verify getMe shape).
**Risk:** LOW–MEDIUM. Pitfalls: a hidden tab's screen still reached via programmatic `navigate()`; `getMe()` omitting `roleSlugs` (gating breaks on restart).

---

## Pilot acceptance checklist (definition of done)
- [ ] 10 `accommodated_employee` accounts exist, `preferred_language='uk'`, each can log in (verified by curl + on a real device).
- [ ] Backend reachable over HTTPS from a phone on mobile data; `.env` + `api.js` fallback both point at it (no dead ngrok).
- [ ] A tenant can create a **text** ticket and see its status update.
- [ ] Login + dashboard + ticket + notification screens render Ukrainian for a `uk` tenant.
- [ ] A tenant does not see staff-only screens.
- [ ] (Deferred to phase 2: photo attachment, push notifications.)

## Out of scope (phase 2+, from `MOBILE_APP_STATE.md`)
- Photo-on-ticket (backend upload route + mobile picker — parts already exist).
- Push notifications (currently a complete stub).
- "See my room" accommodation assignment, if not seeded in P0-1.
