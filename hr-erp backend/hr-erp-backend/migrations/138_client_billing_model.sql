-- 138: full client-billing model — VAT + billing basis (per-person / flat property
-- rent) + a per-accommodation utilities (rezsi) handling flag.
--
-- Resolution rule (unchanged + basis-aware): for (client, accommodation, date) the
-- engine resolves ONE applicable client_night_rates row (site-specific beats client
-- default; latest valid_from wins). That row's `billing_basis` decides how the client
-- is billed. So an accommodation is EITHER per_person OR flat within a month — never
-- both. A mixed model (flat base + per-person surcharge) would need TWO applicable
-- rows and is intentionally NOT supported here (clean future extension).

BEGIN;

-- ── client_night_rates: VAT + basis + flat amount ──────────────────────────
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS vat_rate     numeric(5,4) NOT NULL DEFAULT 0.27; -- 27% ÁFA
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS billing_basis varchar(16) NOT NULL DEFAULT 'per_person';
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS flat_amount   numeric(14,2);                     -- monthly flat property rent billed to the client (basis='flat')

-- per_person rows keep rate_per_night; flat rows use flat_amount instead → relax NOT NULL.
ALTER TABLE client_night_rates ALTER COLUMN rate_per_night DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_night_rates_vat_rate_chk') THEN
    ALTER TABLE client_night_rates ADD CONSTRAINT client_night_rates_vat_rate_chk CHECK (vat_rate >= 0 AND vat_rate <= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_night_rates_basis_chk') THEN
    ALTER TABLE client_night_rates ADD CONSTRAINT client_night_rates_basis_chk CHECK (billing_basis IN ('per_person','flat'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_night_rates_amount_chk') THEN
    -- per_person → a per-night rate; flat → a flat amount AND a specific accommodation
    -- (a flat charge is per-property, never a client-wide default).
    ALTER TABLE client_night_rates ADD CONSTRAINT client_night_rates_amount_chk CHECK (
      (billing_basis = 'per_person' AND rate_per_night IS NOT NULL)
      OR
      (billing_basis = 'flat' AND flat_amount IS NOT NULL AND accommodation_id IS NOT NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_night_rates_flat_amount_chk') THEN
    ALTER TABLE client_night_rates ADD CONSTRAINT client_night_rates_flat_amount_chk CHECK (flat_amount IS NULL OR flat_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN client_night_rates.billing_basis IS 'per_person (rate_per_night × person-nights) | flat (flat_amount/month, prorated by covered days). One basis per client×accommodation×month.';
COMMENT ON COLUMN client_night_rates.vat_rate IS 'VAT (ÁFA) fraction, e.g. 0.27 for 27%. Applied to base + any utilities pass-through.';

-- ── accommodations: how utilities (rezsi) are billed to the client ──────────
ALTER TABLE accommodations ADD COLUMN IF NOT EXISTS utilities_billing varchar(20) NOT NULL DEFAULT 'we_pay';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accommodations_utilities_billing_chk') THEN
    ALTER TABLE accommodations ADD CONSTRAINT accommodations_utilities_billing_chk
      CHECK (utilities_billing IN ('we_pay','included','billed_separately'));
  END IF;
END $$;
COMMENT ON COLUMN accommodations.utilities_billing IS 'we_pay (our cost only) | included (in the base rate) | billed_separately (the month rezsi expense is passed through to the client, with VAT).';

-- ── accommodation_billings: net stays in total_amount; add VAT + gross ──────
ALTER TABLE accommodation_billings ADD COLUMN IF NOT EXISTS vat_amount   numeric(14,2); -- VAT on revenue
ALTER TABLE accommodation_billings ADD COLUMN IF NOT EXISTS gross_amount numeric(14,2); -- total_amount (net) + vat_amount

COMMIT;
