-- Track who last edited an employee_notes row so the timeline can show
-- an "edited" badge and audit who made the change. created_by + updated_at
-- already exist; we only need updated_by.
BEGIN;

ALTER TABLE employee_notes
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
