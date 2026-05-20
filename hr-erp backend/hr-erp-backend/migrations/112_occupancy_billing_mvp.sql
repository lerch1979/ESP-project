-- Migration 112: Occupancy-based incoming billing + profit dashboard MVP
-- HR-ERP — Phase 1 of bidirectional accommodation billing.
--
-- Decisions encoded (2026-05-20 design session):
--   1. Owner       → users + property_owner_access (mig 086) + owner_billing_info
--   2. Granularity → room-level, pro-rata split by ACTUAL daily occupants
--   3. Expenses    → manual UI input (OCR Phase 3)
--   4. MVP scope   → incoming billing + profit (outgoing Phase 2)
--   5. Same-day transfer → new accommodation gets the day (encoded in cron query, not schema)
--   6. Backfill    → in this migration, NOT EXISTS guard, idempotent
--   7. Currency    → HUF-only MVP; currency column exists for future expansion


-- ════════════════════════════════════════════════════════════════════
-- 1. owner_billing_info
-- ════════════════════════════════════════════════════════════════════
-- Payable info for accommodation owners. 1:1 with users.
-- Used by Phase 2 (outgoing billing); defined now for data-model coherence.
CREATE TABLE IF NOT EXISTS owner_billing_info (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bank_account    VARCHAR(34),
  tax_number      VARCHAR(50),
  billing_address TEXT,
  billing_email   VARCHAR(255),
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ════════════════════════════════════════════════════════════════════
-- 2. employee_accommodation_history
-- ════════════════════════════════════════════════════════════════════
-- Source of truth for who lives where. employees.arrival_date has no
-- departure_date counterpart, so we need explicit history.
--
-- Conventions:
--   • Open period:        check_out_date IS NULL
--   • Same-day transfer:  previous row check_out_date = D
--                         new row     check_in_date  = D
--                         End-of-day filter `(check_out_date IS NULL OR check_out_date > D)`
--                         excludes old row, includes new — new accommodation wins (decision 5).
--   • Half-day stay:      any row open at end-of-day counts as full day.
CREATE TABLE IF NOT EXISTS employee_accommodation_history (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id        UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  accommodation_id   UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  room_id            UUID REFERENCES accommodation_rooms(id) ON DELETE SET NULL,
  check_in_date      DATE NOT NULL,
  check_out_date     DATE,
  reason             VARCHAR(50),
  notes              TEXT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  CHECK (check_out_date IS NULL OR check_out_date >= check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_eah_employee
  ON employee_accommodation_history(employee_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_eah_accommodation
  ON employee_accommodation_history(accommodation_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_eah_room
  ON employee_accommodation_history(room_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_eah_open
  ON employee_accommodation_history(check_out_date)
  WHERE check_out_date IS NULL;


-- ════════════════════════════════════════════════════════════════════
-- 3. accommodation_expenses
-- ════════════════════════════════════════════════════════════════════
-- Manual entry of operating costs. Used as expense side of profit dashboard.
CREATE TABLE IF NOT EXISTS accommodation_expenses (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  billing_month    CHAR(7) NOT NULL,
  category         VARCHAR(30) NOT NULL,
  amount           DECIMAL(12, 2) NOT NULL,
  currency         CHAR(3) DEFAULT 'HUF',
  invoice_number   VARCHAR(100),
  attachment_url   TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at       TIMESTAMP,
  CHECK (category IN ('rezsi', 'karbantartas', 'takaritas', 'egyeb')),
  CHECK (amount >= 0),
  CHECK (billing_month ~ '^\d{4}-\d{2}$')
);

CREATE INDEX IF NOT EXISTS idx_acc_exp_acc_month
  ON accommodation_expenses(accommodation_id, billing_month)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_acc_exp_month
  ON accommodation_expenses(billing_month)
  WHERE deleted_at IS NULL;


-- ════════════════════════════════════════════════════════════════════
-- 4. occupancy_snapshots
-- ════════════════════════════════════════════════════════════════════
-- Daily cron writes one row per (employee, day). Rent + occupant count
-- + computed daily share are denormalized so billing math is reproducible
-- without back-walking history.
--
-- Pro-rata math:
--   per_occupant_daily_share = monthly_rent / days_in_month / room_occupant_count
--   Employee's month subtotal = SUM(per_occupant_daily_share for that employee, that month)
--
-- Scale: 300 employees × 365 days ≈ 110k rows/year. Partition only at 5M+.
CREATE TABLE IF NOT EXISTS occupancy_snapshots (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_date               DATE NOT NULL,
  employee_id                 UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  accommodation_id            UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  room_id                     UUID REFERENCES accommodation_rooms(id) ON DELETE SET NULL,
  contractor_id               UUID REFERENCES contractors(id) ON DELETE SET NULL,
  accommodation_monthly_rent  DECIMAL(12, 2),
  room_beds                   INTEGER,
  room_occupant_count         INTEGER NOT NULL,
  per_occupant_daily_share    DECIMAL(12, 4),
  created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (snapshot_date, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_occ_snap_date_acc
  ON occupancy_snapshots(snapshot_date, accommodation_id);
CREATE INDEX IF NOT EXISTS idx_occ_snap_employee
  ON occupancy_snapshots(employee_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_occ_snap_contractor
  ON occupancy_snapshots(contractor_id, snapshot_date);


-- ════════════════════════════════════════════════════════════════════
-- 5. billing_runs
-- ════════════════════════════════════════════════════════════════════
-- Anchor for monthly batch. Active (non-cancelled) (billing_month, run_type)
-- is unique so the cron can re-run idempotently; manual re-run = cancel
-- previous + create new.
CREATE TABLE IF NOT EXISTS billing_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_month   CHAR(7) NOT NULL,
  run_type        VARCHAR(20) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_amount    DECIMAL(14, 2),
  partner_count   INTEGER,
  started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT,
  CHECK (run_type IN ('incoming', 'outgoing')),
  CHECK (status   IN ('draft', 'calculated', 'finalized', 'cancelled')),
  CHECK (billing_month ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_runs_active
  ON billing_runs(billing_month, run_type)
  WHERE status <> 'cancelled';


-- ════════════════════════════════════════════════════════════════════
-- 6. accommodation_billings
-- ════════════════════════════════════════════════════════════════════
-- Calculated incoming billing per (partner, accommodation, month).
-- calculation_details JSONB = complete audit trail (reverse engineering):
-- {
--   "rooms": [
--     {"room_id":"…","room_number":"101","monthly_rent":80000,
--      "days":[{"date":"2026-04-01","occupants":3,"per_share":888.8889}, …],
--      "employees":[{"employee_id":"…","name":"…","days":30,"subtotal":26666.67}]
--     }
--   ],
--   "total_employee_days":90, "total_amount":80000.00,
--   "computed_at":"2026-05-01T01:00:00Z"
-- }
CREATE TABLE IF NOT EXISTS accommodation_billings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_run_id        UUID NOT NULL REFERENCES billing_runs(id) ON DELETE CASCADE,
  billing_month         CHAR(7) NOT NULL,
  accommodation_id      UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  partner_contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
  total_amount          DECIMAL(14, 2) NOT NULL,
  total_employee_days   INTEGER NOT NULL,
  calculation_details   JSONB NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  invoice_id            UUID REFERENCES invoices(id) ON DELETE SET NULL,
  computed_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('draft', 'invoiced', 'paid', 'cancelled')),
  CHECK (billing_month ~ '^\d{4}-\d{2}$'),
  CHECK (total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_acc_bill_run
  ON accommodation_billings(billing_run_id);
CREATE INDEX IF NOT EXISTS idx_acc_bill_acc
  ON accommodation_billings(accommodation_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_acc_bill_partner
  ON accommodation_billings(partner_contractor_id, billing_month);


-- ════════════════════════════════════════════════════════════════════
-- 7. updated_at triggers (reuse existing update_updated_at_column helper)
-- ════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_owner_billing_info_updated_at') THEN
    CREATE TRIGGER update_owner_billing_info_updated_at BEFORE UPDATE ON owner_billing_info
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_accommodation_expenses_updated_at') THEN
    CREATE TRIGGER update_accommodation_expenses_updated_at BEFORE UPDATE ON accommodation_expenses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_accommodation_billings_updated_at') THEN
    CREATE TRIGGER update_accommodation_billings_updated_at BEFORE UPDATE ON accommodation_billings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- 8. Backfill — existing employees → history (idempotent)
-- ════════════════════════════════════════════════════════════════════
-- For each currently-active employee with accommodation_id set, insert one
-- open history row so the daily snapshot cron picks them up from day one.
-- Re-running this migration is a no-op (NOT EXISTS guard).
INSERT INTO employee_accommodation_history
  (employee_id, accommodation_id, room_id, check_in_date, reason, notes)
SELECT
  e.id,
  e.accommodation_id,
  e.room_id,
  COALESCE(e.arrival_date, CURRENT_DATE),
  'backfill',
  'Auto-backfilled from employees.accommodation_id on migration 112'
FROM employees e
LEFT JOIN employee_status_types s ON e.status_id = s.id
WHERE e.accommodation_id IS NOT NULL
  AND (s.slug IS NULL OR s.slug = 'active')
  AND NOT EXISTS (
    SELECT 1 FROM employee_accommodation_history h
    WHERE h.employee_id = e.id AND h.check_out_date IS NULL
  );
