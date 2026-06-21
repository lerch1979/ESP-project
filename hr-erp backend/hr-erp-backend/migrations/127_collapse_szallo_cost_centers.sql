-- Migration 127: Option A — collapse the per-accommodation "szálló" cost
-- centers into the single generic OPR-SZALL, and harden the
-- accommodation_expenses FK against accidental history loss.
--
-- WHY: per-accommodation operating-cost reporting is driven by
-- accommodation_expenses.accommodation_id (a live, NOT NULL FK to the
-- accommodations table), NOT by cost_centers. The ~18 "szálló" cost centers
-- (OPR-SZALL-* leaves: OPR-SZALL-HS-BELED, -FERTD, ...; OPR-SZALL-BP101/202
-- + their utility sub-nodes) mirrored accommodations by NAME with no FK and
-- no sync job → silent staleness when an accommodation is added/renamed/
-- closed. They carry ZERO accommodation_expenses rows today; only
-- invoice_classification_rules referenced them.
--
-- This is reversible in spirit: the szálló cost centers are soft-retired
-- (is_active=false), not deleted, so history/audit is preserved.

BEGIN;

-- 1. Re-point classification rules from any per-accommodation szálló CC to
--    the generic OPR-SZALL. Each rule's settlement_name is left intact — it
--    is exactly the signal the future OCR→accommodation matcher will reuse.
UPDATE invoice_classification_rules r
   SET cost_center_id = g.id
  FROM cost_centers g, cost_centers s
 WHERE g.code = 'OPR-SZALL'
   AND s.id = r.cost_center_id
   AND s.code LIKE 'OPR-SZALL-%';

-- 2. Defensive: re-point any expense that points at a szálló CC to the
--    generic one (currently zero rows match — belt-and-suspenders).
UPDATE accommodation_expenses e
   SET cost_center_id = g.id
  FROM cost_centers g, cost_centers s
 WHERE g.code = 'OPR-SZALL'
   AND s.id = e.cost_center_id
   AND s.code LIKE 'OPR-SZALL-%';

-- 3. Soft-retire the per-accommodation szálló cost centers: drop them from
--    active pickers (is_active=false) while keeping the rows for audit.
--    OPR-SZALL itself (the generic "Szálláshelyek") is kept active.
UPDATE cost_centers
   SET is_active = false, updated_at = CURRENT_TIMESTAMP
 WHERE code LIKE 'OPR-SZALL-%'
   AND code <> 'OPR-SZALL';

-- 4. SAFETY: closing an accommodation must never wipe its expense history.
--    Today the app only soft-deletes (accommodations.is_active=false), so the
--    cascade never fires — but the FK was ON DELETE CASCADE, a latent footgun
--    where a hard DELETE would cascade-delete accommodation_expenses. Switch
--    it to ON DELETE RESTRICT so a hard delete is blocked while expenses
--    exist; history is guaranteed to survive an accommodation close.
ALTER TABLE accommodation_expenses
  DROP CONSTRAINT accommodation_expenses_accommodation_id_fkey,
  ADD  CONSTRAINT accommodation_expenses_accommodation_id_fkey
       FOREIGN KEY (accommodation_id) REFERENCES accommodations(id) ON DELETE RESTRICT;

COMMIT;
