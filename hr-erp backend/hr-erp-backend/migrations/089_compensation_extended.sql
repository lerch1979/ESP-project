-- Migration 089: Compensation workflow advanced features (Day 3 Part C ext.)
--
-- Extends the 088 schema with:
--   1. compensation_responsibilities  — multi-party allocations with % shares
--   2. Dispute workflow               — dispute_at / dispute_reason / resolution
--   3. salary_deductions              — scheduled multi-period payroll hits
--   4. Escalation ladder 0-4          — was 0-3, now 3-day pre / due / 15 / 30
--
-- All changes idempotent; safe to re-run.

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. compensation_responsibilities — one row per responsible party.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compensation_responsibilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compensation_id UUID NOT NULL REFERENCES compensations(id) ON DELETE CASCADE,

  -- Allocation target: either a known user OR a free-form person (guest/contractor)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name    VARCHAR(200) NOT NULL,
  email   VARCHAR(200),
  phone   VARCHAR(50),

  -- Percentage 0-100; sum across a compensation should equal 100 (enforced by service)
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),

  -- Cached computed fields — updated by trigger/service on amount or % change
  amount_allocated NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),

  notified_at    TIMESTAMP,
  acknowledged_at TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_resp_compensation ON compensation_responsibilities(compensation_id);
CREATE INDEX IF NOT EXISTS idx_comp_resp_user         ON compensation_responsibilities(user_id);

-- Payments can now optionally reference a specific responsibility (for
-- audit + multi-party settlement tracking).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compensation_payments' AND column_name = 'responsibility_id'
  ) THEN
    ALTER TABLE compensation_payments
      ADD COLUMN responsibility_id UUID REFERENCES compensation_responsibilities(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comp_payments_responsibility ON compensation_payments(responsibility_id);

-- ────────────────────────────────────────────────────────────────────
-- 2. Dispute workflow — add fields to compensations
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='compensations' AND column_name='disputed_at') THEN
    ALTER TABLE compensations
      ADD COLUMN disputed_at TIMESTAMP,
      ADD COLUMN dispute_reason TEXT,
      ADD COLUMN dispute_submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN resolved_at TIMESTAMP,
      ADD COLUMN dispute_resolution VARCHAR(20)
        CHECK (dispute_resolution IS NULL OR dispute_resolution IN ('upheld','reduced','dismissed')),
      ADD COLUMN dispute_resolution_notes TEXT,
      ADD COLUMN original_amount_gross NUMERIC(12,2);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 3. salary_deductions — multi-period payroll schedule
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_deductions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compensation_id UUID NOT NULL REFERENCES compensations(id) ON DELETE CASCADE,
  responsibility_id UUID REFERENCES compensation_responsibilities(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  employee_name VARCHAR(200) NOT NULL,

  amount_per_period NUMERIC(12,2) NOT NULL CHECK (amount_per_period > 0),
  periods_total     INTEGER NOT NULL CHECK (periods_total > 0),
  periods_completed INTEGER NOT NULL DEFAULT 0 CHECK (periods_completed >= 0),

  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','active','paused','completed','cancelled')),

  notes      TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CHECK (periods_completed <= periods_total),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_salary_deductions_compensation ON salary_deductions(compensation_id);
CREATE INDEX IF NOT EXISTS idx_salary_deductions_user         ON salary_deductions(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_deductions_status       ON salary_deductions(status);

-- ────────────────────────────────────────────────────────────────────
-- 4. Relax escalation_level CHECK to 0..4 (was 0..3)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE compensations DROP CONSTRAINT IF EXISTS compensations_escalation_level_check;
ALTER TABLE compensations
  ADD CONSTRAINT compensations_escalation_level_check
  CHECK (escalation_level BETWEEN 0 AND 4);

-- Add a 'salary_deduction_scheduled' option to reminder types for audit log
ALTER TABLE compensation_reminders DROP CONSTRAINT IF EXISTS compensation_reminders_reminder_type_check;
ALTER TABLE compensation_reminders
  ADD CONSTRAINT compensation_reminders_reminder_type_check
  CHECK (reminder_type IN (
    'initial_notification','first_reminder','final_warning','serious_overdue',
    'escalation','payment_confirmation','waiver','dispute_submitted',
    'dispute_resolved','salary_deduction_scheduled','allocation_notified'
  ));

COMMIT;
