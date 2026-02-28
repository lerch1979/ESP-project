-- ============================================
-- SLA Policies Migration
-- SLA szabályzatok kezelése
-- ============================================

-- SLA Policies tábla
CREATE TABLE IF NOT EXISTS sla_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{}',
  business_hours_only BOOLEAN DEFAULT TRUE,
  business_hours_start TIME DEFAULT '08:00',
  business_hours_end TIME DEFAULT '17:00',
  escalation_enabled BOOLEAN DEFAULT FALSE,
  escalation_after_percentage INTEGER DEFAULT 80,
  escalation_to_role VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  apply_to_categories UUID[],
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sla_policies_contractor ON sla_policies(contractor_id);
CREATE INDEX IF NOT EXISTS idx_sla_policies_active ON sla_policies(is_active);

-- ============================================
-- Seed data - Példa SLA szabályzatok
-- ============================================

INSERT INTO sla_policies (name, description, rules, business_hours_only, business_hours_start, business_hours_end, escalation_enabled, escalation_after_percentage, escalation_to_role, is_active)
VALUES
  (
    'Standard SLA',
    'Alapértelmezett SLA szabályzat normál ügyekhez',
    '{
      "low": { "response_hours": 24, "resolution_hours": 72 },
      "normal": { "response_hours": 8, "resolution_hours": 48 },
      "urgent": { "response_hours": 4, "resolution_hours": 24 },
      "critical": { "response_hours": 1, "resolution_hours": 8 }
    }'::jsonb,
    TRUE,
    '08:00',
    '17:00',
    FALSE,
    80,
    NULL,
    TRUE
  ),
  (
    'Prémium SLA',
    'Prémium szintű SLA szabályzat kiemelt ügyfelekhez, rövidebb válasz- és megoldási időkkel',
    '{
      "low": { "response_hours": 8, "resolution_hours": 48 },
      "normal": { "response_hours": 4, "resolution_hours": 24 },
      "urgent": { "response_hours": 2, "resolution_hours": 12 },
      "critical": { "response_hours": 0.5, "resolution_hours": 4 }
    }'::jsonb,
    FALSE,
    '00:00',
    '23:59',
    TRUE,
    75,
    'admin',
    TRUE
  )
ON CONFLICT DO NOTHING;
