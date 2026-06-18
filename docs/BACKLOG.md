# Product Backlog — gated / blocked items

Items deliberately NOT built yet because a precondition (legal, compliance,
design sign-off) must be met first. This is distinct from `PROJECT_STATE.md`
("Current focus" / tech debt) — entries here are **blocked on an external gate**,
not just unscheduled.

---

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
