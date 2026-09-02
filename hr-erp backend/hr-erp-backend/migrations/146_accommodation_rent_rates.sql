-- 146: effective-dated COST rates per accommodation.
--
-- THE PROBLEM THIS FIXES
-- ----------------------
-- mig 142 put the rent we pay on `accommodations` as three current-value columns
-- (rent_basis / rent_amount / rent_per_bed_night) with no validity window, and the
-- billing engine read them with NO date filter:
--
--     SELECT id, rent_basis, COALESCE(rent_amount, monthly_rent), rent_per_bed_night
--       FROM accommodations
--
-- So editing a rate silently restated every month that had not been finalized. Found
-- while entering the real Sarród I. contract: August 2026 was already computed at
-- 558 occupied bed-nights x 2000 = 1 116 000 Ft, its run was `calculated` (not
-- finalized), and the engine's re-bill path cancels-and-replaces a non-finalized run —
-- so changing the rate to 2200 would have re-stated a closed month by +111 600 Ft.
--
-- The REVENUE side already had this right: client_night_rates carries
-- valid_from / valid_to and is resolved PER DAY (makeRateResolver). This migration
-- gives the cost side the same shape, so both sides of the margin behave identically.
--
-- BACKFILL
-- --------
-- Every accommodation that currently has a cost configured gets one row valid from
-- 1900-01-01, i.e. from the beginning of time. That is deliberate: no historical month
-- may change as a result of this migration, so August and everything before it keep
-- resolving to exactly the values they were billed at. New periods are added by
-- closing the open row (valid_to) and inserting the next one.
--
-- The `accommodations` columns are LEFT IN PLACE and still act as the fallback for any
-- accommodation with no rate row, so nothing silently drops to zero — the same
-- guarantee mig 142 made for a NULL basis.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS accommodation_rent_rates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id   uuid NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,

  -- Same vocabulary as accommodations.rent_basis (mig 142).
  rent_basis         varchar(20) NOT NULL,
  rent_amount        numeric(14,2),   -- flat / vegyes: monthly rent for the whole property
  rent_per_bed_night numeric(14,2),   -- per_bed_night: price of one occupied bed for one night
  currency           varchar(3) NOT NULL DEFAULT 'HUF',

  valid_from         date NOT NULL,
  valid_to           date,            -- NULL = open-ended (the current rate)

  notes              text,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT arr_basis_chk CHECK (rent_basis IN ('flat','per_bed_night','mixed')),
  CONSTRAINT arr_range_chk CHECK (valid_to IS NULL OR valid_to >= valid_from),
  -- A per-bed rate needs a per-bed price; flat/vegyes need a monthly amount. Without
  -- this a half-filled row bills as zero instead of failing loudly.
  CONSTRAINT arr_amount_chk CHECK (
    (rent_basis = 'per_bed_night' AND rent_per_bed_night IS NOT NULL)
    OR (rent_basis IN ('flat','mixed') AND rent_amount IS NOT NULL)
  ),
  CONSTRAINT arr_nonneg_chk CHECK (
    COALESCE(rent_amount, 0) >= 0 AND COALESCE(rent_per_bed_night, 0) >= 0
  )
);

-- Two rates covering the same day for one property is not a data-entry mistake to be
-- resolved by "latest wins" — it is ambiguous about what we actually owe. Refuse it in
-- the database. daterange is [from, to) so an open row (NULL valid_to) runs to infinity
-- and a row ending 08-31 abuts one starting 09-01 without overlapping.
ALTER TABLE accommodation_rent_rates DROP CONSTRAINT IF EXISTS arr_no_overlap;
ALTER TABLE accommodation_rent_rates ADD CONSTRAINT arr_no_overlap
  EXCLUDE USING gist (
    accommodation_id WITH =,
    daterange(valid_from, COALESCE(valid_to, DATE '9999-12-31'), '[]') WITH &&
  );

CREATE INDEX IF NOT EXISTS idx_arr_lookup
  ON accommodation_rent_rates (accommodation_id, valid_from);

COMMENT ON TABLE accommodation_rent_rates IS
  'Effective-dated KÖLTSÉG oldal: mit fizetünk a szállásadónak, mettől meddig. A billingEngine NAPONTA oldja fel (mint a client_night_rates-t a bevételi oldalon), így egy díjváltozás soha nem ír át lezárt hónapot. Az accommodations.rent_* oszlopok fallbackként megmaradnak.';
COMMENT ON COLUMN accommodation_rent_rates.valid_to IS
  'NULL = ez a jelenleg élő díj. Új díj rögzítésekor a régit le kell zárni (valid_to), különben az EXCLUDE constraint elutasítja az átfedést.';

-- ── backfill: today's configured values, valid from the beginning of time ───
-- LEFT AS-IS ON PURPOSE: valid_from is 1900-01-01 so every already-billed month
-- resolves to the same numbers it was billed at.
INSERT INTO accommodation_rent_rates
  (accommodation_id, rent_basis, rent_amount, rent_per_bed_night, valid_from, notes)
SELECT a.id,
       COALESCE(a.rent_basis, 'flat'),
       CASE WHEN COALESCE(a.rent_basis,'flat') <> 'per_bed_night'
            THEN COALESCE(a.rent_amount, a.monthly_rent) END,
       CASE WHEN a.rent_basis = 'per_bed_night' THEN a.rent_per_bed_night END,
       DATE '1900-01-01',
       'Migrált a mig 142 oszlopokból (146). Nyitott érvényesség, hogy egyetlen korábbi hónap se változzon.'
  FROM accommodations a
 WHERE (a.rent_basis = 'per_bed_night' AND a.rent_per_bed_night IS NOT NULL)
    OR (COALESCE(a.rent_basis,'flat') <> 'per_bed_night'
        AND COALESCE(a.rent_amount, a.monthly_rent) IS NOT NULL)
ON CONFLICT DO NOTHING;

COMMIT;
