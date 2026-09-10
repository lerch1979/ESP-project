-- 156: teljesítés dátuma on invoices, and the one existing EUR invoice booked properly.
--
-- WHY invoice_date IS NOT GOOD ENOUGH
-- ----------------------------------
-- The MNB rate rule keys on the PERFORMANCE date, and for domestic forint invoices the
-- distinction never bit: invoice_date was close enough because no conversion depended on
-- it. With foreign-currency invoices it stops being cosmetic — a service performed in
-- September and invoiced in October converts at two different rates, and picking the
-- wrong one misstates the cost by whatever the forint did in between.
--
-- accommodation_expenses already carries performance_date and always has (mig 113); this
-- brings invoices to the same shape, so one rule — "convert at the rate published for the
-- performance date" — covers both tables instead of each having its own convention.
--
-- BACKFILLED TO invoice_date, DELIBERATELY
-- ----------------------------------------
-- Every existing row gets performance_date = invoice_date. That is what the system has
-- effectively assumed until now, so nothing changes value; the column simply makes the
-- assumption explicit and overridable from here on. NOT NULL is deliberately NOT set:
-- an OCR-imported invoice may genuinely not state one, and a fabricated date is worse
-- than an absent one.

BEGIN;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS performance_date date;

UPDATE invoices SET performance_date = invoice_date
 WHERE performance_date IS NULL AND invoice_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_performance_date
  ON invoices (performance_date) WHERE deleted_at IS NULL;

COMMENT ON COLUMN invoices.performance_date IS
  'Teljesítés dátuma. Deviza számlánál EZ dönti el, melyik napi MNB középárfolyamon könyvelünk — nem a számla kelte. Meglévő soroknál invoice_date-re töltve (mig 156), onnantól explicit.';

-- ── the one existing EUR invoice ────────────────────────────────────────────
-- Hetzner Online GmbH, 088001131139, 22,28 EUR. Számla kelte = teljesítés = fizetés =
-- 2026-09-01, tehát nincs mit értelmezni: az aznap közzétett MNB középárfolyam 366,66.
--
-- `amount` becomes the FORINT value, matching accommodation_expenses and everything that
-- sums these columns. Until now the cost-centre summary trigger was adding 22,28 to a
-- forint total — an invoice worth 8 169 Ft counted as twenty-two forints.
UPDATE invoices
   SET original_amount    = 22.28,
       original_currency  = 'EUR',
       exchange_rate      = 366.66,
       exchange_rate_date = DATE '2026-09-01',
       rate_status        = 'ok',
       amount             = ROUND(22.28 * 366.66, 2),
       total_amount       = ROUND(22.28 * 366.66, 2)
 WHERE invoice_number = ' 088001131139'
   AND upper(btrim(currency)) = 'EUR';

COMMIT;
