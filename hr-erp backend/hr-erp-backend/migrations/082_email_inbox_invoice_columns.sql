-- Migration 082: Dedicated invoice columns on email_inbox (ADDITIVE ONLY)
--
-- Why: extracted_data JSONB holds all invoice fields, but SQL reporting and
-- admin-UI filtering (e.g. "show all invoices from vendor X with gross > Y
-- between date A and B") is awkward through ->>/->-.
-- This migration denormalizes the stable fields into typed columns, and
-- backfills from existing JSONB so the 5 invoices already in email_inbox
-- become queryable immediately.
--
-- Safety:
-- - All ALTER TABLE guarded via information_schema (idempotent, re-runnable).
-- - No data removed, no constraints added that could reject existing rows.
-- - Single transaction.
-- - Backfill only UPDATEs rows where the JSONB key exists — other rows stay NULL.

BEGIN;

-- ── Columns ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='invoice_number') THEN
    ALTER TABLE email_inbox ADD COLUMN invoice_number VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='invoice_date') THEN
    ALTER TABLE email_inbox ADD COLUMN invoice_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='due_date') THEN
    ALTER TABLE email_inbox ADD COLUMN due_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='vendor_name') THEN
    ALTER TABLE email_inbox ADD COLUMN vendor_name VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='vendor_tax_number') THEN
    ALTER TABLE email_inbox ADD COLUMN vendor_tax_number VARCHAR(32);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='net_amount') THEN
    ALTER TABLE email_inbox ADD COLUMN net_amount DECIMAL(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='vat_amount') THEN
    ALTER TABLE email_inbox ADD COLUMN vat_amount DECIMAL(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='gross_amount') THEN
    ALTER TABLE email_inbox ADD COLUMN gross_amount DECIMAL(15,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='currency') THEN
    ALTER TABLE email_inbox ADD COLUMN currency VARCHAR(10);
  END IF;
END $$;

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_email_inbox_invoice_number ON email_inbox(invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_inbox_invoice_date   ON email_inbox(invoice_date)   WHERE invoice_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_inbox_vendor_name    ON email_inbox(vendor_name)    WHERE vendor_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_inbox_gross_amount   ON email_inbox(gross_amount)   WHERE gross_amount IS NOT NULL;

-- ── Backfill from existing extracted_data JSONB ─────────────────────
-- Only UPDATEs rows where the JSONB key is non-null AND the column is currently
-- NULL (so re-running this migration doesn't clobber edits made after initial
-- backfill). Uses safe casts via regex checks to avoid errors on weird values.
UPDATE email_inbox SET
  invoice_number = CASE WHEN invoice_number IS NULL AND extracted_data->>'invoiceNumber' <> ''
                        THEN extracted_data->>'invoiceNumber' ELSE invoice_number END,
  vendor_name = CASE WHEN vendor_name IS NULL AND extracted_data->>'vendorName' <> ''
                     THEN LEFT(extracted_data->>'vendorName', 255) ELSE vendor_name END,
  vendor_tax_number = CASE WHEN vendor_tax_number IS NULL AND extracted_data->>'vendorTaxNumber' <> ''
                           THEN LEFT(extracted_data->>'vendorTaxNumber', 32) ELSE vendor_tax_number END,
  currency = CASE WHEN currency IS NULL AND extracted_data->>'currency' <> ''
                  THEN extracted_data->>'currency' ELSE currency END,
  invoice_date = CASE WHEN invoice_date IS NULL
                       AND (extracted_data->>'invoiceDate') ~ '^\d{4}-\d{2}-\d{2}$'
                       THEN (extracted_data->>'invoiceDate')::DATE ELSE invoice_date END,
  due_date = CASE WHEN due_date IS NULL
                   AND (extracted_data->>'dueDate') ~ '^\d{4}-\d{2}-\d{2}$'
                   THEN (extracted_data->>'dueDate')::DATE ELSE due_date END,
  net_amount = CASE WHEN net_amount IS NULL
                     AND (extracted_data->>'netAmount') ~ '^-?\d+(\.\d+)?$'
                     THEN (extracted_data->>'netAmount')::NUMERIC ELSE net_amount END,
  vat_amount = CASE WHEN vat_amount IS NULL
                     AND (extracted_data->>'vatAmount') ~ '^-?\d+(\.\d+)?$'
                     THEN (extracted_data->>'vatAmount')::NUMERIC ELSE vat_amount END,
  gross_amount = CASE WHEN gross_amount IS NULL
                       AND (extracted_data->>'grossAmount') ~ '^-?\d+(\.\d+)?$'
                       THEN (extracted_data->>'grossAmount')::NUMERIC ELSE gross_amount END
WHERE extracted_data IS NOT NULL
  AND document_type = 'invoice';

COMMIT;
