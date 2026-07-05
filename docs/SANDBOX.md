# Local Sandbox (synthetic data)

A safe, fully-synthetic local database for building/testing features (starting
with the room-consolidation engine) **without touching production or any real
personal data**. Prod is never contacted by any of this.

- **DB:** `hr_erp_sandbox` (local Postgres). Separate from the dev DB (`hr_erp_db`).
- **All data is synthetic:** generated names, emails `@sandbox.local`, phones `+36 30 000 xxxx`.
- **Safety:** the seed refuses to run unless `DB_NAME` contains `sandbox` (or `FORCE_SEED=1`).

## Commands (run in `hr-erp backend/hr-erp-backend/`)

```bash
npm run sandbox:reset     # DROP + CREATE + migrate-from-scratch + seed (one command)
npm run sandbox:seed      # re-seed only (idempotent — clears + regenerates data)
npm run sandbox:migrate   # run migrations against the sandbox only
npm run dev:sandbox       # run the backend against the sandbox DB (nodemon)
npm run start:sandbox     # run the backend against the sandbox DB (node)
```

`sandbox:reset` sidesteps the dev migration-runner block at `093` because a
**fresh** DB migrates cleanly through the latest (120 migrations, through 130).

## Run the full stack against the sandbox

1. Backend: `npm run sandbox:reset` (once), then `npm run dev:sandbox`.
2. Admin: in `hr-erp-admin/`, `npm run dev` (unchanged — it talks to the same
   local backend, which now points at the sandbox DB).
3. Log in with a sandbox account (password **`sandbox123`**):
   - `superadmin@sandbox.local` · `admin@sandbox.local` · `resident1@sandbox.local` · `resident2@sandbox.local`

## What the seed generates

- **1 contractor**, **15 accommodations**, **~56 rooms / ~176 beds**.
- **300 employees** with gender / workplace / `shift_schedule`
  (day/night/rotating/flexible); ~70% room-assigned in the normal sites.
- **Consolidation v2 role cast (deterministic)** so the strategy layer is testable:
  - **CORE** "Szálló 15" — near-full, workplace-bound to `Audi Győr`, 2 free beds.
  - **BUFFER** "Szálló 01" — drainable (2 Audi day males → core; 1 Bosch whose
    workplace the core excludes → workplace binding demonstrated).
  - **PHASE_OUT** "Szálló 02" — Mercedes day males, drain into normals.
  - **LOCKED** "Szálló 03" — under-consolidated; the engine must leave it alone.
  - **normals** "Szálló 04–14" — random fill with mixed-gender / mixed day-night
    edge-case rooms (within-accommodation constraint proofs).
- **Consolidation regression:** `DB_NAME=hr_erp_sandbox node tests/consolidationEngine.script.js`
  (40 checks; idempotent — snapshots + restores employee placement).
- A few tickets + expenses so dashboards aren't empty.
- Accommodation `type` is `dormitory` (a valid `VALID_TYPES` value, so admin
  edit-save works).

The dataset is deterministic (seeded PRNG), so re-running gives the same shape.

## Switching back to the normal dev DB

Just use the normal scripts (`npm run dev`) — they default to `DB_NAME=hr_erp_db`.
Nothing here changes the dev or prod database.
