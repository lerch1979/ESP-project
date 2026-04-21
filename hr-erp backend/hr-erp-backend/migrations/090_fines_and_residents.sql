-- Migration 090: Refined Part C — fines vs damages, per-resident allocation
--
-- Model shift: compensations now have an explicit `type`:
--   - 'fine'   : fixed amount per violation × residents, payable IMMEDIATELY
--                (on-site cash/card), categorised via fine_types catalog
--   - 'damage' : actual repair cost; 30-day deadline; auto-converts to
--                salary_deduction if unpaid (no "unpaid" terminal state)
--
-- Additive: keeps 088/089 behaviour intact — existing data is back-filled
-- with type='damage' (which is how it behaved before). Adds new tables
-- for fine catalog + per-resident allocation with signature capture, and
-- widens the CHECK constraints to cover the new status + payment_method
-- vocabulary.
--
-- Idempotent; safe to re-run.

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. fine_types — admin-maintained catalog of fixed fine categories
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fine_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  amount_per_person NUMERIC(12,2) NOT NULL CHECK (amount_per_person >= 0),
  description TEXT,
  category VARCHAR(50), -- 'house_rules' | 'cleaning' | 'behavior' | 'other'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fine_types_active   ON fine_types(is_active);
CREATE INDEX IF NOT EXISTS idx_fine_types_category ON fine_types(category);

-- Seeds — no-ops on re-run thanks to ON CONFLICT.
INSERT INTO fine_types (code, name, amount_per_person, description, category)
VALUES
  ('HOUSE_RULES',      'Házirend megsértése',       10000, 'Belső házirend megsértése (általános)', 'house_rules'),
  ('CLEANING_NEGLECT', 'Takarítás elmulasztása',    10000, 'A szobában rendszeresen nem tartják be a takarítási kötelezettséget', 'cleaning'),
  ('NOISE_COMPLAINT',  'Zajszennyezés',              5000, 'Csendes órákban történő zajkeltés', 'behavior'),
  ('SMOKING_INDOOR',   'Dohányzás tilos helyen',    15000, 'Dohányzás a nem-dohányzó területen', 'house_rules'),
  ('LATE_RETURN',      'Késői hazaérkezés',          5000, 'Hazaérkezés a megengedett idő után', 'house_rules')
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- 2. Extend `compensations` with type/fine_type_id/damage_details
-- ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='compensations' AND column_name='type') THEN
    ALTER TABLE compensations
      ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'damage'
        CHECK (type IN ('fine','damage')),
      ADD COLUMN fine_type_id UUID REFERENCES fine_types(id) ON DELETE SET NULL,
      ADD COLUMN damage_details JSONB,
      ADD COLUMN payment_method VARCHAR(50),
      ADD COLUMN pdf_path VARCHAR(500),
      ADD COLUMN issued_date DATE;
  END IF;
END $$;

-- Back-fill issued_date from existing issued_at for historical rows.
UPDATE compensations SET issued_date = issued_at::date
WHERE issued_date IS NULL AND issued_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compensations_type_new ON compensations(type);

-- Widen status column + CHECK to admit the new lifecycle values. The new
-- values (salary_deduction_active/_completed/_pending) exceed the old
-- varchar(20) cap, so expand to varchar(40) first.
ALTER TABLE compensations ALTER COLUMN status TYPE VARCHAR(40);
ALTER TABLE compensations DROP CONSTRAINT IF EXISTS compensations_status_check;
ALTER TABLE compensations
  ADD CONSTRAINT compensations_status_check
  CHECK (status IN (
    'draft','issued','notified','disputed','partial_paid','paid','waived',
    'escalated','closed','paid_on_site',
    'salary_deduction_pending','salary_deduction_active','salary_deduction_completed'
  ));

-- ────────────────────────────────────────────────────────────────────
-- 3. compensation_residents — per-resident allocation with signatures
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compensation_residents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compensation_id UUID NOT NULL REFERENCES compensations(id) ON DELETE CASCADE,
  resident_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resident_name VARCHAR(200) NOT NULL,
  resident_email VARCHAR(200),
  resident_phone VARCHAR(50),

  amount_assigned NUMERIC(12,2) NOT NULL CHECK (amount_assigned >= 0),
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),

  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','paid_on_site','salary_deduction','waived')),

  payment_method VARCHAR(50)
    CHECK (payment_method IS NULL OR payment_method IN (
      'on_site_cash','on_site_card','bank_transfer','salary_deduction','mixed','other'
    )),
  paid_at TIMESTAMP,

  -- Multi-month deduction plan attached to this resident's share
  salary_deduction_start   DATE,
  salary_deduction_monthly NUMERIC(12,2),
  salary_deduction_months  INTEGER CHECK (salary_deduction_months IS NULL OR salary_deduction_months > 0),

  -- On-site signature capture: base64 PNG from a signature pad
  signature_data TEXT,
  signed_at      TIMESTAMP,

  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_residents_compensation ON compensation_residents(compensation_id);
CREATE INDEX IF NOT EXISTS idx_comp_residents_resident     ON compensation_residents(resident_id);
CREATE INDEX IF NOT EXISTS idx_comp_residents_status       ON compensation_residents(status);

-- ────────────────────────────────────────────────────────────────────
-- 4. compensation_payments additions — link to per-resident row,
--    widen payment_method vocabulary, add receipt/payroll tracking.
-- ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='compensation_payments' AND column_name='compensation_resident_id') THEN
    ALTER TABLE compensation_payments
      ADD COLUMN compensation_resident_id UUID REFERENCES compensation_residents(id) ON DELETE SET NULL,
      ADD COLUMN payroll_period VARCHAR(20),  -- 'YYYY-MM'
      ADD COLUMN deduction_number INTEGER,
      ADD COLUMN receipt_number VARCHAR(100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comp_payments_resident_row ON compensation_payments(compensation_resident_id);

ALTER TABLE compensation_payments DROP CONSTRAINT IF EXISTS compensation_payments_method_check;
ALTER TABLE compensation_payments
  ADD CONSTRAINT compensation_payments_method_check
  CHECK (method IS NULL OR method IN (
    'cash','transfer','payroll_deduction','card','other',
    'on_site_cash','on_site_card','bank_transfer','salary_deduction'
  ));

-- ────────────────────────────────────────────────────────────────────
-- 5. salary_deductions — refined shape for per-resident allocations
-- ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salary_deductions' AND column_name='compensation_resident_id') THEN
    ALTER TABLE salary_deductions
      ADD COLUMN compensation_resident_id UUID REFERENCES compensation_residents(id) ON DELETE SET NULL,
      ADD COLUMN start_month VARCHAR(20),  -- 'YYYY-MM'
      ADD COLUMN end_month   VARCHAR(20),
      ADD COLUMN amount_deducted NUMERIC(12,2) DEFAULT 0;
  END IF;
END $$;

-- Rename legacy columns to the new vocabulary while preserving data.
-- amount_per_period → monthly_amount  (keep old col as generated alias)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salary_deductions' AND column_name='monthly_amount') THEN
    ALTER TABLE salary_deductions ADD COLUMN monthly_amount NUMERIC(12,2);
    UPDATE salary_deductions SET monthly_amount = amount_per_period WHERE monthly_amount IS NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salary_deductions' AND column_name='months_total') THEN
    ALTER TABLE salary_deductions ADD COLUMN months_total INTEGER;
    UPDATE salary_deductions SET months_total = periods_total WHERE months_total IS NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salary_deductions' AND column_name='months_completed') THEN
    ALTER TABLE salary_deductions ADD COLUMN months_completed INTEGER DEFAULT 0;
    UPDATE salary_deductions SET months_completed = periods_completed WHERE months_completed IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_salary_deductions_compensation_resident ON salary_deductions(compensation_resident_id);

-- ────────────────────────────────────────────────────────────────────
-- 5b. Rebuild sync_compensation_on_payment with widened local var
--     (old version had VARCHAR(20) which rejects 'salary_deduction_active'.)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_compensation_on_payment() RETURNS TRIGGER AS $$
DECLARE
  total_paid NUMERIC(12,2);
  gross      NUMERIC(12,2);
  cur_status VARCHAR(40);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM compensation_payments
  WHERE compensation_id = COALESCE(NEW.compensation_id, OLD.compensation_id);

  SELECT amount_gross, status INTO gross, cur_status
  FROM compensations
  WHERE id = COALESCE(NEW.compensation_id, OLD.compensation_id);

  IF cur_status IN ('waived','closed','salary_deduction_active','salary_deduction_completed') THEN
    UPDATE compensations
       SET amount_paid = total_paid, updated_at = NOW()
     WHERE id = COALESCE(NEW.compensation_id, OLD.compensation_id);
    RETURN NEW;
  END IF;

  UPDATE compensations
     SET amount_paid = total_paid,
         status = CASE
           WHEN total_paid >= gross AND gross > 0 THEN 'paid'
           WHEN total_paid > 0                     THEN 'partial_paid'
           ELSE status
         END,
         paid_at = CASE
           WHEN total_paid >= gross AND gross > 0 AND paid_at IS NULL THEN NOW()
           ELSE paid_at
         END,
         updated_at = NOW()
   WHERE id = COALESCE(NEW.compensation_id, OLD.compensation_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────────
-- 6. Per-resident sync trigger
--    amount_paid + status on compensation_residents follows payments.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_comp_resident_on_payment() RETURNS TRIGGER AS $$
DECLARE
  rid UUID := COALESCE(NEW.compensation_resident_id, OLD.compensation_resident_id);
  total_paid NUMERIC(12,2);
  assigned   NUMERIC(12,2);
BEGIN
  IF rid IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM compensation_payments
  WHERE compensation_resident_id = rid;

  SELECT amount_assigned INTO assigned
  FROM compensation_residents WHERE id = rid;

  UPDATE compensation_residents
  SET amount_paid = total_paid,
      status = CASE
        WHEN total_paid >= assigned AND assigned > 0 THEN
          CASE WHEN status IN ('salary_deduction','waived') THEN status ELSE 'paid' END
        WHEN total_paid > 0 THEN status
        ELSE status
      END,
      paid_at = CASE
        WHEN total_paid >= assigned AND assigned > 0 AND paid_at IS NULL THEN NOW()
        ELSE paid_at
      END,
      updated_at = NOW()
  WHERE id = rid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_comp_resident_on_payment ON compensation_payments;
CREATE TRIGGER trg_sync_comp_resident_on_payment
AFTER INSERT OR UPDATE OR DELETE ON compensation_payments
FOR EACH ROW EXECUTE FUNCTION sync_comp_resident_on_payment();

COMMIT;
