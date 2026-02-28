-- ============================================
-- Auto-Assign System Migration
-- Automatikus feladat/ticket kiosztás rendszer
-- ============================================

-- ============================================
-- 1. Assignment Rules (Kiosztási szabályok)
-- ============================================
CREATE TABLE IF NOT EXISTS assignment_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'ticket' or 'task'
  priority INTEGER DEFAULT 0, -- higher number = higher priority rule

  -- Conditions (JSON) - feltételek
  -- Examples:
  -- { "category": "rezsi", "priority": "urgent" }
  -- { "project_id": "uuid", "skill_required": "backend" }
  conditions JSONB NOT NULL DEFAULT '{}',

  -- Assignment Strategy
  assign_to_role VARCHAR(50), -- role slug: 'facility_manager', 'developer', 'admin'
  assign_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- specific user (optional)
  assign_strategy VARCHAR(50) DEFAULT 'round_robin',
  -- Strategies: round_robin, least_busy, skill_match, random

  is_active BOOLEAN DEFAULT TRUE,
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. User Skills (Felhasználói képességek)
-- ============================================
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill VARCHAR(100) NOT NULL, -- 'backend', 'frontend', 'electrical', 'plumbing', 'hvac'
  proficiency INTEGER DEFAULT 1 CHECK (proficiency BETWEEN 1 AND 5), -- 1-5
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, skill)
);

-- ============================================
-- 3. User Workload (Munkaterhelés nyilvántartás)
-- ============================================
CREATE TABLE IF NOT EXISTS user_workload (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_tickets INTEGER DEFAULT 0,
  active_tasks INTEGER DEFAULT 0,
  total_pending_items INTEGER DEFAULT 0,
  last_assignment_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Initialize workload for existing users
INSERT INTO user_workload (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- 4. Triggers - Workload auto-update
-- ============================================

-- Trigger function: update workload when ticket is assigned
CREATE OR REPLACE FUNCTION update_user_workload_tickets()
RETURNS TRIGGER AS $$
BEGIN
  -- Update workload for the newly assigned user
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO user_workload (user_id, active_tickets, active_tasks, total_pending_items, last_assignment_at, updated_at)
    VALUES (NEW.assigned_to, 0, 0, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE user_workload
    SET
      active_tickets = (
        SELECT COUNT(*)
        FROM tickets
        WHERE assigned_to = NEW.assigned_to
          AND status_id NOT IN (
            SELECT id FROM ticket_statuses WHERE slug IN ('closed', 'resolved')
          )
      ),
      last_assignment_at = NOW(),
      updated_at = NOW()
    WHERE user_id = NEW.assigned_to;

    UPDATE user_workload
    SET total_pending_items = active_tickets + active_tasks
    WHERE user_id = NEW.assigned_to;
  END IF;

  -- Recalculate for old assigned user (on reassignment)
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT NULL AND OLD.assigned_to != NEW.assigned_to THEN
    UPDATE user_workload
    SET
      active_tickets = (
        SELECT COUNT(*)
        FROM tickets
        WHERE assigned_to = OLD.assigned_to
          AND status_id NOT IN (
            SELECT id FROM ticket_statuses WHERE slug IN ('closed', 'resolved')
          )
      ),
      updated_at = NOW()
    WHERE user_id = OLD.assigned_to;

    UPDATE user_workload
    SET total_pending_items = active_tickets + active_tasks
    WHERE user_id = OLD.assigned_to;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_workload_trigger
AFTER INSERT OR UPDATE OF assigned_to ON tickets
FOR EACH ROW
EXECUTE FUNCTION update_user_workload_tickets();

-- Trigger function: update workload when task is assigned
CREATE OR REPLACE FUNCTION update_user_workload_tasks()
RETURNS TRIGGER AS $$
BEGIN
  -- Update workload for the newly assigned user
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO user_workload (user_id, active_tasks, active_tickets, total_pending_items, last_assignment_at, updated_at)
    VALUES (NEW.assigned_to, 0, 0, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE user_workload
    SET
      active_tasks = (
        SELECT COUNT(*)
        FROM tasks
        WHERE assigned_to = NEW.assigned_to
          AND status NOT IN ('done', 'cancelled')
      ),
      last_assignment_at = NOW(),
      updated_at = NOW()
    WHERE user_id = NEW.assigned_to;

    UPDATE user_workload
    SET total_pending_items = active_tickets + active_tasks
    WHERE user_id = NEW.assigned_to;
  END IF;

  -- Recalculate for old assigned user (on reassignment)
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT NULL AND OLD.assigned_to != NEW.assigned_to THEN
    UPDATE user_workload
    SET
      active_tasks = (
        SELECT COUNT(*)
        FROM tasks
        WHERE assigned_to = OLD.assigned_to
          AND status NOT IN ('done', 'cancelled')
      ),
      updated_at = NOW()
    WHERE user_id = OLD.assigned_to;

    UPDATE user_workload
    SET total_pending_items = active_tickets + active_tasks
    WHERE user_id = OLD.assigned_to;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_workload_trigger
AFTER INSERT OR UPDATE OF assigned_to ON tasks
FOR EACH ROW
EXECUTE FUNCTION update_user_workload_tasks();

-- ============================================
-- 5. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_assignment_rules_type ON assignment_rules(type);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_active ON assignment_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_contractor ON assignment_rules(contractor_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill);
CREATE INDEX IF NOT EXISTS idx_user_workload_total ON user_workload(total_pending_items);
CREATE INDEX IF NOT EXISTS idx_user_workload_last_assignment ON user_workload(last_assignment_at);

-- ============================================
-- 6. Seed example assignment rules
-- ============================================
INSERT INTO assignment_rules (name, type, conditions, assign_to_role, assign_strategy, priority) VALUES
  ('Sürgős hibajegyek facility manager-nek', 'ticket',
   '{"priority_slug": "urgent"}', 'facility_manager', 'least_busy', 100),
  ('Rezsi kategória facility manager-nek', 'ticket',
   '{"category_slug": "rezsi"}', 'facility_manager', 'round_robin', 50),
  ('Backend feladatok fejlesztőknek', 'task',
   '{"skill_required": "backend"}', 'developer', 'skill_match', 50),
  ('Normál hibajegyek admin-oknak', 'ticket',
   '{"priority_slug": ["medium", "low"]}', 'admin', 'least_busy', 10)
ON CONFLICT DO NOTHING;

-- ============================================
-- 7. Seed example user skills
-- ============================================
INSERT INTO user_skills (user_id, skill, proficiency)
SELECT id, 'backend', 5 FROM users WHERE email = 'kiss.janos@abc-kft.hu'
ON CONFLICT (user_id, skill) DO NOTHING;

INSERT INTO user_skills (user_id, skill, proficiency)
SELECT id, 'frontend', 4 FROM users WHERE email = 'kiss.janos@abc-kft.hu'
ON CONFLICT (user_id, skill) DO NOTHING;
