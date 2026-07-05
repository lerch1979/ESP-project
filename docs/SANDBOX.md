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

- **1 contractor**, **~15 accommodations**, **~95 rooms / ~328 beds** (varied
  sizes; sites 01–02 under-utilized, site 15 nearly full).
- **~300 employees** with gender / workplace / `shift_schedule`
  (day/night/rotating/flexible); **~70% room-assigned, ~30% unassigned**.
- **Consolidation-engine edge cases**: mixed-gender rooms and mixed day/night
  rooms (the engine must *not* consolidate across these) — counts printed on seed.
- A few tickets + expenses so dashboards aren't empty.

The dataset is deterministic (seeded PRNG), so re-running gives the same shape.

## Switching back to the normal dev DB

Just use the normal scripts (`npm run dev`) — they default to `DB_NAME=hr_erp_db`.
Nothing here changes the dev or prod database.
