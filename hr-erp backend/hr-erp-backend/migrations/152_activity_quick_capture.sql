-- 152: quick activity capture — opportunities become a party, and note text becomes
--      searchable from the pipeline lists.
--
-- WHY AN OPPORTUNITY NEEDS TO BE A PARTY
-- --------------------------------------
-- mig 145 gave partner_activities three parties: lead, contractor, accommodation. That
-- was right for Phase 2, where the pipeline did not exist yet. Since mig 150 the unit a
-- salesperson actually works is the OPPORTUNITY — "the 40-fő Győr deal" — and a lead may
-- carry several of them. Filing a call about one deal under the lead means the note is
-- correct but unfindable: it shows up on every other deal with the same prospect and on
-- none of them specifically.
--
-- So opportunity_id joins the party set rather than becoming a second note table. The
-- CHECK stays "exactly one", because an activity that belongs to two parties has no
-- single timeline to appear in.
--
-- The FK is ON DELETE CASCADE to match lead_id: an opportunity's notes are about that
-- opportunity and have no meaning without it. Notes worth keeping past a lost deal
-- belong on the contractor or the lead, which is where the conversion already puts them
-- (sales.service re-parents partner_activities on convert).

BEGIN;

ALTER TABLE partner_activities
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES opportunities(id) ON DELETE CASCADE;

ALTER TABLE partner_activities DROP CONSTRAINT IF EXISTS partner_activities_party_chk;
ALTER TABLE partner_activities ADD  CONSTRAINT partner_activities_party_chk
  CHECK (num_nonnulls(lead_id, contractor_id, accommodation_id, opportunity_id) = 1);

-- The timeline reads newest-first per party, same shape as the contractor index.
CREATE INDEX IF NOT EXISTS idx_partner_activities_opportunity
  ON partner_activities(opportunity_id, occurred_at DESC) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_activities_lead_timeline
  ON partner_activities(lead_id, occurred_at DESC) WHERE lead_id IS NOT NULL;

COMMENT ON COLUMN partner_activities.opportunity_id IS
  'A LEHETŐSÉG, amiről a bejegyzés szól. A lead_id/contractor_id/accommodation_id társa — pontosan egy lehet kitöltve (partner_activities_party_chk).';

-- ── searching the note text ─────────────────────────────────────────────────
-- Requirement: find a lead/opportunity by what was SAID on the call, not just by name.
-- That is an unanchored ILIKE '%…%', which no B-tree index can serve — without trigram
-- support it degrades to a sequential scan of every note the moment the log grows.
-- pg_trgm is already in this database (chatbot_improvements.sql, mig 113).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_partner_activities_body_trgm
  ON partner_activities USING GIN (body gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_partner_activities_subject_trgm
  ON partner_activities USING GIN (subject gin_trgm_ops);
-- The list search also matches the record's own name/title.
CREATE INDEX IF NOT EXISTS idx_partner_leads_name_trgm
  ON partner_leads USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_opportunities_title_trgm
  ON opportunities USING GIN (title gin_trgm_ops);

COMMIT;
