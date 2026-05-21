-- Migration 113: accommodation_expenses Phase-2 schema
-- Adds vendor / invoice metadata, performance_date (HU teljesítés dátum,
-- required by VAT period rules), dedup_fingerprint + pg_trgm fuzzy match,
-- file attachments, cost_center_id link (Option B from the cost-tracking
-- decision doc: data layer = accommodation_expenses, taxonomy layer =
-- cost_centers, automation layer = AI/email pipeline), source/status/approval
-- + payment tracking.
--
-- Decisions encoded (2026-05-21 session):
--   1. performance_date stays NULLABLE here. Required at the model layer
--      for new manual entries; we'll add NOT NULL in a later migration once
--      the legacy invoice_drafts → accommodation_expenses migration (Day 3)
--      has filled in values for the 5 stale drafts.
--   2. dedup_fingerprint is NOT unique — duplicates are surfaced as warnings
--      with an audit-logged override path, never as hard inserts errors.
--   3. cost_center_id is ON DELETE SET NULL: deleting a cost_center should
--      orphan the link, never cascade-destroy expense data.
--   4. source enum: 'manual' | 'ai' | 'email_ocr' | 'import' — open set,
--      enforced via CHECK so additions need a migration.
--   5. status enum: 'pending_review' | 'confirmed' | 'rejected' — defaults
--      to 'confirmed' so existing manual flow is unchanged.
--   6. Backfill of existing 3 rows: performance_date = billing_month::date
--      + (day=01). dedup_fingerprint left NULL — will populate on next
--      update via the service, or via the audit sweep.
--   7. pg_trgm extension + GIN index on lower(vendor_name) — for fuzzy
--      vendor matching in the deduplication service.

-- ════════════════════════════════════════════════════════════════════
-- 1. Extensions
-- ════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ════════════════════════════════════════════════════════════════════
-- 2. Vendor / invoice metadata
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS vendor_name       TEXT,
  ADD COLUMN IF NOT EXISTS vendor_tax_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS invoice_number    VARCHAR(100);


-- ════════════════════════════════════════════════════════════════════
-- 3. Dates — performance_date is the HU accounting "teljesítés dátum"
--    used for VAT period and accountant package filtering.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS performance_date DATE,
  ADD COLUMN IF NOT EXISTS invoice_date     DATE;


-- ════════════════════════════════════════════════════════════════════
-- 4. Deduplication fingerprint (not unique — warn + override pattern)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT;


-- ════════════════════════════════════════════════════════════════════
-- 5. File attachments (JSONB array of {filename, path, mime, size, uploaded_at})
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS file_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;


-- ════════════════════════════════════════════════════════════════════
-- 6. Cost-center taxonomy link (Option B)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS cost_center_id UUID
    REFERENCES cost_centers(id) ON DELETE SET NULL;


-- ════════════════════════════════════════════════════════════════════
-- 7. Provenance / workflow (source + status + approval)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS source        VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ai_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS status        VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMP;


-- ════════════════════════════════════════════════════════════════════
-- 8. Payment tracking
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS payment_date   DATE,
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid';


-- ════════════════════════════════════════════════════════════════════
-- 9. Constraints (idempotent — drop+recreate via DO block)
-- ════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_exp_source_check') THEN
    ALTER TABLE accommodation_expenses
      ADD CONSTRAINT acc_exp_source_check
      CHECK (source IN ('manual', 'ai', 'email_ocr', 'import'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_exp_status_check') THEN
    ALTER TABLE accommodation_expenses
      ADD CONSTRAINT acc_exp_status_check
      CHECK (status IN ('pending_review', 'confirmed', 'rejected'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_exp_payment_status_check') THEN
    ALTER TABLE accommodation_expenses
      ADD CONSTRAINT acc_exp_payment_status_check
      CHECK (payment_status IN ('unpaid', 'paid', 'partial'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_exp_ai_confidence_range') THEN
    ALTER TABLE accommodation_expenses
      ADD CONSTRAINT acc_exp_ai_confidence_range
      CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 100));
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- 10. Indexes
-- ════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_acc_exp_performance_date
  ON accommodation_expenses(performance_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_acc_exp_dedup
  ON accommodation_expenses(dedup_fingerprint)
  WHERE deleted_at IS NULL AND dedup_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acc_exp_cost_center
  ON accommodation_expenses(cost_center_id)
  WHERE deleted_at IS NULL AND cost_center_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acc_exp_status
  ON accommodation_expenses(status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_acc_exp_source
  ON accommodation_expenses(source)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_acc_exp_payment_status
  ON accommodation_expenses(payment_status)
  WHERE deleted_at IS NULL;

-- Fuzzy vendor matching (trigram on lower(vendor_name))
CREATE INDEX IF NOT EXISTS idx_acc_exp_vendor_trgm
  ON accommodation_expenses USING gin (lower(vendor_name) gin_trgm_ops)
  WHERE deleted_at IS NULL AND vendor_name IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════
-- 11. Backfill — existing rows get performance_date = billing_month + '-01'
--      so accountant filtering doesn't drop them. dedup_fingerprint left
--      NULL on backfill; the service will populate on next update or via
--      the audit sweep.
-- ════════════════════════════════════════════════════════════════════
UPDATE accommodation_expenses
   SET performance_date = (billing_month || '-01')::date
 WHERE performance_date IS NULL
   AND billing_month ~ '^\d{4}-\d{2}$';
