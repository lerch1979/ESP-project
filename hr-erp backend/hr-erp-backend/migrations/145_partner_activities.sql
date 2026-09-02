-- 145: Partner module Phase 2 — activity log + follow-up reminders.
--
-- Plan: docs/PARTNER_CRM_CONTRACT_INVENTORY.md (§D.1, Phase 2).
--
-- WHY FOLLOW-UPS REUSE `tasks` RATHER THAN A NEW REMINDER TABLE
-- ------------------------------------------------------------
-- A "call them back on Thursday" reminder needs an owner, a due date, a done state,
-- a notification and somewhere the user already looks. `tasks` has all of that, plus
-- GTD views, assignees, the notification centre and a Kanban board. A second reminder
-- table would duplicate every one of those and would be invisible in the places staff
-- already check their work — which is how this repo grew its dormant systems.
--
-- So an activity with a follow_up_at creates a REAL task and links to it. The activity
-- records what happened; the task carries what must happen next.
--
-- THE TWO CONTRACTOR COLUMNS ON `tasks` ARE NOT DUPLICATES
-- -------------------------------------------------------
--   tasks.contractor_id          — the TENANT that owns the row (multi-tenancy key,
--                                  used by every scoping predicate).
--   tasks.related_contractor_id  — the PARTNER the task is ABOUT.
-- For a follow-up on our own client these are often the same value, but they answer
-- different questions and must not be conflated: scoping reads the first, "show me
-- everything about this partner" reads the second. This mirrors the existing
-- related_employee_id (mig 097), which sits beside contractor_id for the same reason.

BEGIN;

-- ── tasks: what partner is this task about ──────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS related_contractor_id uuid
  REFERENCES contractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_related_contractor
  ON tasks(related_contractor_id) WHERE related_contractor_id IS NOT NULL;

COMMENT ON COLUMN tasks.related_contractor_id IS
  'A partner, akiről a feladat SZÓL. NEM azonos a contractor_id-vel, ami a tulajdonos tenant (jogosultság-szűrés). Párja a related_employee_id-nek (mig 097).';

-- ── partner_activities ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_activities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Same party reference as partner_contacts/partner_contracts (mig 144).
  -- lead_id gets its FK in mig 146, when partner_leads exists.
  lead_id          uuid,
  contractor_id    uuid REFERENCES contractors(id)    ON DELETE CASCADE,
  accommodation_id uuid REFERENCES accommodations(id) ON DELETE CASCADE,

  -- Which person we dealt with, when known. ON DELETE SET NULL: deleting a contact
  -- must never erase the history of what was discussed with them.
  contact_id       uuid REFERENCES partner_contacts(id) ON DELETE SET NULL,

  kind             varchar(16) NOT NULL DEFAULT 'note',
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  subject          varchar(255),
  body             text,

  -- The follow-up lives in `tasks`; this is the link, not a second reminder engine.
  follow_up_at     timestamptz,
  follow_up_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,

  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_activities_party_chk
    CHECK (num_nonnulls(lead_id, contractor_id, accommodation_id) = 1),
  CONSTRAINT partner_activities_kind_chk
    CHECK (kind IN ('note','call','meeting','email','offer_sent')),
  -- A follow-up task without a date, or a date without a task, is a half-written
  -- reminder that will silently never fire. Require them together.
  CONSTRAINT partner_activities_followup_chk
    CHECK ((follow_up_at IS NULL AND follow_up_task_id IS NULL)
           OR (follow_up_at IS NOT NULL AND follow_up_task_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_partner_activities_contractor    ON partner_activities(contractor_id);
CREATE INDEX IF NOT EXISTS idx_partner_activities_accommodation ON partner_activities(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_partner_activities_contact       ON partner_activities(contact_id);
-- The timeline reads newest-first per party.
CREATE INDEX IF NOT EXISTS idx_partner_activities_timeline
  ON partner_activities(contractor_id, occurred_at DESC);
-- "what follow-ups are still open" scans this.
CREATE INDEX IF NOT EXISTS idx_partner_activities_followup
  ON partner_activities(follow_up_at) WHERE follow_up_at IS NOT NULL;

COMMENT ON TABLE partner_activities IS
  'Partner-aktivitás napló: jegyzet / hívás / találkozó / email / ajánlat kiküldve. A follow_up_at MINDIG valódi `tasks` sort hoz létre (follow_up_task_id) — nincs külön emlékeztető-motor.';

COMMIT;
