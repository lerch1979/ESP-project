-- ============================================================
-- 109_employee_documents_gdpr.sql
--
-- Phase 2 of the privacy fix from yesterday's session: turn the existing
-- employee_documents table (12 columns, 0 rows, never wired into a
-- route) into a proper GDPR-graded store for sensitive documents.
--
-- ADDITIVE only — keeps the integer PK + the existing 12 columns intact
-- (no data loss for any future migration scenarios). Adds:
--   - access control flag
--   - per-row audit trail (every read/write appended)
--   - validity windows (issued_date, expiry_date)
--   - document_number / document_name for display
--   - soft-delete trio (deleted_at / deleted_by / delete_reason)
--   - updated_at for housekeeping
--
-- The orphan PDF discovered during PD.0 audit was already moved to
-- uploads/orphans/ before this migration ran (no DB cleanup needed —
-- there was never a row pointing at it).
-- ============================================================

BEGIN;

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS document_name    varchar(255),
  ADD COLUMN IF NOT EXISTS document_number  varchar(100),
  ADD COLUMN IF NOT EXISTS issued_date      date,
  ADD COLUMN IF NOT EXISTS expiry_date      date,

  -- Permission flag. v1 only differentiates 'admin_only' (default) from
  -- 'employee_self' — HR role is deferred. The column shape is stable
  -- so a future migration can add 'hr_only' without changing the API.
  ADD COLUMN IF NOT EXISTS access_level     varchar(20) NOT NULL DEFAULT 'admin_only',

  -- Per-row audit trail. JSONB array of
  --   { user_id, user_name, action, timestamp, ip, user_agent? }
  -- Append-only; controller writes to it on every read/write/delete.
  ADD COLUMN IF NOT EXISTS accessed_log     jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Soft delete. Hard delete is reserved for "right to erasure" requests
  -- and runs through a separate explicit script.
  ADD COLUMN IF NOT EXISTS deleted_at       timestamp,
  ADD COLUMN IF NOT EXISTS deleted_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason    text,

  ADD COLUMN IF NOT EXISTS updated_at       timestamp NOT NULL DEFAULT NOW();

-- Index sets
CREATE INDEX IF NOT EXISTS idx_employee_documents_type
  ON employee_documents (document_type)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry
  ON employee_documents (expiry_date)
  WHERE deleted_at IS NULL AND expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_documents_alive
  ON employee_documents (employee_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
