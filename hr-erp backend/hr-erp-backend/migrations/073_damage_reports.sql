-- Migration 073: Damage Report System (Kárigény Jegyzőkönyv)
-- Mt. 166.§, 177.§, Ptk. 6:142.§ compliant

BEGIN;

-- ── Damage Reports Table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS damage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number VARCHAR(50) UNIQUE NOT NULL,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  accommodation_id UUID,
  room_id VARCHAR(100),
  employee_id UUID NOT NULL REFERENCES users(id),
  contractor_id UUID NOT NULL REFERENCES contractors(id),
  incident_date DATE NOT NULL,
  discovery_date DATE DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  damage_items JSONB NOT NULL DEFAULT '[]',
  liability_type VARCHAR(30) NOT NULL DEFAULT 'negligence'
    CHECK (liability_type IN ('intentional', 'negligence', 'normal_wear', 'force_majeure')),
  fault_percentage INTEGER NOT NULL DEFAULT 100 CHECK (fault_percentage BETWEEN 0 AND 100),
  total_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  employee_salary DECIMAL(10,2),
  payment_plan JSONB DEFAULT '[]',
  photo_urls TEXT[] DEFAULT '{}',
  employee_acknowledged BOOLEAN DEFAULT FALSE,
  employee_signature_date TIMESTAMP WITH TIME ZONE,
  employee_signature_data TEXT,
  manager_signature_date TIMESTAMP WITH TIME ZONE,
  manager_signature_data TEXT,
  witness_name VARCHAR(255),
  witness_signature_data TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'pending_acknowledgment', 'acknowledged', 'in_payment', 'paid', 'disputed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_damage_reports_employee ON damage_reports(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_damage_reports_contractor ON damage_reports(contractor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_damage_reports_status ON damage_reports(status);
CREATE INDEX IF NOT EXISTS idx_damage_reports_ticket ON damage_reports(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_damage_reports_number ON damage_reports(report_number);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_damage_report_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_damage_report_updated ON damage_reports;
CREATE TRIGGER trg_damage_report_updated
  BEFORE UPDATE ON damage_reports
  FOR EACH ROW EXECUTE FUNCTION update_damage_report_timestamp();

-- Report number sequence
CREATE SEQUENCE IF NOT EXISTS damage_report_seq START 1;

COMMIT;
