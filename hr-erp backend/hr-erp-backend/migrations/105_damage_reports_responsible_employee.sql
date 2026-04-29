-- ============================================================
-- 105_damage_reports_responsible_employee.sql
--
-- Fix the structural mismatch flagged by Bug 3:
--
--   damage_reports.employee_id FK references users(id), but the
--   workforce lives entirely in `employees` — 0 of 286 employees
--   have a user_id link, so no actual resident can be set as the
--   damage causer through that column.
--
-- This migration:
--   (a) Adds responsible_employee_id uuid REFERENCES employees(id)
--       ON DELETE SET NULL — the proper FK for "who caused the damage".
--   (b) Drops NOT NULL on the legacy employee_id column so new flows
--       can stop populating it. We keep the column itself for now —
--       removing it would break any historical query that joins on it.
--   (c) Backfills responsible_employee_id from the source ticket's
--       linked_employee_id where one exists. Reports created from
--       free-form (createManual) without a ticket stay NULL — admins
--       can fix those via the new edit-modal employee picker.
--
-- Indexed for typical "list reports for this resident" queries.
-- ============================================================

BEGIN;

ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS responsible_employee_id uuid
    REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE damage_reports
  ALTER COLUMN employee_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dr_responsible_employee
  ON damage_reports (responsible_employee_id)
  WHERE responsible_employee_id IS NOT NULL;

-- Backfill from the source ticket. Idempotent — only fills NULLs.
UPDATE damage_reports dr
   SET responsible_employee_id = t.linked_employee_id
  FROM tickets t
 WHERE t.id = dr.ticket_id
   AND t.linked_employee_id IS NOT NULL
   AND dr.responsible_employee_id IS NULL;

COMMIT;
