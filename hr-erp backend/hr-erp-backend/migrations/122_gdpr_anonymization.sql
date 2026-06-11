-- 122: GDPR anonymization (right-to-be-forgotten) — v1, manual + grace-proposal.
--
-- Adds:
--   • employees.data_consent_at / data_consent_recorded_by  — consent tracking
--     (admin records manually now; QR+PIN onboarding fills it in Phase 2).
--   • employees.anonymized_at        — the one-way erasure marker (also excludes
--     the row from re-anonymization and from the proposal queue).
--   • employees.retention_notified_at — dedup for the "proposed for anonymization"
--     reminder so superadmins are pinged once per ex-employee, not daily.
--   • anonymization_config (single row) — grace period + retention knobs, all
--     editable from the admin UI so legal/DPO can finalize without code changes.
--   • anonymization_log — accountability record of each run: WHO, WHEN, WHY, and
--     COUNTS ONLY (never the values removed).
--
-- Additive + idempotent. No data change to existing rows.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS data_consent_at         TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS data_consent_recorded_by UUID;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS anonymized_at           TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS retention_notified_at   TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS anonymization_config (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retention_grace_months   INTEGER NOT NULL DEFAULT 24,   -- after end_date before a row is "proposed"
  backup_retention_days    INTEGER NOT NULL DEFAULT 30,   -- the documented "ages out" window (ops)
  -- employee_documents.document_type values that are KEPT (statutory retention,
  -- e.g. employment contracts); everything else has its scan physically deleted.
  -- DPO/HR must confirm these match the real document_type slugs before first use.
  statutory_document_types TEXT[] NOT NULL DEFAULT ARRAY['contract','employment_contract','munkaszerzodes','munkaszerződés'],
  reminder_enabled         BOOLEAN NOT NULL DEFAULT TRUE, -- ping superadmins about new proposals
  updated_by               UUID,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO anonymization_config (retention_grace_months)
SELECT 24 WHERE NOT EXISTS (SELECT 1 FROM anonymization_config);

CREATE TABLE IF NOT EXISTS anonymization_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL,                  -- the (now pseudonymous) key — kept for accountability
  pseudonym     TEXT,                           -- TÖRÖLT-<id8>
  requested_by  UUID,
  reason        VARCHAR(32) NOT NULL,           -- 'gdpr_request' | 'retention_expiry'
  dry_run       BOOLEAN NOT NULL DEFAULT FALSE,
  summary       JSONB NOT NULL DEFAULT '{}'::jsonb, -- COUNTS + table names ONLY, never the removed values
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_anonymization_log_employee ON anonymization_log (employee_id, executed_at DESC);
