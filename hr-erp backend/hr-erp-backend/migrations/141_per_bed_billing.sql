-- 141: per-bed billing basis + compensation pass-through line (Phase 1b).
--
-- PER-BED (`per_bed_night`): bills a CONTRACTED BLOCK of beds per (megbízó ×
-- accommodation), honouring an occupancy floor/guarantee:
--   floor_beds = ceil(capacity × occupancy_floor_pct)
--   full       = max(occupied, floor_beds)          -- guaranteed minimum billed
--   reduced    = max(0, capacity − full)            -- empty beds within the block
--   net/night  = full × rate_used + reduced × rate_empty
-- capacity = contracted_beds (lekötött ágyszám) when set, else the whole
-- accommodation's physical beds (Σ accommodation_rooms.beds) — the single-megbízó
-- case. Billed for EVERY day the rate is valid in the month (the block is paid for
-- even on low/zero-occupancy days). With floor_pct=0 and rate_empty=0 it degenerates
-- to plain per-occupied-bed billing.
--
-- COMPENSATION PASS-THROUGH: approved damage claims (kárjegyzőkönyv) for a worker are
-- billed to that worker's MEGBÍZÓ as a SEPARATE invoice line (we invoice the megbízó,
-- who deducts from the worker). Stored on the billing row as compensation_amount, kept
-- OUT of housing net/margin (a pass-through, not our revenue).

BEGIN;

-- ── client_night_rates: per-bed columns ──
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS rate_used           numeric(14,2);            -- per OCCUPIED/guaranteed bed-night
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS rate_empty          numeric(14,2) DEFAULT 0;  -- per EMPTY bed-night (0 = ignore empties)
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS occupancy_floor_pct numeric(5,4)  DEFAULT 0;  -- 0..1; 0 = no guarantee
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS contracted_beds     integer;                  -- lekötött ágyszám; NULL = whole-accommodation capacity

COMMENT ON COLUMN client_night_rates.rate_used IS 'per_bed_night: díj/lekötött (foglalt) ágy/éj.';
COMMENT ON COLUMN client_night_rates.rate_empty IS 'per_bed_night: díj/üres ágy/éj a lekötött blokkon belül (0 = nem számlázzuk az üreseket).';
COMMENT ON COLUMN client_night_rates.occupancy_floor_pct IS 'per_bed_night: kihasználtsági garancia (0..1). teljes árú ágy = max(foglalt, ceil(kapacitás×pct)).';
COMMENT ON COLUMN client_night_rates.contracted_beds IS 'per_bed_night: lekötött ágyszám erre a (megbízó×szállás) párra. NULL → az egész szállás fizikai ágyszáma.';

-- ── widen basis + amount checks to include per_bed_night (idempotent) ──
ALTER TABLE client_night_rates DROP CONSTRAINT IF EXISTS client_night_rates_basis_chk;
ALTER TABLE client_night_rates ADD  CONSTRAINT client_night_rates_basis_chk
  CHECK (billing_basis IN ('per_person','flat','per_bed_night'));

ALTER TABLE client_night_rates DROP CONSTRAINT IF EXISTS client_night_rates_amount_chk;
ALTER TABLE client_night_rates ADD  CONSTRAINT client_night_rates_amount_chk CHECK (
     (billing_basis = 'per_person'   AND rate_per_night IS NOT NULL)
  OR (billing_basis = 'flat'         AND flat_amount IS NOT NULL AND accommodation_id IS NOT NULL)
  OR (billing_basis = 'per_bed_night' AND rate_used IS NOT NULL)
);

ALTER TABLE client_night_rates DROP CONSTRAINT IF EXISTS client_night_rates_floor_chk;
ALTER TABLE client_night_rates ADD  CONSTRAINT client_night_rates_floor_chk
  CHECK (occupancy_floor_pct IS NULL OR (occupancy_floor_pct >= 0 AND occupancy_floor_pct <= 1));

ALTER TABLE client_night_rates DROP CONSTRAINT IF EXISTS client_night_rates_contracted_chk;
ALTER TABLE client_night_rates ADD  CONSTRAINT client_night_rates_contracted_chk
  CHECK (contracted_beds IS NULL OR contracted_beds >= 0);

COMMENT ON COLUMN client_night_rates.billing_basis IS 'per_person (rate_per_night × person-nights) | flat (flat_amount/hó, covered days prorated) | per_bed_night (contracted bed block: rate_used/rate_empty, occupancy_floor_pct, contracted_beds).';

-- ── accommodation_billings: compensation pass-through line total (separate from housing) ──
ALTER TABLE accommodation_billings ADD COLUMN IF NOT EXISTS compensation_amount numeric(14,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN accommodation_billings.compensation_amount IS 'Kártérítés-átterhelés a megbízóra (külön számlasor). NEM része a lakhatási nettónak/árrésnek.';

COMMIT;
