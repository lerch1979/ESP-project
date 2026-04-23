-- ============================================================
-- 100_unified_tasks_gtd.sql
-- Merge GTD-specific fields into the main `tasks` table so the
-- unified "Teendők" UI can present one kanban board for everything.
--
-- The existing gtd_contexts table is preserved (7 system contexts
-- already seeded). gtd_tasks is NOT dropped in this migration — the
-- two test rows there get migrated into tasks, but the table remains
-- for one release cycle so any code path still referencing it keeps
-- working. A future migration can drop it once callers are gone.
-- ============================================================

BEGIN;

-- ── tasks: GTD columns ─────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS gtd_status varchar(20)
    CHECK (gtd_status IN ('inbox','next_action','project','waiting','someday','done')),
  ADD COLUMN IF NOT EXISTS gtd_context_id uuid REFERENCES gtd_contexts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS energy_level varchar(20)
    CHECK (energy_level IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS time_estimate_minutes integer,
  ADD COLUMN IF NOT EXISTS waiting_for varchar(200),
  ADD COLUMN IF NOT EXISTS is_project boolean NOT NULL DEFAULT FALSE;

-- Backfill gtd_status for existing rows based on status + due_date heuristics.
UPDATE tasks
SET gtd_status = CASE
  WHEN status = 'done'        THEN 'done'
  WHEN status = 'blocked'     THEN 'waiting'
  WHEN due_date IS NULL       THEN 'someday'
  ELSE                             'next_action'
END
WHERE gtd_status IS NULL;

-- ── Migrate gtd_tasks rows into tasks ──────────────────────────
-- Map gtd_tasks.context (text like '@office') to gtd_contexts.id via name.
-- Map gtd_tasks.status to tasks.status + gtd_status.
INSERT INTO tasks (
  id, title, description, status, priority, assigned_to,
  due_date, tags, created_at, updated_at, completed_at,
  contractor_id, created_by,
  gtd_status, gtd_context_id, energy_level, time_estimate_minutes, waiting_for
)
SELECT
  gt.id,
  gt.title,
  gt.description,
  CASE gt.status
    WHEN 'completed'   THEN 'done'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'blocked'     THEN 'blocked'
    ELSE                    'todo'
  END                                                          AS status,
  COALESCE(gt.priority, 'medium')                              AS priority,
  gt.user_id                                                   AS assigned_to,
  gt.due_date,
  gt.tags,
  gt.created_at,
  gt.updated_at,
  gt.completed_at,
  u.contractor_id,
  gt.user_id                                                   AS created_by,
  CASE gt.status
    WHEN 'completed'                      THEN 'done'
    WHEN 'waiting'                        THEN 'waiting'
    WHEN 'blocked'                        THEN 'waiting'
    WHEN 'someday'                        THEN 'someday'
    WHEN 'inbox'                          THEN 'inbox'
    WHEN 'project'                        THEN 'project'
    ELSE                                       'next_action'
  END                                                          AS gtd_status,
  gc.id                                                        AS gtd_context_id,
  gt.energy_level,
  gt.time_estimate                                             AS time_estimate_minutes,
  gt.waiting_for
FROM gtd_tasks gt
LEFT JOIN gtd_contexts gc ON gc.name = gt.context
LEFT JOIN users u ON u.id = gt.user_id
WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = gt.id);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_gtd_status
  ON tasks (gtd_status) WHERE gtd_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_gtd_context
  ON tasks (gtd_context_id) WHERE gtd_context_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_is_project
  ON tasks (is_project) WHERE is_project = TRUE;

COMMIT;
