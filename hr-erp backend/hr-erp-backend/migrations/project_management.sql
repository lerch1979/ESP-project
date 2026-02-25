-- ============================================
-- Project Management System
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects (handle existing table from previous migration)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR(50) DEFAULT 'planning',
  priority VARCHAR(20) DEFAULT 'medium',
  budget DECIMAL(15,2),
  actual_cost DECIMAL(15,2) DEFAULT 0,
  completion_percentage INTEGER DEFAULT 0,
  cost_center_id UUID REFERENCES cost_centers(id),
  project_manager_id UUID REFERENCES users(id),
  contractor_id UUID REFERENCES contractors(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Migrate existing projects table: rename manager_id -> project_manager_id if needed
DO $$
BEGIN
  -- Rename manager_id to project_manager_id if old column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'manager_id') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'project_manager_id') THEN
      ALTER TABLE projects RENAME COLUMN manager_id TO project_manager_id;
    END IF;
  END IF;
END $$;

-- Add missing columns to existing projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_percentage INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_manager_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Ensure name column is wide enough
ALTER TABLE projects ALTER COLUMN name TYPE VARCHAR(200);

-- Project Team Members
CREATE TABLE IF NOT EXISTS project_team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  role VARCHAR(100),
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES tasks(id),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'todo',
  priority VARCHAR(20) DEFAULT 'medium',
  assigned_to UUID REFERENCES users(id),
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMP,
  estimated_hours DECIMAL(6,2),
  actual_hours DECIMAL(6,2) DEFAULT 0,
  progress INTEGER DEFAULT 0,
  tags TEXT[],
  contractor_id UUID REFERENCES contractors(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Task Dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(50) DEFAULT 'finish_to_start',
  UNIQUE(task_id, depends_on_task_id)
);

-- Task Comments
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Task Attachments
CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  file_name VARCHAR(300),
  file_path VARCHAR(500),
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Timesheets (hours tracking)
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id),
  user_id UUID REFERENCES users(id),
  hours DECIMAL(6,2) NOT NULL,
  work_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_cost_center ON projects(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_projects_contractor ON projects(contractor_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_project_team_project ON project_team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_team_user ON project_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contractor ON tasks(contractor_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_task ON timesheets(task_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_user ON timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_date ON timesheets(work_date);

-- ============================================
-- Updated_at trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_project_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_project_updated_at();

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_project_updated_at();

-- ============================================
-- Project management permissions
-- ============================================

INSERT INTO permissions (name, slug, description, module)
VALUES
  ('Projektek megtekintése', 'projects.view', 'Projektek listázása és megtekintése', 'projects'),
  ('Projekt létrehozása', 'projects.create', 'Új projekt létrehozása', 'projects'),
  ('Projekt szerkesztése', 'projects.edit', 'Projekt adatainak módosítása', 'projects'),
  ('Projekt törlése', 'projects.delete', 'Projekt törlése', 'projects'),
  ('Feladatok megtekintése', 'tasks.view', 'Feladatok listázása és megtekintése', 'tasks'),
  ('Feladat létrehozása', 'tasks.create', 'Új feladat létrehozása', 'tasks'),
  ('Feladat szerkesztése', 'tasks.edit', 'Feladat adatainak módosítása', 'tasks'),
  ('Feladat törlése', 'tasks.delete', 'Feladat törlése', 'tasks'),
  ('Munkaidő rögzítése', 'timesheets.log', 'Munkaidő bejegyzés rögzítése', 'timesheets'),
  ('Saját munkaidő megtekintése', 'timesheets.view_own', 'Saját munkaidő bejegyzések megtekintése', 'timesheets'),
  ('Összes munkaidő megtekintése', 'timesheets.view_all', 'Minden munkaidő bejegyzés megtekintése', 'timesheets')
ON CONFLICT (slug) DO NOTHING;

-- Grant project permissions to admin roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug IN ('superadmin', 'admin', 'data_controller')
  AND p.slug IN (
    'projects.view', 'projects.create', 'projects.edit', 'projects.delete',
    'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.delete',
    'timesheets.log', 'timesheets.view_own', 'timesheets.view_all'
  )
ON CONFLICT DO NOTHING;

-- Grant view/create/edit + own timesheets to regular users
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'user'
  AND p.slug IN (
    'projects.view',
    'tasks.view', 'tasks.create', 'tasks.edit',
    'timesheets.log', 'timesheets.view_own'
  )
ON CONFLICT DO NOTHING;
