-- 155: foreign-currency expenses and invoices, booked at the MNB középárfolyam of the
--      PERFORMANCE date.
--
-- THE RULE THIS EXISTS TO ENFORCE
-- ------------------------------
-- A historical cost must always show the HUF value it was BOOKED at. Recomputing an old
-- expense from today's rate would silently restate a closed month every time the forint
-- moves — the same class of error as re-billing a finalized month, which the month-lock
-- (mig 148) exists to prevent. So the rate is a STORED FACT on the record, never a
-- lookup at read time.
--
-- WHY amount STAYS THE HUF VALUE
-- ------------------------------
-- Every consumer — billingEngine, profit.service, operatingCosts, the settlement sheets,
-- every report — already reads `amount` and assumes forint. Repurposing it to mean "the
-- number the user typed, in whatever currency" would change all of them at once, in a
-- system where money is the thing you least want to be quietly wrong. So `amount` keeps
-- its meaning and the ORIGINAL is recorded alongside it. Nothing downstream changes
-- behaviour; a HUF-only record is byte-identical to what it was before.
--
-- rate_status IS THE HONEST THIRD STATE
-- -------------------------------------
-- MNB can be unreachable. The choice is then: block the save (loses the user's work),
-- guess a rate (silently wrong money), or record the original and admit the HUF value is
-- not yet known. Only the third is defensible, so `rate_status = 'missing'` is a real
-- state the month-close refuses to close over — visible and actionable, never skipped.

BEGIN;

-- ── the rate cache: one row per (currency, date) ─────────────────────────────
-- Kept as its own table rather than columns on the expense, because a disputed figure is
-- settled by "what did MNB publish that day", which must be answerable independently of
-- any one record — and because one fetched rate serves every expense on that date.
CREATE TABLE IF NOT EXISTS mnb_exchange_rates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency     varchar(3) NOT NULL,
  rate_date    date       NOT NULL,      -- the date MNB PUBLISHED this rate
  rate         numeric(18,6) NOT NULL,   -- 1 unit of `currency` = `rate` HUF
  unit         integer    NOT NULL DEFAULT 1,  -- MNB quotes some currencies per 100
  source       varchar(24) NOT NULL DEFAULT 'MNB',
  fetched_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mnb_rates_uniq UNIQUE (currency, rate_date),
  CONSTRAINT mnb_rates_positive CHECK (rate > 0 AND unit > 0)
);
CREATE INDEX IF NOT EXISTS idx_mnb_rates_lookup ON mnb_exchange_rates (currency, rate_date DESC);

COMMENT ON TABLE mnb_exchange_rates IS
  'MNB középárfolyam gyorsítótár. rate_date = amelyik napra az MNB KÖZZÉTETTE az árfolyamot (hétvégén/ünnepnapon nincs közzététel, ilyenkor a korábbi nap árfolyamát használjuk, és EZT a dátumot tároljuk a tételen).';

-- ── currency on the expense ─────────────────────────────────────────────────
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS original_amount    numeric(15,2),
  ADD COLUMN IF NOT EXISTS original_currency  varchar(3),
  ADD COLUMN IF NOT EXISTS exchange_rate      numeric(18,6),
  ADD COLUMN IF NOT EXISTS exchange_rate_date date,
  ADD COLUMN IF NOT EXISTS rate_status        varchar(12) NOT NULL DEFAULT 'not_needed';

ALTER TABLE accommodation_expenses DROP CONSTRAINT IF EXISTS acc_exp_rate_status_chk;
ALTER TABLE accommodation_expenses ADD CONSTRAINT acc_exp_rate_status_chk
  CHECK (rate_status IN ('not_needed','ok','missing'));

-- A foreign-currency row must carry its original; a HUF row must not pretend to.
ALTER TABLE accommodation_expenses DROP CONSTRAINT IF EXISTS acc_exp_fx_shape_chk;
ALTER TABLE accommodation_expenses ADD CONSTRAINT acc_exp_fx_shape_chk
  CHECK (
    (rate_status = 'not_needed' AND original_currency IS NULL AND exchange_rate IS NULL)
    OR (rate_status = 'ok'      AND original_currency IS NOT NULL AND original_amount IS NOT NULL
                                AND exchange_rate IS NOT NULL AND exchange_rate_date IS NOT NULL)
    -- 'missing' is the honest state: we know WHAT was spent, not yet its forint value.
    OR (rate_status = 'missing' AND original_currency IS NOT NULL AND original_amount IS NOT NULL
                                AND exchange_rate IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_acc_exp_rate_missing
  ON accommodation_expenses (billing_month) WHERE rate_status = 'missing' AND deleted_at IS NULL;

COMMENT ON COLUMN accommodation_expenses.amount IS
  'A könyvelt FORINT érték. Deviza tétel esetén = original_amount * exchange_rate. MINDEN összesítés, profit és riport EZT olvassa — sosem számoljuk újra mai árfolyammal.';
COMMENT ON COLUMN accommodation_expenses.rate_status IS
  'not_needed = forintos tétel · ok = van tárolt árfolyam · missing = deviza tétel árfolyam nélkül (MNB nem volt elérhető). A hónapzárás missing tétel mellett NEM engedélyezett.';

-- ── same shape on invoices ──────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS original_amount    numeric(15,2),
  ADD COLUMN IF NOT EXISTS original_currency  varchar(3),
  ADD COLUMN IF NOT EXISTS exchange_rate      numeric(18,6),
  ADD COLUMN IF NOT EXISTS exchange_rate_date date,
  ADD COLUMN IF NOT EXISTS rate_status        varchar(12) NOT NULL DEFAULT 'not_needed';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_rate_status_chk;
ALTER TABLE invoices ADD CONSTRAINT invoices_rate_status_chk
  CHECK (rate_status IN ('not_needed','ok','missing'));

-- ── backfill: everything that exists today is forint ─────────────────────────
UPDATE accommodation_expenses SET rate_status = 'not_needed'
 WHERE rate_status IS NULL OR (currency IS NULL OR upper(btrim(currency)) = 'HUF');

-- The one existing EUR invoice is deliberately left as 'missing' rather than guessed:
-- it needs a human to confirm which rate applies. The feature reports it.
UPDATE invoices SET rate_status = 'missing',
       original_currency = upper(btrim(currency)),
       original_amount = COALESCE(total_amount, amount)
 WHERE currency IS NOT NULL AND upper(btrim(currency)) <> 'HUF';

COMMIT;
