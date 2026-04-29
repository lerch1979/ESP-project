-- ============================================================
-- 107_task_assignees_and_photos.sql
--
-- Multi-assignee task model. tasks.assigned_to stays as the "main
-- responsible" (Felelős). task_assignees is a join table for ADDITIONAL
-- helpers, with per-person visited / completed status.
--
-- task_photos is a sibling table for photos attached to a task — the
-- file storage path lands in this migration so the upload UI can be
-- built without another schema change. (The actual upload route ships
-- in a follow-up; the schema is reserved here so callers can write to
-- task_photos.photo_url without reshaping anything.)
--
-- tasks.completion_status (pending / in_progress / completed) gives the
-- top-level state. tasks.deadline is the cutoff time (vs the existing
-- date-only due_date which we keep for back-compat).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS task_assignees (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role         varchar(20) NOT NULL DEFAULT 'helper',
    -- 'helper' | 'maintenance' | 'supervisor' | 'observer' | etc.
    -- Free-form for now; the UI only differentiates main vs helper.

  status       varchar(20) NOT NULL DEFAULT 'pending',
    -- 'pending' | 'visited' | 'completed' | 'cancelled'

  visited_at        timestamp,
  completed_at      timestamp,
  completion_notes  text,
  notified_at       timestamp,

  created_at   timestamp NOT NULL DEFAULT NOW(),

  CONSTRAINT task_assignees_unique UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees (user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees (task_id);
-- Partial index for "my open tasks" queries on the homepage widget.
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_open
  ON task_assignees (user_id, task_id)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE TABLE IF NOT EXISTS task_photos (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by   uuid NOT NULL REFERENCES users(id),

  photo_url     text NOT NULL,           -- relative to UPLOADS_BASE
  photo_type    varchar(20),             -- 'before' | 'during' | 'after' | NULL
  caption       text,
  size_bytes    integer,                 -- written by the upload route
  width         integer,
  height        integer,

  created_at    timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_photos_task ON task_photos (task_id, created_at DESC);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deadline timestamp,
  ADD COLUMN IF NOT EXISTS completion_status varchar(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS completion_summary text;

COMMIT;
