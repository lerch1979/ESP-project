-- Option-C per-client billing: per-worker accommodation-payer + negotiated rates
-- + revenue/cost/margin on the monthly billing output.

-- 1. Per-worker "who pays for housing" — drives billing. Separate from
--    contractor_id (tenancy/access) and workplace (informational where-they-work).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS billing_client_id uuid REFERENCES contractors(id);
CREATE INDEX IF NOT EXISTS idx_employees_billing_client ON employees(billing_client_id);

-- 2. Negotiated per-night client rates. Resolution for (client, accommodation,
--    date): the row covering the date, preferring an accommodation-specific row
--    (accommodation_id set) over the client default (accommodation_id NULL).
CREATE TABLE IF NOT EXISTS client_night_rates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id    uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  accommodation_id uuid REFERENCES accommodations(id) ON DELETE CASCADE, -- NULL = client default (all sites)
  rate_per_night   numeric(12,2) NOT NULL CHECK (rate_per_night >= 0),    -- per person per night
  currency         varchar(3) NOT NULL DEFAULT 'HUF',
  valid_from       date NOT NULL,
  valid_to         date,                                                  -- NULL = open-ended
  notes            text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_client_night_rates_lookup
  ON client_night_rates(contractor_id, accommodation_id, valid_from);

-- 3. Revenue / cost / margin on the monthly billing output.
--    total_amount becomes REVENUE (employee-days x client rate). cost_amount =
--    rent allocation + operating accommodation_expenses. margin = revenue - cost.
ALTER TABLE accommodation_billings ADD COLUMN IF NOT EXISTS cost_amount   numeric(14,2);
ALTER TABLE accommodation_billings ADD COLUMN IF NOT EXISTS margin_amount numeric(14,2);
