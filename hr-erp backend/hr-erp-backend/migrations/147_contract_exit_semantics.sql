-- 147: separate FINANCIAL exit from LEGAL exit on contracts.
--
-- THE DISTINCTION
-- ---------------
-- "When can we get out of this site?" has two different answers, and conflating them
-- misprices a decision.
--
--   FINANCIAL exit — when the COST stops.
--     Under a per-actual-use contract with NO minimum guarantee (Barcza / Sarród I.:
--     2 200 Ft/fő/éj, no minimum headcount), we stop paying by moving people out. No
--     termination required, no notice served, cost reaches zero immediately. The notice
--     period does not gate our exposure at all.
--
--   LEGAL exit — when the RELATIONSHIP ends = today + notice_days.
--     Still matters even when cost is already zero: handover condition, house rules and
--     liability survive until the contract ends, and notice runs BOTH WAYS — the
--     landlord may terminate on the same period, which is our risk, not theirs.
--
-- For a fixed rent, or a per-use contract WITH a minimum, the two coincide: the cost
-- runs until the notice period expires. That is the case where the notice date is the
-- number that matters.
--
-- WHAT THIS MIGRATION ADDS
-- ------------------------
-- The cost side had no way to express a minimum at all (the REVENUE side has had
-- occupancy_floor_pct / contracted_beds since mig 141, but what we PAY had nothing), so
-- "per-use with no minimum" was not a derivable fact. Two nullable minimum columns on
-- the effective-dated cost rate make it derivable, and they sit on the RATE rather than
-- the accommodation because a minimum is a term of the current agreement and changes
-- with an amendment — exactly like the rate itself.
--
-- ⚠️ SCOPE LIMIT, DELIBERATE: these minimum columns are CLASSIFICATION ONLY. The
-- billing engine does NOT yet enforce a minimum when computing cost, so setting one
-- records the contractual fact but does not floor the monthly figure. No current
-- contract has a minimum, so nothing is mispriced today — but do not set one and assume
-- it is billed. Logged as tech debt; enforcing it is a billing change that deserves its
-- own round with its own tests.

BEGIN;

-- ── minimums on the cost rate (classification input) ────────────────────────
ALTER TABLE accommodation_rent_rates
  ADD COLUMN IF NOT EXISTS min_bed_nights     integer,
  ADD COLUMN IF NOT EXISTS min_monthly_amount numeric(14,2);

ALTER TABLE accommodation_rent_rates DROP CONSTRAINT IF EXISTS arr_min_nonneg_chk;
ALTER TABLE accommodation_rent_rates ADD CONSTRAINT arr_min_nonneg_chk
  CHECK (COALESCE(min_bed_nights, 0) >= 0 AND COALESCE(min_monthly_amount, 0) >= 0);

COMMENT ON COLUMN accommodation_rent_rates.min_bed_nights IS
  'Garantált minimum ágyéjszaka/hó, amit akkor is fizetünk, ha ennyien nincsenek bent. NULL = nincs minimum → a költség kiköltöztetéssel nullára vihető. FIGYELEM: a billing engine jelenleg NEM érvényesíti (csak besoroláshoz használt) — lásd mig 147 fejléc.';
COMMENT ON COLUMN accommodation_rent_rates.min_monthly_amount IS
  'Garantált minimum havi díj. NULL = nincs. Ugyanaz a figyelmeztetés, mint a min_bed_nights-nál.';

-- ── explicit override on the contract ───────────────────────────────────────
-- Derivation covers a lease, because a lease names the property whose cost basis we can
-- read. A megbízó or alvállalkozó contract has no accommodation and therefore no cost
-- basis to reason about, and some real agreements will simply not match the rule. NULL
-- means "derive"; a value states the answer outright.
ALTER TABLE partner_contracts
  ADD COLUMN IF NOT EXISTS financial_exit varchar(16);

ALTER TABLE partner_contracts DROP CONSTRAINT IF EXISTS partner_contracts_financial_exit_chk;
ALTER TABLE partner_contracts ADD CONSTRAINT partner_contracts_financial_exit_chk
  CHECK (financial_exit IS NULL OR financial_exit IN ('immediate','notice'));

COMMENT ON COLUMN partner_contracts.financial_exit IS
  'Mikor SZŰNIK MEG a költség. NULL = származtatva a bérleti díj alapjából + minimumból (per_bed_night és nincs minimum → azonnal; egyébként a felmondási idő végén). immediate | notice = kézi felülbírálás.';

COMMIT;
