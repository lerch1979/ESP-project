-- Migration 116: invoice_drafts.performance_date
--
-- HU VAT law uses teljesítés dátum (performance date), not invoice
-- issue date, for ÁFA period. Our accommodation_expenses already has
-- performance_date (migration 113); the OCR side was a gap — the
-- Claude prompt extracted invoiceDate + dueDate but never the
-- teljesítés date that shares the PDF face with them.
--
-- Decision (2026-05-21 session, just before Gmail poller reactivation):
--   • Single nullable DATE column. No backfill — the 5 historical
--     drafts were OCR'd against the old prompt and won't have it
--     until re-OCR'd.
--   • No CHECK constraint — invoice_date doesn't have one either,
--     and OCR mis-reads should be caught by the human reviewer in
--     the convert dialog, not by Postgres.

ALTER TABLE invoice_drafts
  ADD COLUMN IF NOT EXISTS performance_date DATE;
