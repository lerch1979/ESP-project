-- Migration 114: VAT (ÁFA) handling on accommodation_expenses
--
-- Adds Hungarian VAT support so the accountant package can produce
-- proper monthly VAT analytics (teljesítés-period based) and so the
-- AI/OCR pipeline (Phase 3) can populate net/VAT extracted from
-- invoices.
--
-- Decisions encoded (2026-05-21 session):
--   1. `amount` stays the authoritative gross (bruttó). No new
--      gross_amount column — that would just duplicate `amount`
--      forever with drift risk. Service auto-fills net + vat from
--      gross + vat_rate when only the rate is provided.
--   2. vat_rate stored as DECIMAL(5,2) with a LOOSE 0-100 sanity
--      check. We do NOT hard-code the legal rates (27/18/5/0) — EU
--      rates change and we don't want a migration every time.
--   3. AAM (alanyi adómentes) and "tárgyi mentes" are NOT 0% VAT in
--      Hungarian tax law — they're exemption statuses. Separate
--      column vat_exemption_reason captures them. UI dropdown
--      enforces consistency; no DB CHECK so the set can grow.
--   4. is_reverse_vat (fordított adózás) handles construction +
--      some materials where the buyer accounts for both input and
--      output VAT. Default FALSE for the 99% case.
--   5. net_amount + vat_amount must be either BOTH set or BOTH null
--      (no half-state). Validated at the model layer with a clean
--      400; CHECK constraint catches accidental direct writes.
--   6. Existing rows are NOT backfilled — net/vat/rate stay NULL.
--      Service will fill them next time the row is updated AND a
--      vat_rate is provided. The accountant package treats NULL VAT
--      rows as "VAT data missing — see notes".


-- ════════════════════════════════════════════════════════════════════
-- 1. Columns
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS net_amount           DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS vat_rate             DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS vat_amount           DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS vat_exemption_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_reverse_vat       BOOLEAN NOT NULL DEFAULT FALSE;


-- ════════════════════════════════════════════════════════════════════
-- 2. Constraints (idempotent — guarded by NOT EXISTS lookup)
-- ════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  -- Sanity: 0 ≤ vat_rate ≤ 100. NULL is allowed (legacy / quick entry).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_exp_vat_rate_range') THEN
    ALTER TABLE accommodation_expenses
      ADD CONSTRAINT acc_exp_vat_rate_range
      CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));
  END IF;

  -- net + vat must be either both set or both null — no half state.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_exp_vat_split_consistency') THEN
    ALTER TABLE accommodation_expenses
      ADD CONSTRAINT acc_exp_vat_split_consistency
      CHECK ((net_amount IS NULL) = (vat_amount IS NULL));
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ════════════════════════════════════════════════════════════════════
-- Filter "show me all VAT-exempt invoices" — niche but cheap.
CREATE INDEX IF NOT EXISTS idx_acc_exp_vat_exemption
  ON accommodation_expenses(vat_exemption_reason)
  WHERE deleted_at IS NULL AND vat_exemption_reason IS NOT NULL;

-- Reverse-charge analytics — narrow index (most rows are FALSE).
CREATE INDEX IF NOT EXISTS idx_acc_exp_reverse_vat
  ON accommodation_expenses(is_reverse_vat)
  WHERE deleted_at IS NULL AND is_reverse_vat = TRUE;
