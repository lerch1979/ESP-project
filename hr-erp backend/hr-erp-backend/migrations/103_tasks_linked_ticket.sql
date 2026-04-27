-- ============================================================
-- 103_tasks_linked_ticket.sql
--
-- Lets a ticket fan out into multiple sub-tasks assigned to different
-- workers. The ticket retains its single `assigned_to` (main responsible);
-- supplementary tasks live in `tasks` with linked_ticket_id pointing back.
--
-- ON DELETE SET NULL — deleting a ticket leaves its child tasks alive
-- (they may already be done and worth keeping for audit).
-- ============================================================

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS linked_ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_linked_ticket
  ON tasks (linked_ticket_id) WHERE linked_ticket_id IS NOT NULL;

COMMIT;
