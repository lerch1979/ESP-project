# Product Backlog & Ötlettár

Two kinds of entries:
- **§1 Prioritized feature ideas (ötlettár)** — wanted, not yet built; ordered by
  priority tier. Distinct from `PROJECT_STATE.md` ("Current focus" / tech debt).
- **§2 Gated / blocked items** — deliberately NOT built until an external
  precondition (legal, compliance, design sign-off) clears.

---

# §1 — Prioritized feature ideas (ötlettár)

Priority tiers reflect the user's notes. **Record-only — do not build without an
explicit go-ahead.**

## Tier 1 — high value / quick wins (do early)

### 1. Push notifications (resident) — Tier 1, HIGH value  ✅ v1 DONE (2026-06-19)
**What:** Native push to the resident's phone for:
- a **chat reply received** (staff answered their ticket thread) — ✅ v1, shipped + verified on device,
- a **visa / contract expiry reminder** — ✅ v1, shipped + verified on device,
- an **upcoming repair / inspection** (from the calendar feed) — ⏭ **v1.1, NOT built** (see below).

**Why:** Brings the chat + calendar "to life" — the resident no longer has to
open the app to discover a reply or a due date. High engagement lever.

**v1 (DONE):** Expo push as an additive delivery channel on existing triggers —
`user_push_tokens` table, `pushNotification.service.js` (localized hu/en/uk/tl/de,
chunking, dead-token prune), `POST/DELETE /push/tokens`, wired into the ticket-
reply fanout + a resident-facing expiry alert. Mobile registers on login / taps
route to the ticket or calendar. FCM configured; verified on real hardware.

**v1.1 — upcoming repair / inspection push (deferred, keep on backlog):**
Needs a **NEW daily cron** that scans each resident's upcoming derived calendar
events (shift / inspection / ticket due_date in the next N days) and pushes —
the calendar is a pure aggregator with no events table, so there's no existing
"upcoming event" trigger to hang it on (unlike chat/expiry, which reused
existing fanout/cron). Build after the rest of the Android trio. Reuse
`inAppNotification.notify({ push: { vars } })` + a new `upcoming_event` template.

**Priority:** HIGH — do early (first of these three).

### 2. "Show password" toggle on login — Tier 1, LOW effort  ✅ scope CONFIRMED
**What (confirmed scope):** An eye-icon on the **LOGIN** screen's password field
that reveals the password **as typed** — input un-mask only (toggles
`secureTextEntry`). **NOT** stored-password recovery: passwords stay hashed and
are never retrievable; this only un-masks what the user is currently typing.

**Why:** Easier, fewer-error mobile typing — especially for non-Hungarian
residents entering an unfamiliar password.

**Feasibility:** Trivial — local UI state on the login screen, no backend.

**Priority:** Easy win — slot in anytime.

## Tier 2 — v2 / convenience (after the Tier 1 items)

### 3. Biometric login — Tier 2, v2
**What:** Fingerprint / face unlock so a returning resident skips typing the
password each session.

**Why:** Convenience; password login already works, so not urgent.

**Feasibility:** **Expo `LocalAuthentication`** — biometrics are verified
**on-device** and **never sent to us**; on success, unlock a locally-stored
session/refresh token. Depends on the standalone app (already have it).

**Priority:** v2 — after push notifications + show-password.

### 4. Profile photo (resident-set, admin-visible) — Tier 2, v2
**What:** The resident uploads their own profile picture from the app
(gallery/camera) → it uploads to the server → attaches to their **employee
record** → **admins see it** on the resident's profile in the HR-ERP admin UI.
**Two-way:** the app sets it, the admin views it.

**Why:** A humanizing touch — puts a face to each resident profile for staff.

**Notes to capture for the future build:**
- **Storage:** decide server-file (local disk on the Hetzner box) vs object
  storage — fits our self-hosted setup; investigate at build time.
- **Resize/compress on upload** — phone photos are large; downscale + compress
  before/at upload to keep storage and bandwidth sane.
- **GDPR:** a personal photo IS personal data → keep the upload **OPTIONAL** and
  **transparent** (the resident must know admins can see it). **MUST NOT** be tied
  to any face-recognition / biometric processing — it is *only* a profile
  picture. (This protects the "no biometrics" compliance positioning — same
  principle as keeping [[biometric login]] strictly on-device.)
- **Mobile:** `expo-image-picker` (gallery/camera) + multipart upload; reuse the
  existing ticket-attachment upload pattern on the server if it fits.

**Priority:** v2 — nice humanizing feature, after push + show-password.
**Status:** ✅ built 2026-06-19 (resident-set, self-scoped; admin display already existed). See the hardening item below.

## Hardening (whole-system, not feature-specific)

### 5. Auth-gate `/uploads/employees/*` photo serving
**What:** Profile photos currently serve via **public `express.static`** at
`/uploads/employees/<uuid>.jpg` (unguessable UUID filename, no auth). This is the
**existing design** — it covers BOTH admin-uploaded and resident-set photos
(resident upload deliberately kept consistent with it, not a new pattern).

**Why backlog:** moving photo serving behind an auth gate (e.g. a streamed,
permission-checked route like ticket attachments use) is a **whole-system
hardening** — it touches the **admin display** (`UPLOADS_BASE_URL + profile_photo_url`
via `<img>`, which can't send a Bearer token) and the mobile display, not just
this feature. Needs a coherent approach (signed URLs, or blob-fetch in the admin,
or cookie auth on `/uploads`). Don't bolt a one-off onto profile photos; do it
once for all employee photos.

**Priority:** hardening — schedule deliberately; security-by-obscurity (UUID
filenames) holds in the interim.

---

# §2 — Gated / blocked items

Blocked on an external gate, not just unscheduled.

## Medical events in the resident calendar — BLOCKED on DPO sign-off + DPIA

**Status:** Blocked. Do **not** build until the gate below clears.

**What it would be:** Surfacing `medical_appointment` (and any health-derived)
events in the resident-facing calendar feed (`GET /calendar/my`) and/or the
`.ics` export, the same way `checkin` / `visa_expiry` / `inspection` / `shift`
events flow today.

**Why it is gated (not "build it, maybe deactivate later"):**
Medical/health information is **GDPR Article 9 special-category data**. Merely
*displaying* it in-app means we are **processing** special-category data, which
requires:

1. A **documented legal basis** under Art. 9(2) (e.g. explicit consent, or
   another qualifying condition) — separate from the Art. 6 basis.
2. A **Data Protection Impact Assessment (DPIA)** completed and signed off,
   because large-scale processing of health data of a vulnerable population
   (accommodated workers) is high-risk under Art. 35.
3. **DPO sign-off** on both of the above.

This protects the compliance positioning that is core to the business. The
"build the capability, deactivate if unused" approach used for non-sensitive
features (e.g. shifts) **must not** be applied here — even a deactivated-by-default
code path that can read/return health data widens the processing surface and the
DPIA scope.

**Unblock criteria (all required before any code is written):**
- [ ] DPIA drafted and approved for resident-facing display of medical events.
- [ ] Art. 9(2) legal basis documented (likely explicit, revocable consent).
- [ ] DPO written sign-off recorded.

**Note:** `personal_event` is admin-created free-text and can incidentally carry
health info, so it is held to the **same gate** for resident-facing exposure and
is excluded from the resident feed for now alongside medical events. (Admins
continue to see both in the staff aggregator — that processing has its own
existing basis and is out of scope for this item.)

---

# §3 — Strategic direction: BI + AI agents (phased, AFTER the trio + real data)

The big forward direction once the Android feature trio is done. **Record-only —
do not build.** Two distinct tracks; BI is lower-risk and comes first.

## ⚠️ CRITICAL PREREQUISITE — real data
Both tracks are **useless on empty test data** — dashboards and agents on seed
data produce meaningless output. The hard sequence is:
1. **(a)** Finish the Android feature trio (push ✓ / show-password ✓ / profile
   photo ✓ / biometrics ✓ — essentially done).
2. **(b)** Load **real HR data** + run a **small live pilot** → real data starts
   accumulating (occupancy, tickets, status-history, expiries).
3. **(c)** THEN build the **BI / dashboards** track (track 1).
4. **(d)** THEN the **Compliance Watchdog** agent (track 2, first agent).
5. **(e)** THEN the remaining agents, **one at a time**.

Nothing in §3 starts before step (b) has produced a meaningful data volume.

## Track 1 — BI / dashboards (non-AI, lower-risk, comes sooner)
**What:** Admin dashboards + reports over **existing** data — occupancy, ticket
trends / SLA, upcoming visa/contract expiries, accommodation utilization.

**Why first:** Tangible value, **no AI Act exposure** (pure analytics on data we
already hold), and it surfaces the data quality that the agents will later need.
Kicks in as soon as real HR data is loaded (step c).

**Feasibility:** Reuses existing tables (tickets, employees, accommodations,
`entity_status_history`, expiry data). No new AI infra. Could start with a few
read-only admin dashboard pages.

## Track 2 — AI agents (the bigger system, phased, careful)
Per the existing **HR-ERP-AI-Agent architecture**. Build **one agent at a time**,
each gated on the previous proving out on real data.

**Order:**
1. **Compliance Watchdog — FIRST (smallest safe first agent).** Its deterministic
   core is the **already-working visa/contract expiry monitor** — so we start from
   proven, deterministic logic and layer agent reasoning carefully on top.
2. **Efficiency Agent — second.** Uses **`entity_status_history`** (the data clock
   is *already ticking* — every ticket status change is timestamped now), so by
   the time we build it there's real process-timing history to analyze.
3. **Financial / Controlling — third.** Permanent **L1 ceiling** (assist/advise
   only; never autonomous action on money).

**Non-negotiable guardrails (carry through every agent):**
- **Measure the PROCESS, not individuals** (AI Act — avoid profiling/scoring of
  people; analyze workflow/throughput, not worker performance ranking).
- **L1 zone** for anything touching **money, contracts, or authority** — the agent
  advises; a human decides and acts.
- **GDPR** throughout (lawful basis, data minimization, no special-category data
  without the §2 gate).

**Status:** strategic backlog. Revisit after step (b) — real data + pilot.

---
