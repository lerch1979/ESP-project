-- ============================================
-- SLA Ticket Deadlines Migration
-- SLA határidők hozzáadása a tickets táblához
-- ============================================

-- Új oszlopok a tickets táblához
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS sla_policy_id UUID REFERENCES sla_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_response_deadline TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sla_resolution_deadline TIMESTAMP,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;

-- Indexek
CREATE INDEX IF NOT EXISTS idx_tickets_sla_policy ON tickets(sla_policy_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_resolution_deadline ON tickets(sla_resolution_deadline);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_response_deadline ON tickets(sla_response_deadline);
