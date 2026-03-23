-- ============================================================
-- GTD Integration Migration
-- Enhances existing tickets/projects + adds personal GTD layer
-- ============================================================

-- PART A: Enhance tickets with GTD metadata
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gtd_context VARCHAR(50);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gtd_energy_level VARCHAR(20);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gtd_time_estimate INT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gtd_waiting_for VARCHAR(200);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gtd_is_actionable BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_tickets_gtd_context
  ON tickets(gtd_context) WHERE gtd_is_actionable = true;

-- PART B: Enhance projects with GTD metadata
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gtd_outcome TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gtd_status VARCHAR(50) DEFAULT 'active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gtd_last_reviewed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_projects_gtd_status ON projects(gtd_status);

-- PART C: Personal GTD layer

-- Inbox (quick capture)
CREATE TABLE IF NOT EXISTS gtd_inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  processed BOOLEAN DEFAULT false,
  converted_to_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Personal tasks (not team tickets)
CREATE TABLE IF NOT EXISTS gtd_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  context VARCHAR(50),
  energy_level VARCHAR(20),
  time_estimate INT,
  status VARCHAR(50) DEFAULT 'next_action',
  priority VARCHAR(20) DEFAULT 'normal',
  due_date DATE,
  scheduled_date DATE,
  waiting_for VARCHAR(200),
  related_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  related_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  related_damage_report_id UUID REFERENCES damage_reports(id) ON DELETE SET NULL,
  tags TEXT[],
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Contexts (shared between tickets and tasks)
CREATE TABLE IF NOT EXISTS gtd_contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(20),
  color VARCHAR(20),
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Weekly review tracking
CREATE TABLE IF NOT EXISTS gtd_weekly_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  inbox_cleared BOOLEAN DEFAULT false,
  tickets_reviewed BOOLEAN DEFAULT false,
  projects_reviewed BOOLEAN DEFAULT false,
  tasks_completed INT DEFAULT 0,
  notes TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gtd_inbox_user ON gtd_inbox(user_id, processed);
CREATE INDEX IF NOT EXISTS idx_gtd_tasks_user ON gtd_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_gtd_tasks_context ON gtd_tasks(context) WHERE status = 'next_action';
CREATE INDEX IF NOT EXISTS idx_gtd_tasks_due ON gtd_tasks(due_date) WHERE status = 'next_action';
CREATE INDEX IF NOT EXISTS idx_gtd_reviews_user ON gtd_weekly_reviews(user_id, review_date DESC);

-- Seed system contexts
INSERT INTO gtd_contexts (name, icon, color, is_system) VALUES
  ('@computer', 'computer', '#3B82F6', true),
  ('@office', 'business', '#10B981', true),
  ('@call', 'phone', '#F59E0B', true),
  ('@accommodation', 'home', '#8B5CF6', true),
  ('@contractor', 'business_center', '#EF4444', true),
  ('@errands', 'shopping_cart', '#6B7280', true),
  ('@waiting', 'schedule', '#9333EA', true)
ON CONFLICT DO NOTHING;
