-- 120: Visa/contract/document expiry monitor (audit P0).
--
-- Three tables, all additive + idempotent:
--   • expiry_monitor_config   — single-row runtime toggle (enabled / digest_enabled).
--                               Cron reads it fresh each run; admin flips it from the UI,
--                               no restart. Mirrors the nlp_sentiment_config pattern.
--   • expiry_threshold_rules  — per-attribute alert lead-time rules. Most-specific wins
--                               (nationality > document_type > contractor > field). The
--                               seeded default rule (field='*') is the baseline; a hardcoded
--                               fallback in the service covers the "all rows deleted" case.
--   • expiry_alert_log        — idempotency. UNIQUE on (entity,field,expiry_date,threshold_days)
--                               so each bucket fires once. Keyed on the THRESHOLD VALUE that
--                               fired (not a rule id), so editing rules never re-fires passed
--                               buckets, and a renewed expiry_date starts a fresh cycle.
--
-- No data change to employees/employee_documents (expiry fields already exist).

-- ── runtime toggle ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expiry_monitor_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,   -- default ON (we want it for ourselves)
  digest_enabled  BOOLEAN NOT NULL DEFAULT FALSE,  -- email digest off until prod SMTP
  updated_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Exactly one config row.
INSERT INTO expiry_monitor_config (enabled, digest_enabled)
SELECT TRUE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM expiry_monitor_config);

-- ── per-attribute threshold rules ────────────────────────────────
CREATE TABLE IF NOT EXISTS expiry_threshold_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field           VARCHAR(16) NOT NULL DEFAULT '*'
                    CHECK (field IN ('visa', 'contract', 'document', '*')),
  nationality     VARCHAR(2),            -- NULL = any (ISO-3166 alpha-2)
  document_type   VARCHAR(64),           -- NULL = any (employee_documents.document_type)
  contractor_id   UUID,                  -- NULL = any (in schema; not surfaced in UI v1)
  thresholds      INTEGER[] NOT NULL,    -- descending positive distinct days, e.g. {60,30,14,7}
  include_overdue BOOLEAN NOT NULL DEFAULT TRUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the agreed baseline default rule (field='*', all attrs NULL) once.
INSERT INTO expiry_threshold_rules (field, thresholds, include_overdue, is_active)
SELECT '*', ARRAY[60, 30, 14, 7], TRUE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM expiry_threshold_rules
   WHERE field = '*' AND nationality IS NULL AND document_type IS NULL AND contractor_id IS NULL
);

-- ── dedup / idempotency log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS expiry_alert_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     VARCHAR(24) NOT NULL CHECK (entity_type IN ('employee', 'employee_document')),
  -- TEXT (not uuid): employees.id is uuid but employee_documents.id is integer,
  -- so a single column must hold both — stored as the stringified id.
  entity_id       TEXT NOT NULL,
  field           VARCHAR(16) NOT NULL CHECK (field IN ('visa', 'contract', 'document')),
  expiry_date     DATE NOT NULL,
  threshold_days  INTEGER NOT NULL,      -- the bucket that fired; -1 sentinel = overdue
  notification_id UUID,
  notified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One alert per (entity, field, expiry_date, bucket). Including expiry_date means a
-- renewed visa (new date) is a fresh key → cycle resets, no spam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expiry_alert_log
  ON expiry_alert_log (entity_type, entity_id, field, expiry_date, threshold_days);
