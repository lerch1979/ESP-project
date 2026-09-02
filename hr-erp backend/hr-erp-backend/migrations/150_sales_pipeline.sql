-- 150: Partner module Phase 3 — the sales pipeline (leads → opportunities → quotes).
--
-- Plan: docs/PARTNER_CRM_CONTRACT_INVENTORY.md (§D.1, Phase 3).
--
-- THE POINT OF THE DESIGN: the pipeline FEEDS the billing engine, it never shadows it.
-- `quote_lines` uses the SAME basis vocabulary as `client_night_rates`
-- (per_person | flat | per_bed_night) and carries the same per-basis fields, so
-- accepting a quote can materialise one partner_contracts row and one
-- client_night_rates row per priced site. There is deliberately no second place where a
-- price lives: an accepted quote becomes a rate, and the rate is what bills.
--
-- ROW SCOPING FROM DAY ONE: leads, opportunities and quotes all carry owner_user_id NOT
-- NULL, and `sales_record_shares` records what a manager has explicitly shared. Nothing
-- reads these yet beyond the sales service's own scope helper — the external-agent role
-- ships in Phase 4 and is gated on the Phase 0 security work. Building the column in now
-- is what makes Phase 4 a config change rather than a migration of live sales data.

BEGIN;

-- ── leads ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_leads (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   varchar(255) NOT NULL,
  source                 varchar(64),          -- ajánlás / hideghívás / weboldal / vásár …
  industry               varchar(128),
  country                varchar(64),
  status                 varchar(16) NOT NULL DEFAULT 'new',
  expected_headcount     integer,
  notes                  text,

  owner_user_id          uuid NOT NULL REFERENCES users(id),

  -- On WIN the lead points at the contractor it became. Kept (not deleted) so the
  -- pipeline history of a live client survives conversion.
  converted_contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  converted_at           timestamptz,
  lost_reason            text,

  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_leads_name_chk   CHECK (length(btrim(name)) > 0),
  CONSTRAINT partner_leads_status_chk CHECK (status IN ('new','contacted','qualified','converted','lost')),
  CONSTRAINT partner_leads_headcount_chk CHECK (expected_headcount IS NULL OR expected_headcount >= 0),
  -- A converted lead must say what it converted into, and vice versa. Half-converted is
  -- the state that makes a pipeline report lie.
  CONSTRAINT partner_leads_converted_chk
    CHECK ((status = 'converted') = (converted_contractor_id IS NOT NULL)),
  CONSTRAINT partner_leads_lost_chk
    CHECK (status <> 'lost' OR (lost_reason IS NOT NULL AND length(btrim(lost_reason)) > 0))
);
CREATE INDEX IF NOT EXISTS idx_partner_leads_owner  ON partner_leads(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_partner_leads_status ON partner_leads(status);

COMMENT ON TABLE partner_leads IS
  'Érdeklődők (még nem ügyfelek). Külön tábla, NEM a contractors-ban: a contractor_id a multi-tenancy kulcsa ~50 táblában, egy érdeklődő sor ott beszivárogna a tenant-választókba és a jogosultság-szűrésbe.';

-- Now that partner_leads exists, close the FKs mig 144/145 could only declare as
-- plain uuid columns. This is the "pure addition" that plan promised.
ALTER TABLE partner_contacts    DROP CONSTRAINT IF EXISTS fk_partner_contacts_lead;
ALTER TABLE partner_contacts    ADD  CONSTRAINT fk_partner_contacts_lead
  FOREIGN KEY (lead_id) REFERENCES partner_leads(id) ON DELETE CASCADE;
ALTER TABLE partner_contracts   DROP CONSTRAINT IF EXISTS fk_partner_contracts_lead;
ALTER TABLE partner_contracts   ADD  CONSTRAINT fk_partner_contracts_lead
  FOREIGN KEY (lead_id) REFERENCES partner_leads(id) ON DELETE CASCADE;
ALTER TABLE partner_activities  DROP CONSTRAINT IF EXISTS fk_partner_activities_lead;
ALTER TABLE partner_activities  ADD  CONSTRAINT fk_partner_activities_lead
  FOREIGN KEY (lead_id) REFERENCES partner_leads(id) ON DELETE CASCADE;
ALTER TABLE documents           DROP CONSTRAINT IF EXISTS fk_documents_lead;
ALTER TABLE documents           ADD  CONSTRAINT fk_documents_lead
  FOREIGN KEY (lead_id) REFERENCES partner_leads(id) ON DELETE SET NULL;

-- ── opportunities ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunities (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Same party pattern as the rest of the module: real FKs + CHECK exactly-one. An
  -- opportunity hangs off a LEAD (new business) or an existing CONTRACTOR (expansion).
  lead_id               uuid REFERENCES partner_leads(id) ON DELETE CASCADE,
  contractor_id         uuid REFERENCES contractors(id)   ON DELETE CASCADE,

  title                 varchar(255) NOT NULL,
  stage                 varchar(16) NOT NULL DEFAULT 'new',
  expected_headcount    integer,
  expected_monthly_value numeric(14,2),
  currency              varchar(3) NOT NULL DEFAULT 'HUF',
  probability           integer,
  expected_close_date   date,

  won_at                timestamptz,
  lost_at               timestamptz,
  lost_reason_code      varchar(32),
  lost_reason_text      text,

  owner_user_id         uuid NOT NULL REFERENCES users(id),
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT opportunities_party_chk CHECK (num_nonnulls(lead_id, contractor_id) = 1),
  CONSTRAINT opportunities_stage_chk
    CHECK (stage IN ('new','qualified','proposal','negotiation','won','lost')),
  CONSTRAINT opportunities_prob_chk CHECK (probability IS NULL OR (probability BETWEEN 0 AND 100)),
  CONSTRAINT opportunities_value_chk CHECK (expected_monthly_value IS NULL OR expected_monthly_value >= 0),
  -- A closed stage must carry its timestamp, and a loss must carry a reason. Otherwise
  -- win-rate and loss analysis quietly runs on incomplete rows.
  CONSTRAINT opportunities_won_chk  CHECK ((stage = 'won')  = (won_at  IS NOT NULL)),
  CONSTRAINT opportunities_lost_chk CHECK ((stage = 'lost') = (lost_at IS NOT NULL)),
  CONSTRAINT opportunities_lost_reason_chk
    CHECK (stage <> 'lost' OR (lost_reason_code IS NOT NULL OR (lost_reason_text IS NOT NULL AND length(btrim(lost_reason_text)) > 0)))
);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner ON opportunities(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead  ON opportunities(lead_id);

-- ── quotes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id   uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  version          integer NOT NULL DEFAULT 1,
  status           varchar(16) NOT NULL DEFAULT 'draft',

  valid_until      date,
  currency         varchar(3) NOT NULL DEFAULT 'HUF',
  vat_rate         numeric(5,4) NOT NULL DEFAULT 0.27,

  -- Totals are DERIVED from quote_lines and rewritten on every line change; they are
  -- stored so a sent quote keeps the numbers it was sent with.
  net_amount       numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount       numeric(14,2) NOT NULL DEFAULT 0,
  gross_amount     numeric(14,2) NOT NULL DEFAULT 0,

  notes            text,
  document_id      uuid,

  -- Sharing follows the accountantShare / settlement pattern, but as columns rather
  -- than a fourth share-link table: a quote's share is 1:1 with the quote.
  share_token      text UNIQUE,
  share_expires_at timestamptz,
  share_revoked_at timestamptz,

  sent_at          timestamptz,
  sent_to_contact_id uuid REFERENCES partner_contacts(id) ON DELETE SET NULL,
  accepted_at      timestamptz,
  rejected_at      timestamptz,
  reject_reason    text,

  -- What acceptance produced. Set once, on accept; proves the quote reached billing.
  materialised_contract_id uuid REFERENCES partner_contracts(id) ON DELETE SET NULL,
  materialised_at  timestamptz,

  owner_user_id    uuid NOT NULL REFERENCES users(id),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT quotes_status_chk CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  CONSTRAINT quotes_version_chk CHECK (version >= 1),
  CONSTRAINT quotes_vat_chk CHECK (vat_rate >= 0 AND vat_rate <= 1),
  CONSTRAINT quotes_accepted_chk CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
  CONSTRAINT quotes_rejected_chk CHECK ((status = 'rejected') = (rejected_at IS NOT NULL)),
  CONSTRAINT quotes_uniq_version UNIQUE (opportunity_id, version)
);
CREATE INDEX IF NOT EXISTS idx_quotes_opportunity ON quotes(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_quotes_owner ON quotes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_share ON quotes(share_token) WHERE share_token IS NOT NULL;

COMMENT ON COLUMN quotes.materialised_contract_id IS
  'Az elfogadáskor létrehozott partner_contracts sor. Ez a bizonyíték, hogy az ajánlat eljutott a számlázásig — ha üres egy accepted ajánlatnál, a lánc megszakadt.';

-- ── quote lines ─────────────────────────────────────────────────────────────
--
-- The basis vocabulary and the per-basis amount rules MIRROR client_night_rates
-- (mig 126/138/141) EXACTLY, so a line can be materialised into a rate without
-- translation. If that table's CHECK changes, this one must change with it.
CREATE TABLE IF NOT EXISTS quote_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  line_no             integer NOT NULL DEFAULT 1,
  description         varchar(255),

  -- Which site this price is for. NULL = a client-wide default rate, exactly as
  -- client_night_rates.accommodation_id NULL means "all sites".
  accommodation_id    uuid REFERENCES accommodations(id) ON DELETE SET NULL,

  billing_basis       varchar(16) NOT NULL,
  rate_per_night      numeric(12,2),   -- per_person
  flat_amount         numeric(14,2),   -- flat
  rate_used           numeric(14,2),   -- per_bed_night, occupied
  rate_empty          numeric(14,2),   -- per_bed_night, billed-empty
  occupancy_floor_pct numeric(5,4),
  contracted_beds     integer,

  -- For the quote's own arithmetic only — the billing engine never reads these.
  quantity            numeric(12,2),
  line_net            numeric(14,2) NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT quote_lines_basis_chk
    CHECK (billing_basis IN ('per_person','flat','per_bed_night')),
  -- Mirrors client_night_rates_amount_chk. A line that cannot become a rate must not be
  -- accepted in the first place.
  CONSTRAINT quote_lines_amount_chk CHECK (
    (billing_basis = 'per_person'    AND rate_per_night IS NOT NULL)
    OR (billing_basis = 'flat'       AND flat_amount IS NOT NULL AND accommodation_id IS NOT NULL)
    OR (billing_basis = 'per_bed_night' AND rate_used IS NOT NULL)
  ),
  CONSTRAINT quote_lines_floor_chk
    CHECK (occupancy_floor_pct IS NULL OR (occupancy_floor_pct >= 0 AND occupancy_floor_pct <= 1)),
  CONSTRAINT quote_lines_beds_chk CHECK (contracted_beds IS NULL OR contracted_beds >= 0),
  CONSTRAINT quote_lines_nonneg_chk CHECK (
    COALESCE(rate_per_night,0) >= 0 AND COALESCE(flat_amount,0) >= 0
    AND COALESCE(rate_used,0) >= 0 AND COALESCE(rate_empty,0) >= 0
  )
);
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);

-- ── explicit sharing of a sales record with another user ────────────────────
-- "What a manager explicitly shares." Read by the sales scope helper alongside
-- owner_user_id; unused until a second sales user exists, which is Phase 4.
CREATE TABLE IF NOT EXISTS sales_record_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type varchar(16) NOT NULL,
  record_id   uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT srs_type_chk CHECK (record_type IN ('lead','opportunity','quote')),
  CONSTRAINT srs_uniq UNIQUE (record_type, record_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_srs_lookup ON sales_record_shares(record_type, record_id);

COMMIT;
