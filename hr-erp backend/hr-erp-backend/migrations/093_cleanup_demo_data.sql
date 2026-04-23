-- ============================================================
-- 093_cleanup_demo_data.sql
-- Remove pre-production demo / seed / bulk-test data.
--
-- BEFORE RUNNING: take a backup (scripts/backup-database.sh or pg_dump -F c).
-- This migration runs inside a single transaction; anything raised ERROR
-- will roll the whole thing back.
--
-- Scope:
--   A. Bulk-imported test employees      (~2292 rows, from generate_test_employees.js)
--   B. Demo contractors                  (ABC/XYZ, ABC Építő — 3 rows)
--   C. Demo employees tied to (B)        (~9 rows)
--   D. Dev-test inspections              (3 completed-test runs on Bük, Apr 22)
--   E. Demo tickets                      (7 seeded rows)
--
-- Preserved:
--   - admin@hr-erp.com is unlinked from the demo contractor (cat B) so it
--     survives the user delete.
--   - 16 real accommodations + accommodation_rooms — untouched.
-- ============================================================

BEGIN;

-- ── Unlink admin from demo contractor so it isn't swept up ─────
-- admin@hr-erp.com currently has contractor_id = ABC Építő Kft (a demo row
-- that gets deleted in cat B). Admin is a real operator account; NULL
-- contractor is the intended post-cleanup state.
UPDATE users
SET contractor_id = NULL
WHERE email = 'admin@hr-erp.com' AND contractor_id IS NOT NULL;

-- ── D. Dev-test inspections (delete first — they reference demo users) ──
DELETE FROM inspection_photos WHERE inspection_id IN (
  '91125276-20ed-4c64-af50-202a6a9f5ab4',
  'cb29f000-9645-4386-8c99-bfc884b0a74a',
  '04bb1a3b-29ff-49ba-bede-f093d24ca18d'
);
DELETE FROM inspection_item_scores WHERE inspection_id IN (
  '91125276-20ed-4c64-af50-202a6a9f5ab4',
  'cb29f000-9645-4386-8c99-bfc884b0a74a',
  '04bb1a3b-29ff-49ba-bede-f093d24ca18d'
);
DELETE FROM inspection_damages WHERE inspection_id IN (
  '91125276-20ed-4c64-af50-202a6a9f5ab4',
  'cb29f000-9645-4386-8c99-bfc884b0a74a',
  '04bb1a3b-29ff-49ba-bede-f093d24ca18d'
);
DELETE FROM inspection_email_notifications WHERE inspection_id IN (
  '91125276-20ed-4c64-af50-202a6a9f5ab4',
  'cb29f000-9645-4386-8c99-bfc884b0a74a',
  '04bb1a3b-29ff-49ba-bede-f093d24ca18d'
);
DELETE FROM inspections WHERE id IN (
  '91125276-20ed-4c64-af50-202a6a9f5ab4',
  'cb29f000-9645-4386-8c99-bfc884b0a74a',
  '04bb1a3b-29ff-49ba-bede-f093d24ca18d'
);

-- ── E. Demo tickets (delete before users — they have created_by/assigned_to) ──
DELETE FROM ticket_attachments WHERE ticket_id IN (
  '3e15f691-4edf-439f-a369-47c711e60c8a','da2a1135-f688-4ddd-868d-ba72bfb0e850',
  'a2464e24-6f42-458e-b091-75e4f202da73','da8df017-80e3-4c98-90e5-d7bbf92fd487',
  '445ce34e-e014-477a-9636-e49bda5abcdc','1c7c8400-54a9-4f7b-9878-b291f5bd267e',
  '82817f73-ab1a-49ef-a8f7-9393485160cb'
);
DELETE FROM ticket_comments WHERE ticket_id IN (
  '3e15f691-4edf-439f-a369-47c711e60c8a','da2a1135-f688-4ddd-868d-ba72bfb0e850',
  'a2464e24-6f42-458e-b091-75e4f202da73','da8df017-80e3-4c98-90e5-d7bbf92fd487',
  '445ce34e-e014-477a-9636-e49bda5abcdc','1c7c8400-54a9-4f7b-9878-b291f5bd267e',
  '82817f73-ab1a-49ef-a8f7-9393485160cb'
);
DELETE FROM ticket_history WHERE ticket_id IN (
  '3e15f691-4edf-439f-a369-47c711e60c8a','da2a1135-f688-4ddd-868d-ba72bfb0e850',
  'a2464e24-6f42-458e-b091-75e4f202da73','da8df017-80e3-4c98-90e5-d7bbf92fd487',
  '445ce34e-e014-477a-9636-e49bda5abcdc','1c7c8400-54a9-4f7b-9878-b291f5bd267e',
  '82817f73-ab1a-49ef-a8f7-9393485160cb'
);
DELETE FROM tickets WHERE id IN (
  '3e15f691-4edf-439f-a369-47c711e60c8a','da2a1135-f688-4ddd-868d-ba72bfb0e850',
  'a2464e24-6f42-458e-b091-75e4f202da73','da8df017-80e3-4c98-90e5-d7bbf92fd487',
  '445ce34e-e014-477a-9636-e49bda5abcdc','1c7c8400-54a9-4f7b-9878-b291f5bd267e',
  '82817f73-ab1a-49ef-a8f7-9393485160cb'
);

-- ── A. Bulk-imported test employees (2292 rows, contractor_id IS NULL) ──
DELETE FROM employee_documents WHERE employee_id IN (
  SELECT id FROM employees WHERE contractor_id IS NULL
);
DELETE FROM employee_salaries WHERE employee_id IN (
  SELECT id FROM employees WHERE contractor_id IS NULL
);
DELETE FROM employee_notes WHERE employee_id IN (
  SELECT id FROM employees WHERE contractor_id IS NULL
);
DELETE FROM employees WHERE contractor_id IS NULL;

-- ── C. Demo employees (tied to demo contractors via B) ─────────
DELETE FROM employee_documents WHERE employee_id IN (
  SELECT id FROM employees WHERE contractor_id IN (
    '11111111-1111-1111-1111-111111111111',
    '5fde1a99-6f6e-40ac-a476-742c5b79cc6c',
    '1a616a7c-9d51-4737-9bef-2f27d8324395'
  )
);
DELETE FROM employee_salaries WHERE employee_id IN (
  SELECT id FROM employees WHERE contractor_id IN (
    '11111111-1111-1111-1111-111111111111',
    '5fde1a99-6f6e-40ac-a476-742c5b79cc6c',
    '1a616a7c-9d51-4737-9bef-2f27d8324395'
  )
);
DELETE FROM employee_notes WHERE employee_id IN (
  SELECT id FROM employees WHERE contractor_id IN (
    '11111111-1111-1111-1111-111111111111',
    '5fde1a99-6f6e-40ac-a476-742c5b79cc6c',
    '1a616a7c-9d51-4737-9bef-2f27d8324395'
  )
);
DELETE FROM employees WHERE contractor_id IN (
  '11111111-1111-1111-1111-111111111111',
  '5fde1a99-6f6e-40ac-a476-742c5b79cc6c',
  '1a616a7c-9d51-4737-9bef-2f27d8324395'
);

-- ── Clean up all user-referencing rows for the 12 demo users ───
-- Discovered via information_schema FK enumeration. Admin is already
-- unlinked above (contractor_id = NULL), so the subquery excludes it.
CREATE TEMP TABLE __demo_user_ids ON COMMIT DROP AS
  SELECT id FROM users
  WHERE contractor_id IN (
    '11111111-1111-1111-1111-111111111111',
    '5fde1a99-6f6e-40ac-a476-742c5b79cc6c',
    '1a616a7c-9d51-4737-9bef-2f27d8324395'
  );

DELETE FROM activity_logs          WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM chatbot_conversations  WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM damage_reports         WHERE created_by          IN (SELECT id FROM __demo_user_ids);
DELETE FROM damage_reports         WHERE employee_id         IN (SELECT id FROM __demo_user_ids);
DELETE FROM gtd_tasks              WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM notifications          WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM scheduled_reports      WHERE created_by          IN (SELECT id FROM __demo_user_ids);
DELETE FROM tasks                  WHERE assigned_to         IN (SELECT id FROM __demo_user_ids)
                                      OR created_by          IN (SELECT id FROM __demo_user_ids);
DELETE FROM user_roles             WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM user_workload          WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM wellbeing_audit_log    WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM wellbeing_notifications WHERE user_id            IN (SELECT id FROM __demo_user_ids);
DELETE FROM wellbeing_points       WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM wellbeing_referrals    WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM wellbeing_streaks      WHERE user_id             IN (SELECT id FROM __demo_user_ids);
DELETE FROM wellmind_pulse_surveys WHERE user_id             IN (SELECT id FROM __demo_user_ids);

-- cost_centers.created_by / invoices.created_by / projects.created_by|project_manager_id
-- may be NOT NULL. Try NULLing first (for operational-style audit fields); if the
-- column is NOT NULL, delete the row instead. These are all demo seed rows too.
UPDATE  cost_centers SET created_by = NULL WHERE created_by IN (SELECT id FROM __demo_user_ids);
UPDATE  invoices     SET created_by = NULL WHERE created_by IN (SELECT id FROM __demo_user_ids);
UPDATE  projects     SET created_by = NULL WHERE created_by IN (SELECT id FROM __demo_user_ids);
UPDATE  projects     SET project_manager_id = NULL WHERE project_manager_id IN (SELECT id FROM __demo_user_ids);
UPDATE  employee_documents SET uploaded_by = NULL WHERE uploaded_by IN (SELECT id FROM __demo_user_ids);
UPDATE  employee_notes     SET created_by  = NULL WHERE created_by  IN (SELECT id FROM __demo_user_ids);
UPDATE  employees          SET user_id     = NULL WHERE user_id     IN (SELECT id FROM __demo_user_ids);
UPDATE  ticket_comments    SET user_id     = NULL WHERE user_id     IN (SELECT id FROM __demo_user_ids);
UPDATE  ticket_history     SET user_id     = NULL WHERE user_id     IN (SELECT id FROM __demo_user_ids);

-- ── Delete the demo users themselves ───────────────────────────
DELETE FROM users WHERE id IN (SELECT id FROM __demo_user_ids);

-- ── B. Demo contractors — clear all incoming references first ─
-- Discovered via information_schema FK enumeration against contractors.id.
CREATE TEMP TABLE __demo_contractor_ids ON COMMIT DROP AS
  SELECT unnest(ARRAY[
    '11111111-1111-1111-1111-111111111111'::uuid,
    '5fde1a99-6f6e-40ac-a476-742c5b79cc6c'::uuid,
    '1a616a7c-9d51-4737-9bef-2f27d8324395'::uuid
  ]) AS id;

-- Real accommodations keep their rows — only clear the demo-contractor link
UPDATE accommodations SET current_contractor_id = NULL
  WHERE current_contractor_id IN (SELECT id FROM __demo_contractor_ids);
-- Link tables: safe to delete all rows
DELETE FROM accommodation_contractors WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);

-- Demo-contractor-scoped config / content — safe to delete (all seeded)
DELETE FROM chatbot_conversations  WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM chatbot_knowledge_base WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM chatbot_faq_categories WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM chatbot_config         WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
-- invoices must go BEFORE cost_centers (invoices.cost_center_id FK)
DELETE FROM invoices               WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM damage_reports         WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM cost_centers           WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM organizational_units   WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM projects               WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM tasks                  WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM ticket_categories      WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM user_roles             WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM wellbeing_audit_log    WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM wellbeing_notifications WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM wellbeing_points       WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM wellbeing_referrals    WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);
DELETE FROM wellmind_pulse_surveys WHERE contractor_id IN (SELECT id FROM __demo_contractor_ids);

DELETE FROM contractors WHERE id IN (SELECT id FROM __demo_contractor_ids);

-- ── Post-cleanup sanity checks ─────────────────────────────────
DO $$
DECLARE
  emp_count int; contractor_count int; inspection_count int;
  ticket_count int; user_count int; accommodation_count int;
BEGIN
  SELECT COUNT(*) INTO emp_count FROM employees;
  SELECT COUNT(*) INTO contractor_count FROM contractors;
  SELECT COUNT(*) INTO inspection_count FROM inspections;
  SELECT COUNT(*) INTO ticket_count FROM tickets;
  SELECT COUNT(*) INTO user_count FROM users;
  SELECT COUNT(*) INTO accommodation_count FROM accommodations;
  RAISE NOTICE 'post-cleanup: employees=%, contractors=%, inspections=%, tickets=%, users=%, accommodations=%',
    emp_count, contractor_count, inspection_count, ticket_count, user_count, accommodation_count;
  IF user_count != 1 THEN
    RAISE EXCEPTION 'expected exactly 1 user (admin@hr-erp.com), got %', user_count;
  END IF;
  IF accommodation_count != 16 THEN
    RAISE EXCEPTION 'expected 16 accommodations preserved, got %', accommodation_count;
  END IF;
END $$;

COMMIT;
