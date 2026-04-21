-- Migration 086: Property Inspection System (Day 1 — schema foundation)
--
-- Replaces the empty `housing_cleanliness_inspections` legacy table (still
-- in place, 0 rows) with a richer structured inspection system.
--
-- Schema corrections from the original spec:
-- - FKs target `accommodations(id)` instead of non-existent `housings(id)`.
-- - Role additions live in this migration (property_inspector, maintenance_worker,
--   property_owner) so subsequent role-permission seeding has something to bind to.
--
-- All ALTERs + CREATEs guarded for idempotence. One BEGIN/COMMIT.

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- 1. Roles — three new actors
-- ════════════════════════════════════════════════════════════════════
INSERT INTO roles (slug, name, description, is_system) VALUES
  ('property_inspector',  'Ingatlanellenőr',       'Housing Solutions belső ellenőr — ellenőrzéseket rögzít mobilról', false),
  ('maintenance_worker',  'Karbantartó',           'Karbantartási feladatokat fogad és teljesít', false),
  ('property_owner',      'Ingatlan tulajdonos',   'Külső tulajdonos — csak a saját ingatlanait olvashatja', false)
ON CONFLICT (slug) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 2. Inspection categories + checklist items
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inspection_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  max_points INTEGER NOT NULL CHECK (max_points > 0),
  weight DECIMAL(3,2) DEFAULT 1.0 CHECK (weight > 0 AND weight <= 10),
  icon VARCHAR(10),
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO inspection_categories (code, name, max_points, icon, sort_order) VALUES
  ('TECHNICAL', 'Műszaki állapot',      50, '🔧', 1),
  ('HYGIENE',   'Higiéniai állapot',    30, '🧼', 2),
  ('AESTHETIC', 'Optikai/esztétikai',   20, '✨', 3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS inspection_checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES inspection_categories(id) ON DELETE CASCADE,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  max_points INTEGER NOT NULL CHECK (max_points > 0),
  required_photo BOOLEAN DEFAULT false,
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed ~15 checklist items across 3 categories
INSERT INTO inspection_checklist_items (category_id, code, name, max_points, required_photo, sort_order)
SELECT c.id, v.code, v.name, v.max_points, v.required_photo, v.sort_order
FROM (VALUES
  ('TECHNICAL', 'TECH_ELECTRICAL',   'Elektromos rendszer (lámpák, konnektorok)', 10, true,  1),
  ('TECHNICAL', 'TECH_PLUMBING',     'Vízvezeték és csapok',                      10, true,  2),
  ('TECHNICAL', 'TECH_HEATING',      'Fűtés és radiátorok',                       10, false, 3),
  ('TECHNICAL', 'TECH_DOORS_WINDOWS','Ajtók és ablakok állapota',                 10, true,  4),
  ('TECHNICAL', 'TECH_APPLIANCES',   'Készülékek (hűtő, tűzhely, mosógép)',       10, true,  5),

  ('HYGIENE',   'HYG_KITCHEN',       'Konyha tisztasága',                          10, true,  1),
  ('HYGIENE',   'HYG_BATHROOM',      'Fürdőszoba tisztasága',                      10, true,  2),
  ('HYGIENE',   'HYG_BEDROOM',       'Hálószobák és közösségi terek',              5,  false, 3),
  ('HYGIENE',   'HYG_WASTE',         'Hulladékkezelés',                            5,  false, 4),

  ('AESTHETIC', 'AES_WALLS',         'Falak állapota (festés, tapéta)',            5,  true,  1),
  ('AESTHETIC', 'AES_FLOORS',        'Padlók állapota',                            5,  true,  2),
  ('AESTHETIC', 'AES_FURNITURE',     'Bútorok állapota',                           5,  true,  3),
  ('AESTHETIC', 'AES_EXTERIOR',      'Közös területek, külső rész',                5,  false, 4)
) AS v(cat_code, code, name, max_points, required_photo, sort_order)
JOIN inspection_categories c ON c.code = v.cat_code
ON CONFLICT (code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 3. Schedules — recurring inspection plan per accommodation
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inspection_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  accommodation_id UUID REFERENCES accommodations(id) ON DELETE CASCADE,
  frequency VARCHAR(20) NOT NULL
    CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_due_date DATE,
  last_completed_date DATE,
  default_inspector_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspection_schedules_accommodation ON inspection_schedules(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_inspection_schedules_next_due     ON inspection_schedules(next_due_date) WHERE is_active = true;

-- ════════════════════════════════════════════════════════════════════
-- 4. Inspections — main table
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_number VARCHAR(50) UNIQUE,
  accommodation_id UUID REFERENCES accommodations(id) ON DELETE RESTRICT,
  inspector_id UUID REFERENCES users(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES inspection_schedules(id) ON DELETE SET NULL,

  inspection_type VARCHAR(50) NOT NULL
    CHECK (inspection_type IN ('weekly','monthly','quarterly','yearly','checkin','checkout','incident','complaint')),
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  total_score INTEGER CHECK (total_score IS NULL OR (total_score BETWEEN 0 AND 100)),
  technical_score INTEGER,
  hygiene_score INTEGER,
  aesthetic_score INTEGER,
  grade VARCHAR(20)
    CHECK (grade IS NULL OR grade IN ('excellent','good','acceptable','poor','bad','critical')),

  status VARCHAR(30) DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled','reviewed')),

  gps_latitude DECIMAL(10, 8),
  gps_longitude DECIMAL(11, 8),
  digital_signature TEXT,
  signature_timestamp TIMESTAMP,

  general_notes TEXT,
  admin_review_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspections_accommodation ON inspections(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status        ON inspections(status);
CREATE INDEX IF NOT EXISTS idx_inspections_scheduled_at  ON inspections(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_inspections_inspector     ON inspections(inspector_id) WHERE status != 'completed';

-- Sequence + helper for inspection numbers (ELL-2026-04-0001 format)
CREATE SEQUENCE IF NOT EXISTS inspection_seq START 1;

-- ════════════════════════════════════════════════════════════════════
-- 5. Inspection item scores + photos + damages
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inspection_item_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES inspection_checklist_items(id) ON DELETE RESTRICT,
  score INTEGER NOT NULL CHECK (score >= 0),
  max_score INTEGER NOT NULL CHECK (max_score > 0),
  notes TEXT,
  severity VARCHAR(20)
    CHECK (severity IS NULL OR severity IN ('ok','minor','major','critical')),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT score_within_max CHECK (score <= max_score),
  UNIQUE (inspection_id, checklist_item_id)
);
CREATE INDEX IF NOT EXISTS idx_inspection_scores_inspection ON inspection_item_scores(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_scores_severity   ON inspection_item_scores(severity)
  WHERE severity IN ('major','critical');

CREATE TABLE IF NOT EXISTS inspection_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
  item_score_id UUID REFERENCES inspection_item_scores(id) ON DELETE SET NULL,
  file_path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(500),
  caption TEXT,
  gps_latitude DECIMAL(10, 8),
  gps_longitude DECIMAL(11, 8),
  taken_at TIMESTAMP,
  file_size INTEGER,
  mime_type VARCHAR(50),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection ON inspection_photos(inspection_id);

CREATE TABLE IF NOT EXISTS inspection_damages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
  item_score_id UUID REFERENCES inspection_item_scores(id) ON DELETE SET NULL,
  damage_description TEXT NOT NULL,
  responsible_party VARCHAR(50)
    CHECK (responsible_party IN ('employee','maintenance','property_owner','external','unknown')),
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  estimated_cost DECIMAL(12,2),
  actual_cost DECIMAL(12,2),
  compensation_status VARCHAR(30) DEFAULT 'pending'
    CHECK (compensation_status IN ('pending','invoiced','paid','disputed','waived','legal_action')),
  legal_notes TEXT,
  resolution TEXT,
  -- damage_reports FK added conditionally below (the damage_reports table
  -- is from migration 073 which isn't in the CI manifest chain yet; this
  -- keeps 086 runnable on a fresh CI DB while still enforcing the FK on
  -- dev where 073 has been applied manually).
  damage_report_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='damage_reports')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inspection_damages_damage_report') THEN
    ALTER TABLE inspection_damages
      ADD CONSTRAINT fk_inspection_damages_damage_report
      FOREIGN KEY (damage_report_id) REFERENCES damage_reports(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_inspection_damages_inspection     ON inspection_damages(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_damages_status         ON inspection_damages(compensation_status);
CREATE INDEX IF NOT EXISTS idx_inspection_damages_responsible    ON inspection_damages(responsible_user_id) WHERE responsible_user_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- 6. Maintenance tasks (auto-generated from low scores) + completion photos
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inspection_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
  item_score_id UUID REFERENCES inspection_item_scores(id) ON DELETE SET NULL,

  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical','emergency')),
  category VARCHAR(50),

  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP,
  due_date DATE,

  status VARCHAR(30) DEFAULT 'pending'
    CHECK (status IN ('pending','assigned','in_progress','completed','cancelled','overdue')),

  completion_notes TEXT,
  completed_at TIMESTAMP,
  completion_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,

  estimated_cost DECIMAL(12,2),
  actual_cost DECIMAL(12,2),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_assignee ON inspection_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_status   ON inspection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_due_date ON inspection_tasks(due_date) WHERE status NOT IN ('completed','cancelled');

CREATE TABLE IF NOT EXISTS task_completion_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  caption TEXT,
  photo_type VARCHAR(30)
    CHECK (photo_type IN ('before','during','after')),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_photos_task ON task_completion_photos(task_id);

-- ════════════════════════════════════════════════════════════════════
-- 7. Property owner access
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS property_owner_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  accommodation_id UUID REFERENCES accommodations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  can_view_inspections BOOLEAN DEFAULT true,
  can_view_photos BOOLEAN DEFAULT true,
  can_view_tasks BOOLEAN DEFAULT true,
  can_view_financial BOOLEAN DEFAULT false,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (accommodation_id, owner_user_id)
);
CREATE INDEX IF NOT EXISTS idx_owner_access_owner ON property_owner_access(owner_user_id);

-- ════════════════════════════════════════════════════════════════════
-- 8. Materialized view — inspection trends per accommodation per month
-- ════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS inspection_trends AS
SELECT
  accommodation_id,
  DATE_TRUNC('month', completed_at) as month,
  AVG(total_score)      as avg_score,
  AVG(technical_score)  as avg_technical,
  AVG(hygiene_score)    as avg_hygiene,
  AVG(aesthetic_score)  as avg_aesthetic,
  COUNT(*)              as inspection_count
FROM inspections
WHERE status = 'completed' AND completed_at IS NOT NULL
GROUP BY accommodation_id, DATE_TRUNC('month', completed_at);

CREATE INDEX IF NOT EXISTS idx_trends_accommodation_month
  ON inspection_trends(accommodation_id, month);

COMMIT;
