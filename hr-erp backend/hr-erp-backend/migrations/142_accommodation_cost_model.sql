-- 142: COST side — per-accommodation rent basis + the six-line utilities matrix.
--
-- WHY PER ACCOMMODATION, NEVER PER PARTNER
-- One szállásadó may own several properties on completely different contracts
-- (a flat monthly rent on one, per-occupied-bed on another). The cost contract is a
-- property of the PROPERTY, so every field here hangs off accommodations — mirroring
-- how the REVENUE side hangs off (megbízó × accommodation) in client_night_rates.
--
-- THE THREE BASES
--   flat          — TISZTÁN BÉRLETI DÍJ. One fixed monthly rent for the WHOLE property,
--                   spread over that site's occupants: rent / days_in_month / site_occupants.
--   per_bed_night — ÉJSZAKÁNKÉNTI. occupied beds × rate × nights.
--   mixed         — VEGYES. flat rent PLUS the utility lines we are responsible for.
--
-- ⚠️ THE BUG THIS FIXES
-- Migration 112 allocates rent as monthly_rent / days_in_month / room_occupant_count,
-- GROUPED BY (accommodation, room). With one group per room, the amount allocated across
-- a site is monthly_rent × (occupied rooms) — Sopronhorpács has 31 occupied rooms, so its
-- rent would have been counted 31×. It stayed invisible only because every housed
-- accommodation had a NULL monthly_rent and because history carried no room until the
-- 2026-08-08 backfill. From now on the allocation is SITE-level: rooms stay on the
-- snapshot for occupancy analytics but never multiply cost.
--
-- LEGACY: accommodations.monthly_rent is preserved and back-filled into rent_amount.
-- A NULL rent_basis behaves as 'flat' over monthly_rent (so nothing silently drops to
-- zero), and the coverage view nags until an explicit basis is chosen.

BEGIN;

-- ── rent basis ─────────────────────────────────────────────────────────
ALTER TABLE accommodations ADD COLUMN IF NOT EXISTS rent_basis         varchar(20);
ALTER TABLE accommodations ADD COLUMN IF NOT EXISTS rent_amount        numeric(14,2);
ALTER TABLE accommodations ADD COLUMN IF NOT EXISTS rent_per_bed_night numeric(14,2);

DO $$ BEGIN
  ALTER TABLE accommodations ADD CONSTRAINT accommodations_rent_basis_chk
    CHECK (rent_basis IS NULL OR rent_basis IN ('flat','per_bed_night','mixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN accommodations.rent_basis IS
  'Bérleti konstrukció: flat (tisztán bérleti díj) | per_bed_night (éjszakánkénti) | mixed (vegyes). NULL = még nincs beállítva, a motor a monthly_rent-et használja flat-ként.';
COMMENT ON COLUMN accommodations.rent_amount IS 'flat/mixed: fix havi bérleti díj az EGÉSZ ingatlanra.';
COMMENT ON COLUMN accommodations.rent_per_bed_night IS 'per_bed_night: díj / foglalt ágy / éj, amit a szállásadónak fizetünk.';

-- Carry the legacy value forward so no site loses its rent when the engine switches over.
UPDATE accommodations SET rent_amount = monthly_rent
 WHERE rent_amount IS NULL AND monthly_rent IS NOT NULL AND monthly_rent > 0;

-- ── the six-line utilities matrix (per accommodation, per line) ────────
-- Each line answers four INDEPENDENT questions:
--   who_pays        — do WE pay it, or the szállásadó?           (drives COST)
--   contract_holder — in whose name does the contract run?       (admin/legal fact)
--   passthrough     — do we re-bill it to the megbízó?           (drives REVENUE)
--   passthrough_pct — at what share (0..100)?
-- A line we pay AND pass through at 100% is margin-neutral: the recorded expense is our
-- cost, the same amount becomes revenue. Below 100% the difference is a real cost to us.
CREATE TABLE IF NOT EXISTS accommodation_utility_lines (
  accommodation_id uuid        NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  line             varchar(32) NOT NULL,
  who_pays         varchar(16) NOT NULL DEFAULT 'szallasado',
  contract_holder  varchar(16) NOT NULL DEFAULT 'szallasado',
  passthrough      boolean     NOT NULL DEFAULT FALSE,
  passthrough_pct  numeric(5,2) NOT NULL DEFAULT 100,
  notes            text,
  updated_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (accommodation_id, line),
  CONSTRAINT aul_line_chk CHECK (line IN ('viz_csatorna','internet','aram','gaz','kozos_koltseg','hulladekszallitas')),
  CONSTRAINT aul_who_chk  CHECK (who_pays        IN ('mi','szallasado')),
  CONSTRAINT aul_ctr_chk  CHECK (contract_holder IN ('mi','szallasado')),
  CONSTRAINT aul_pct_chk  CHECK (passthrough_pct >= 0 AND passthrough_pct <= 100)
);

COMMENT ON TABLE accommodation_utility_lines IS
  'Rezsi-mátrix szállásonként: víz és csatorna · internet · áram · gáz · közös költség · hulladékszállítás. Soronként: ki fizeti, kinek a nevén van a szerződés, továbbszámlázzuk-e a megbízónak és milyen arányban.';

-- ── tag an expense with the utility line it settles ────────────────────
-- accommodation_expenses.category stays the coarse bucket (rezsi/karbantartás/…);
-- utility_line says WHICH of the six lines a rezsi expense actually is, so the matrix
-- can decide whether it is passed through and at what share.
ALTER TABLE accommodation_expenses ADD COLUMN IF NOT EXISTS utility_line varchar(32);
DO $$ BEGIN
  ALTER TABLE accommodation_expenses ADD CONSTRAINT accommodation_expenses_utility_line_chk
    CHECK (utility_line IS NULL OR utility_line IN ('viz_csatorna','internet','aram','gaz','kozos_koltseg','hulladekszallitas'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_acc_expenses_utility_line
  ON accommodation_expenses(accommodation_id, billing_month, utility_line)
  WHERE utility_line IS NOT NULL AND deleted_at IS NULL;

COMMIT;
