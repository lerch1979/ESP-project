-- 140: contractor_roles junction (Phase 1a of the full billing model).
--
-- A contractor can hold MORE THAN ONE role — the same legal entity may be both a
-- SZÁLLÁSADÓ (a landlord we pay rent to) and a MEGBÍZÓ (a client we invoice). The
-- single contractors.type column (mig 094) can't express that and is unreliable
-- (the live billing clients are mis-typed 'property_owner'), so roles move to a
-- dedicated multi-tag table. contractors.type is left in place as legacy only.
--
-- The three roles:
--   • megbizo       — billing client; pays us. Linked to EMPLOYEES via
--                     employees.billing_client_id → drives REVENUE.
--   • szallasado    — landlord/property owner; we pay them rent. Linked to
--                     ACCOMMODATIONS via accommodations.current_contractor_id +
--                     monthly_rent → drives COST. (Formerly UI-labelled "Ingatlan
--                     tulajdonos".)
--   • alvallalkozo  — subcontractor with their own access; not a billing party.
--
-- Backfill is from ACTUAL USAGE, never from contractors.type:
--   • anyone an accommodation points to (current_contractor_id) IS a szállásadó;
--   • anyone with a client_night_rate IS a megbízó.
-- Everything else the owner tags by hand in the UI.

BEGIN;

CREATE TABLE IF NOT EXISTS contractor_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  role          varchar(16) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  CONSTRAINT contractor_roles_role_chk CHECK (role IN ('megbizo','szallasado','alvallalkozo')),
  CONSTRAINT contractor_roles_uniq UNIQUE (contractor_id, role)
);
CREATE INDEX IF NOT EXISTS idx_contractor_roles_role ON contractor_roles(role);
CREATE INDEX IF NOT EXISTS idx_contractor_roles_contractor ON contractor_roles(contractor_id);

COMMENT ON TABLE contractor_roles IS 'Multi-role tags per contractor (megbizo/szallasado/alvallalkozo). Authoritative for billing; supersedes the legacy contractors.type.';

-- ── backfill from actual usage (idempotent) ──
-- szállásadó: every contractor an accommodation currently points to.
INSERT INTO contractor_roles (contractor_id, role)
SELECT DISTINCT current_contractor_id, 'szallasado'
  FROM accommodations
 WHERE current_contractor_id IS NOT NULL
ON CONFLICT (contractor_id, role) DO NOTHING;

-- megbízó: every contractor that has a client night rate (a billing client).
INSERT INTO contractor_roles (contractor_id, role)
SELECT DISTINCT contractor_id, 'megbizo'
  FROM client_night_rates
 WHERE contractor_id IS NOT NULL
ON CONFLICT (contractor_id, role) DO NOTHING;

-- megbízó: also anyone already referenced as an employee's billing client.
INSERT INTO contractor_roles (contractor_id, role)
SELECT DISTINCT billing_client_id, 'megbizo'
  FROM employees
 WHERE billing_client_id IS NOT NULL
ON CONFLICT (contractor_id, role) DO NOTHING;

COMMIT;
