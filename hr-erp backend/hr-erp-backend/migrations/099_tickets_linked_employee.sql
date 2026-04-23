-- Link a ticket to the employee it's about (e.g. "accommodation complaint
-- for employee X"). Surfaces on that employee's timeline and in the
-- ticket detail's side panel.
BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS linked_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_linked_employee
  ON tickets (linked_employee_id)
  WHERE linked_employee_id IS NOT NULL;

COMMIT;
