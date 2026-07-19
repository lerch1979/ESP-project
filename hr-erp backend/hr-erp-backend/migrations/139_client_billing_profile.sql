-- 139: per-CLIENT billing profile (Phase 1 of the full billing package).
--   • invoicing on/off (some clients we never invoice)
--   • legal type company | private (private = payroll handoff, NOT payroll calc)
--   • VAT-exemption reason (alanyi / tárgyi) for áfamentes clients
-- + a per-rate vat_exempt flag and a payroll_handoff marker on the billing output.
--
-- The six-line utilities matrix (client × line-item, per-line split expenses) is
-- Phase 2 — migration 138's single accommodations.utilities_billing flag stays inert
-- (default we_pay → no pass-through) until then.

BEGIN;

CREATE TABLE IF NOT EXISTS client_billing_profiles (
  contractor_id        uuid PRIMARY KEY REFERENCES contractors(id) ON DELETE CASCADE,
  invoicing_enabled    boolean NOT NULL DEFAULT true,   -- false → engine skips this client (no billing row)
  legal_type           varchar(16) NOT NULL DEFAULT 'company', -- company | private (private = payroll handoff)
  vat_exemption_reason varchar(16),                      -- alanyi | tárgyi, when the client's rates are áfamentes
  notes                text,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_billing_profiles_legal_type_chk CHECK (legal_type IN ('company','private')),
  CONSTRAINT client_billing_profiles_exempt_reason_chk CHECK (vat_exemption_reason IS NULL OR vat_exemption_reason IN ('alanyi','targyi'))
);
COMMENT ON COLUMN client_billing_profiles.invoicing_enabled IS 'false = never invoiced; the engine skips this client, coverage shows "kihagyva (szándékos)".';
COMMENT ON COLUMN client_billing_profiles.legal_type IS 'company = normal invoice; private = payroll handoff (record gross + "bérszámfejtendő magánszemély" marker, NEVER compute net/tax).';

-- per-rate VAT exemption (áfamentes). exempt → 0 VAT, gross = net; reason on the profile.
ALTER TABLE client_night_rates ADD COLUMN IF NOT EXISTS vat_exempt boolean NOT NULL DEFAULT false;

-- billing output marker for private-individual clients (payroll handoff).
ALTER TABLE accommodation_billings ADD COLUMN IF NOT EXISTS payroll_handoff boolean NOT NULL DEFAULT false;

COMMIT;
