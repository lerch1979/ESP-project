-- 136: Room-hygiene house-rule fine — runtime config (independent toggle).
--
-- Business rule (házirend): if a room's hygiene is rated FAILING on N consecutive
-- completed inspections, a fine applies (default 2 × failing → 10,000 Ft/resident,
-- fine type HOUSE_RULES). This is OUR process and is switchable INDEPENDENTLY of
-- the mothballed salary-deduction executor (DEDUCTION_EXECUTION_ENABLED). It only
-- creates the debt record via the normal fine flow (compensations + notification);
-- it NEVER writes compensation_payments and NEVER executes a deduction.
--
-- Mirrors the expiry-monitor config pattern: a singleton row, admin-editable,
-- read fresh each run. Default OFF (no behavior change on deploy).
--
-- Numbered 136 (not 133) to avoid colliding with the sandbox-only consolidation
-- branch migrations 133–135, which are not on main/prod.

CREATE TABLE IF NOT EXISTS hygiene_fine_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,        -- ship OFF; admin enables
  consecutive_fails INTEGER NOT NULL DEFAULT 2,            -- how many consecutive failing inspections trigger it
  fail_hygiene_max  INTEGER NOT NULL DEFAULT 15,           -- a room_inspection hygiene_score <= this counts as FAILING
  fine_amount       NUMERIC NOT NULL DEFAULT 10000,        -- per resident (HUF)
  fine_type_code    VARCHAR(40) NOT NULL DEFAULT 'HOUSE_RULES',
  updated_by        UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hygiene_fine_config_consecutive_chk CHECK (consecutive_fails >= 1),
  CONSTRAINT hygiene_fine_config_amount_chk CHECK (fine_amount >= 0)
);

-- Singleton config row with defaults (idempotent).
INSERT INTO hygiene_fine_config (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM hygiene_fine_config);
