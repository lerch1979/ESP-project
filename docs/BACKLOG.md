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

### 1. Push notifications (resident) — Tier 1, HIGH value, do early
**What:** Native push to the resident's phone for:
- a **chat reply received** (staff answered their ticket thread),
- an **upcoming repair / inspection** (from the calendar feed),
- a **visa / contract expiry reminder**.

**Why:** Brings the chat + calendar "to life" — the resident no longer has to
open the app to discover a reply or a due date. High engagement lever.

**Feasibility:** Now practical — we ship a **standalone app** (EAS build), so
**Expo push notifications** are available (`expo-notifications` + Expo push
tokens; store the token per device, send via Expo's push service). Server-side:
trigger on new ticket message, and on calendar-derived events approaching.

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
