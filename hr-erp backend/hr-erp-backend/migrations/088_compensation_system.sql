-- Migration 088: Compensation workflow (Day 3 Part C)
--
-- Compensations arise from inspection findings where a specific party
-- (worker, contractor, guest) is held responsible for damage/cleaning/etc.
-- The system manages the full lifecycle: issuance → notification → reminders
-- → escalation → payment (partial or full) or waiver.
--
-- FK targets: inspections(id), inspection_damages(id), accommodation_rooms(id),
-- accommodations(id), users(id). All of these exist by migration 086-087.
-- employees(id) is tolerated-absent since the `damage_reports` pattern from
-- 086 showed we can't rely on every dev's schema state.
--
-- Idempotent; safe to re-run.

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- compensations — one claim per responsible party per incident
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS compensations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Human-friendly sequence, e.g. HSK-2026-0042
  compensation_number VARCHAR(40) UNIQUE NOT NULL,

  -- Linkage to source of the claim (all optional — standalone claims allowed)
  inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
  damage_id     UUID REFERENCES inspection_damages(id) ON DELETE SET NULL,
  room_id       UUID REFERENCES accommodation_rooms(id) ON DELETE SET NULL,
  accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL,

  -- Who is responsible. Either a system user OR an external person whose
  -- name is captured verbatim (for workers not yet onboarded / guests).
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  responsible_name    VARCHAR(200), -- always populated; fallback when user_id NULL
  responsible_email   VARCHAR(200),
  responsible_phone   VARCHAR(50),

  compensation_type VARCHAR(30) NOT NULL
    CHECK (compensation_type IN ('damage', 'cleaning', 'late_payment', 'contract_violation', 'other')),

  -- Money — gross amount only; HUF is the default currency.
  amount_gross   NUMERIC(12,2) NOT NULL CHECK (amount_gross >= 0),
  amount_paid    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency       VARCHAR(3) NOT NULL DEFAULT 'HUF',

  description        TEXT NOT NULL,
  calculation_notes  TEXT,

  -- Status machine:
  --   draft      — internal, not yet sent
  --   issued     — formally issued (PDF generated)
  --   notified   — notification delivered to responsible party
  --   disputed   — party has contested the claim
  --   partial_paid — some payment received, not fully settled
  --   paid       — fully paid
  --   waived     — forgiven / written off (with reason)
  --   escalated  — sent to legal / payroll deduction
  --   closed     — archival terminal state
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','notified','disputed','partial_paid','paid','waived','escalated','closed')),

  -- Timeline
  issued_at        TIMESTAMP,
  due_date         DATE,
  remediation_period_days INTEGER DEFAULT 14,

  -- Escalation level: 0=normal, 1=reminder sent, 2=final warning, 3=legal referral
  escalation_level INTEGER NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 3),
  last_reminder_at TIMESTAMP,
  escalated_at     TIMESTAMP,

  -- Terminal state metadata
  waived_at     TIMESTAMP,
  waived_reason TEXT,
  waived_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at       TIMESTAMP, -- set when fully paid
  closed_at     TIMESTAMP,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CHECK (amount_paid <= amount_gross)
);

CREATE INDEX IF NOT EXISTS idx_compensations_status        ON compensations(status);
CREATE INDEX IF NOT EXISTS idx_compensations_inspection    ON compensations(inspection_id);
CREATE INDEX IF NOT EXISTS idx_compensations_accommodation ON compensations(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_compensations_responsible   ON compensations(responsible_user_id);
CREATE INDEX IF NOT EXISTS idx_compensations_due_date      ON compensations(due_date) WHERE status IN ('issued','notified','disputed','partial_paid');
CREATE INDEX IF NOT EXISTS idx_compensations_number        ON compensations(compensation_number);

-- Sequence for the human-friendly number
CREATE SEQUENCE IF NOT EXISTS compensation_seq START 1;

-- ════════════════════════════════════════════════════════════════════
-- compensation_payments — partial or full payment records
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS compensation_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compensation_id UUID NOT NULL REFERENCES compensations(id) ON DELETE CASCADE,

  amount    NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency  VARCHAR(3) NOT NULL DEFAULT 'HUF',
  paid_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  method    VARCHAR(30) CHECK (method IN ('cash','transfer','payroll_deduction','card','other')),
  reference VARCHAR(100), -- receipt / transaction ID
  notes     TEXT,

  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_payments_compensation ON compensation_payments(compensation_id);
CREATE INDEX IF NOT EXISTS idx_comp_payments_paid_at      ON compensation_payments(paid_at);

-- ════════════════════════════════════════════════════════════════════
-- compensation_reminders — audit trail of all reminders/notifications sent
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS compensation_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compensation_id UUID NOT NULL REFERENCES compensations(id) ON DELETE CASCADE,

  reminder_type VARCHAR(30) NOT NULL
    CHECK (reminder_type IN ('initial_notification','first_reminder','final_warning','escalation','payment_confirmation','waiver')),

  sent_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_to      UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_to_name VARCHAR(200),
  sent_channel VARCHAR(20) CHECK (sent_channel IN ('email','push','slack','sms','in_app','manual')),

  subject TEXT,
  body    TEXT,
  metadata JSONB, -- snapshot: amount, due_date, escalation_level at send-time

  delivery_status VARCHAR(20) DEFAULT 'sent'
    CHECK (delivery_status IN ('sent','delivered','failed','bounced')),
  delivery_error  TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_reminders_compensation ON compensation_reminders(compensation_id);
CREATE INDEX IF NOT EXISTS idx_comp_reminders_type         ON compensation_reminders(reminder_type);
CREATE INDEX IF NOT EXISTS idx_comp_reminders_sent_at      ON compensation_reminders(sent_at);

-- ════════════════════════════════════════════════════════════════════
-- Trigger: keep amount_paid + status in sync when payments land
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_compensation_on_payment() RETURNS TRIGGER AS $$
DECLARE
  total_paid NUMERIC(12,2);
  gross      NUMERIC(12,2);
  cur_status VARCHAR(20);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM compensation_payments
  WHERE compensation_id = COALESCE(NEW.compensation_id, OLD.compensation_id);

  SELECT amount_gross, status INTO gross, cur_status
  FROM compensations
  WHERE id = COALESCE(NEW.compensation_id, OLD.compensation_id);

  IF cur_status IN ('waived','closed') THEN
    -- Don't auto-transition terminal states
    UPDATE compensations
       SET amount_paid = total_paid,
           updated_at  = NOW()
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

DROP TRIGGER IF EXISTS trg_sync_compensation_on_payment ON compensation_payments;
CREATE TRIGGER trg_sync_compensation_on_payment
AFTER INSERT OR UPDATE OR DELETE ON compensation_payments
FOR EACH ROW EXECUTE FUNCTION sync_compensation_on_payment();

COMMIT;
