-- Migration 115: Wire invoice_drafts → accommodation_expenses conversion
--
-- Day-3 plan from 2026-05-21. The 5 stale drafts (one is a dup of
-- another, so really 4) sitting in invoice_drafts since the dormant
-- AI pipeline last touched them on 2026-04-21 need a manual review
-- path: human opens each, picks accommodation + category + amount,
-- saves. On save we want to remember WHICH expense the draft became.
--
-- Decisions (locked in 2026-05-21 session):
--   • No data migration — drafts stay where they are. The conversion
--     happens row-by-row through a new UI tab + POST /:id/convert
--     endpoint, which:
--       1. creates an accommodation_expenses row from the dialog
--       2. copies the PDF from invoice_drafts.pdf_file_path → the
--          new expense's file_attachments via the storage adapter
--       3. updates this draft to status='converted', final_expense_id
--     Single transaction, idempotent (re-converting returns 409 with
--     the existing final_expense_id).
--   • status CHECK constraint added now (no existing one — enforced
--     only at controller level until today). Set covers what the
--     existing code already emits: pending / approved / rejected /
--     ocr_failed — plus the new 'converted'.

-- ════════════════════════════════════════════════════════════════════
-- 1. final_expense_id link
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE invoice_drafts
  ADD COLUMN IF NOT EXISTS final_expense_id UUID
    REFERENCES accommodation_expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_drafts_final_expense
  ON invoice_drafts(final_expense_id)
  WHERE final_expense_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════
-- 2. status CHECK constraint (idempotent)
-- ════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_drafts_status_check') THEN
    ALTER TABLE invoice_drafts
      ADD CONSTRAINT invoice_drafts_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'ocr_failed', 'converted'));
  END IF;
END $$;
