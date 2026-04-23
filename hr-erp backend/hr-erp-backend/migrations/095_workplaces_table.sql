-- ============================================================
-- 095_workplaces_table.sql
-- Promote workplace to a first-class entity so admins can manage
-- the canonical list (active/inactive toggle, rename, delete).
--
-- employees.workplace remains a text column (no FK) for backward
-- compatibility — the workplaces table is the source of truth for
-- filter dropdowns and the admin manager.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS workplaces (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       varchar(128) NOT NULL UNIQUE,
  is_active  boolean     NOT NULL DEFAULT TRUE,
  created_at timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workplaces_active_name
  ON workplaces (is_active, name);

-- Seed any existing employees.workplace values that aren't already in the
-- workplaces table. Safe to rerun — ON CONFLICT keeps existing is_active.
INSERT INTO workplaces (name, is_active)
SELECT DISTINCT trim(workplace), TRUE
FROM employees
WHERE workplace IS NOT NULL AND trim(workplace) != ''
ON CONFLICT (name) DO NOTHING;

COMMIT;
