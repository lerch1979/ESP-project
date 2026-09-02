-- 144: Partner module Phase 1 — contacts, contracts, party-linked documents,
--      and the partner master data that was missing entirely.
--
-- Plan: docs/PARTNER_CRM_CONTRACT_INVENTORY.md (§D.1, Phase 1).
--
-- THE PARTY REFERENCE
-- -------------------
-- Contacts, contracts and documents all hang off a "party": a contractor we have a
-- relationship with, a property, or (from Phase 3) a lead we are still pitching.
-- This is NOT modelled polymorphically. Three real nullable FKs plus a CHECK that
-- exactly one is set keeps referential integrity in the database, which matters in a
-- repo whose orphan scans are a recurring exercise and whose tenant isolation is
-- app-layer WHERE rather than RLS.
--
-- `lead_id` is created here as a plain uuid WITHOUT its foreign key, because
-- partner_leads does not exist until migration 146 (Phase 3). Nothing can populate it
-- before then — the CHECK still counts it — and 146 adds the FK as a pure addition.
-- The alternative (creating partner_leads early) would ship a Phase 3 table with no
-- code behind it, which is how this repo grew its dormant systems.
--
-- THE LEASE DECISION
-- ------------------
-- An accommodation lease is a partner_contracts row with contract_role='szallasado'
-- and accommodation_id set. It is deliberately NOT new columns on `accommodations`:
-- one szállásadó may rent us several properties on different terms, which is the same
-- reasoning as the 2026-08-08 per-accommodation cost decision. One table gives all
-- three partner types one expiry feed and one UI.

BEGIN;

-- ── partner master data (was missing entirely) ───────────────────────────────
-- `contractors` carried one email and one phone and nothing else. Invoicing a partner
-- or paying a landlord needs tax/registration/bank details. These live on the partner,
-- not on a user: the pre-existing `owner_billing_info` keyed this data on `user_id`,
-- which cannot express "this company's bank account" at all. It holds 0 rows on dev
-- AND prod and has no code references, so it is marked superseded rather than
-- silently left as a second place to look.
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS tax_number        varchar(32);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS company_reg_number varchar(64);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS bank_account      varchar(64);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS billing_email     varchar(255);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS billing_address   text;

COMMENT ON COLUMN contractors.tax_number IS 'Adószám';
COMMENT ON COLUMN contractors.company_reg_number IS 'Cégjegyzékszám';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='owner_billing_info') THEN
    EXECUTE $c$COMMENT ON TABLE owner_billing_info IS
      'SUPERSEDED 2026-09-02 by contractors.tax_number/company_reg_number/bank_account/billing_email/billing_address. Keyed on user_id, which cannot express a company''s billing data. 0 rows and 0 code references on dev and prod at the time of supersession. Do not add rows; drop is a separate explicit decision.'$c$;
  END IF;
END $$;

-- ── partner_contacts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id          uuid,                                              -- FK added in mig 146
  contractor_id    uuid REFERENCES contractors(id)    ON DELETE CASCADE,
  accommodation_id uuid REFERENCES accommodations(id) ON DELETE CASCADE,

  name             varchar(255) NOT NULL,
  role_title       varchar(128),          -- "ügyvezető", "HR vezető", "gondnok"
  phone            varchar(64),
  email            varchar(255),
  language         varchar(5) NOT NULL DEFAULT 'hu',
  is_primary       boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  notes            text,

  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_contacts_party_chk
    CHECK (num_nonnulls(lead_id, contractor_id, accommodation_id) = 1),
  CONSTRAINT partner_contacts_name_chk CHECK (length(btrim(name)) > 0)
);

-- One primary contact per party, enforced by the database rather than by the
-- controller remembering to clear the old one. Partial so that inactive/non-primary
-- rows are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_contacts_primary_contractor
  ON partner_contacts (contractor_id) WHERE is_primary AND contractor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_contacts_primary_accommodation
  ON partner_contacts (accommodation_id) WHERE is_primary AND accommodation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_contacts_primary_lead
  ON partner_contacts (lead_id) WHERE is_primary AND lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_contacts_contractor    ON partner_contacts(contractor_id);
CREATE INDEX IF NOT EXISTS idx_partner_contacts_accommodation ON partner_contacts(accommodation_id);

COMMENT ON TABLE partner_contacts IS 'Kapcsolattartók partnerenként/ingatlanonként. Több kapcsolattartó, pontosan egy elsődleges (részleges unique index).';

-- ── partner_contracts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_contracts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id          uuid,                                              -- FK added in mig 146
  contractor_id    uuid REFERENCES contractors(id)    ON DELETE CASCADE,
  accommodation_id uuid REFERENCES accommodations(id) ON DELETE CASCADE,

  -- Which side of the relationship this contract governs. Mirrors contractor_roles
  -- (mig 140) so a partner tagged 'szallasado' has szállásadó contracts.
  contract_role    varchar(16) NOT NULL,

  contract_no      varchar(64),
  title            varchar(255),
  status           varchar(16) NOT NULL DEFAULT 'draft',

  start_date       date,
  end_date         date,
  is_open_ended    boolean NOT NULL DEFAULT false,

  -- Notice period in days. The DEADLINE is derived, never stored by hand — a stored
  -- copy would drift the moment end_date or notice_days is edited.
  notice_days      integer,
  notice_deadline  date GENERATED ALWAYS AS (
                     CASE WHEN end_date IS NOT NULL AND notice_days IS NOT NULL
                          THEN end_date - notice_days
                     END) STORED,

  renewal_type        varchar(16) NOT NULL DEFAULT 'none',
  renewal_term_months integer,

  parent_contract_id uuid REFERENCES partner_contracts(id) ON DELETE SET NULL,

  signed_at        date,
  document_id      uuid,             -- points at documents.id; soft link (documents is soft-deleted)
  currency         varchar(3) NOT NULL DEFAULT 'HUF',
  indexation_note  text,
  notes            text,

  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_contracts_party_chk
    CHECK (num_nonnulls(lead_id, contractor_id, accommodation_id) = 1
           -- a LEASE names both the landlord and the property, so that pair is allowed
           OR (contractor_id IS NOT NULL AND accommodation_id IS NOT NULL AND lead_id IS NULL)),
  CONSTRAINT partner_contracts_role_chk
    CHECK (contract_role IN ('megbizo','szallasado','alvallalkozo')),
  CONSTRAINT partner_contracts_status_chk
    CHECK (status IN ('draft','active','expired','terminated')),
  CONSTRAINT partner_contracts_renewal_chk
    CHECK (renewal_type IN ('none','auto','option')),
  CONSTRAINT partner_contracts_dates_chk
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT partner_contracts_notice_chk
    CHECK (notice_days IS NULL OR notice_days >= 0),
  -- An open-ended contract has no end date; a fixed-term one is what carries expiry.
  CONSTRAINT partner_contracts_open_ended_chk
    CHECK (NOT is_open_ended OR end_date IS NULL),
  -- accommodation_id is what makes a contract a LEASE, and only a szállásadó contract
  -- can be about a property.
  CONSTRAINT partner_contracts_lease_role_chk
    CHECK (accommodation_id IS NULL OR contract_role = 'szallasado')
);

CREATE INDEX IF NOT EXISTS idx_partner_contracts_contractor    ON partner_contracts(contractor_id);
CREATE INDEX IF NOT EXISTS idx_partner_contracts_accommodation ON partner_contracts(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_partner_contracts_role          ON partner_contracts(contract_role);
CREATE INDEX IF NOT EXISTS idx_partner_contracts_status        ON partner_contracts(status);
-- The expiry monitor and the Szerződések board both scan forward on these two dates.
CREATE INDEX IF NOT EXISTS idx_partner_contracts_end_date      ON partner_contracts(end_date)
  WHERE end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_contracts_notice_dl     ON partner_contracts(notice_deadline)
  WHERE notice_deadline IS NOT NULL;

COMMENT ON TABLE partner_contracts IS 'Szerződések MINDEN partnertípusra (megbízó/szállásadó/alvállalkozó). accommodation_id kitöltve = bérleti szerződés (lease) egy ingatlanra. Soha nem az accommodations táblán, mert egy szállásadó több ingatlant is bérbe adhat eltérő feltételekkel.';
COMMENT ON COLUMN partner_contracts.notice_deadline IS 'Származtatott: end_date - notice_days. Ez a "meddig mondhatjuk fel" dátum — a Szerződések tábla ez szerint rendez, és az expiry monitor külön (notice) mezőként riaszt rá.';

-- ── documents: party link ────────────────────────────────────────────────────
-- Closes the gap PROJECT_STATE tracked: documents could only attach to an employee
-- (or a bare tenant_id), so a lease PDF or a partner contract had nowhere to live.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS lead_id          uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS contractor_id    uuid REFERENCES contractors(id)    ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS accommodation_id uuid REFERENCES accommodations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_contractor    ON documents(contractor_id)    WHERE contractor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_accommodation ON documents(accommodation_id) WHERE accommodation_id IS NOT NULL;

-- NOTE: no exactly-one CHECK on documents. Unlike contacts/contracts, a document is
-- legitimately allowed to hang off nothing at all (the existing employee_id / tenant_id
-- rows), and adding a party link must not invalidate them.
COMMENT ON COLUMN documents.contractor_id IS 'Partnerhez csatolt dokumentum (szerződés, cégpapír). NULL = nem partner-dokumentum.';

-- ── expiry monitor: widen for contract dates ────────────────────────────────
-- The rule engine (thresholds, most-specific-wins, one-alert-per-bucket dedup) is
-- already entity-agnostic; only these value lists were hardcoded to the employee
-- world. 'notice' is its OWN field because a notice deadline is a different event from
-- an expiry — and because `field` is part of the dedup key, one contract then runs two
-- independent alert cycles with no extra machinery.
ALTER TABLE expiry_alert_log      DROP CONSTRAINT IF EXISTS expiry_alert_log_entity_type_check;
ALTER TABLE expiry_alert_log      ADD  CONSTRAINT expiry_alert_log_entity_type_check
  CHECK (entity_type IN ('employee','employee_document','partner_contract'));

ALTER TABLE expiry_alert_log      DROP CONSTRAINT IF EXISTS expiry_alert_log_field_check;
ALTER TABLE expiry_alert_log      ADD  CONSTRAINT expiry_alert_log_field_check
  CHECK (field IN ('visa','contract','document','partner_contract','notice'));

ALTER TABLE expiry_threshold_rules DROP CONSTRAINT IF EXISTS expiry_threshold_rules_field_check;
ALTER TABLE expiry_threshold_rules ADD  CONSTRAINT expiry_threshold_rules_field_check
  CHECK (field IN ('visa','contract','document','partner_contract','notice','*'));

-- A notice deadline is actionable further out than a document expiry: once it passes,
-- the contract auto-renews and the exit is gone for another term. Seeded once.
INSERT INTO expiry_threshold_rules (field, thresholds, include_overdue, is_active)
SELECT 'notice', ARRAY[120, 90, 60, 30, 14], TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM expiry_threshold_rules WHERE field = 'notice');

COMMIT;
