# Resident App — backlog (post Tier 1+2 i18n batch)

Source: resident-app UX audit 2026-06-21. STEP 1 (Tier 1+2, client-side i18n +
onboarding + surface videos) is being built now. The items below are NEXT /
separate.

## STEP 2 — Tier 3 standouts (needs backend endpoints — NOT built yet)
1. **House rules + emergency contacts on the accommodation screen.** "Who do I
   call for a leak / the manager / an emergency." Staff-authored, per building.
   Needs a resident endpoint (e.g. `GET /accommodations/my/extended` returning
   rules + contacts). Surface on `AccommodationDetailScreen`. High day-one value,
   especially for migrant workers.
2. **Own documents (`GET /documents/my`).** Residents currently can't see any of
   their own documents (contract, work permit, proof of residence); only visa
   expiry shows as a calendar event. Needs a resident-scoped, self-filtered
   endpoint + a documents screen (screen exists: `more/DocumentListScreen`,
   `more/DocumentDetailScreen`) and the `documents.view` gate confirmed for the
   resident role. Medium effort, high real-world value.

(Lower-tier follow-ups from the audit: announcements feed [build new], ticket
progress/status timeline [surface existing message thread], pay/deduction
transparency [bigger build, sensitive], local how-to guides via the videos
category.)

## SECURITY — server-side gating (do regardless of the menu)
3. **WellMind + CarePath APIs have NO permission gate.** The employee-facing
   routes (`src/routes/wellmind.routes.js`, `src/routes/carepath.routes.js`) call
   their controllers with only `authenticateToken` and **no `checkPermission`**,
   so any authenticated user can read/write mood/pulse/assessment and care-case
   data — GDPR **Art 9 special-category health data**. They are hidden from the
   resident menu, but the API is reachable directly. **Add server-side permission
   gates** (e.g. a `wellbeing.view` / `carepath.view` permission, assigned only to
   eligible roles) independent of the menu, plus the GDPR review already flagged
   before any surfacing. Treat as a real exposure, not cosmetic.
