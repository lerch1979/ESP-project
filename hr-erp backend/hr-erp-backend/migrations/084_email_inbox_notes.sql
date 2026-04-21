-- Migration 084: Add notes column to email_inbox (ADDITIVE ONLY)
--
-- Why: the classification engine matches settlement and keyword rules against
-- an admin-authored "notes" field (NOT against the OCR text), because our
-- office address is in Fertőd so Fertőd appears in most invoices' OCR text
-- and would cause false classification. The admin types e.g. "Beled szálló
-- 2026 április rezsi" in notes; the classifier then finds "Beled" in the
-- notes and assigns the correct cost center.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='email_inbox' AND column_name='notes') THEN
    ALTER TABLE email_inbox ADD COLUMN notes TEXT;
  END IF;
END $$;

COMMIT;
