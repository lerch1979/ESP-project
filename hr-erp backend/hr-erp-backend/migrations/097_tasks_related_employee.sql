-- Surface "task was created from employee X's timeline" so we can show the
-- task on that employee's timeline tab. Optional link — most tasks (project
-- tasks etc.) have no related employee.
BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS related_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_related_employee
  ON tasks (related_employee_id)
  WHERE related_employee_id IS NOT NULL;

COMMIT;
