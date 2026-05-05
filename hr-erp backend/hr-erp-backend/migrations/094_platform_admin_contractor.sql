-- ============================================================
-- 094_platform_admin_contractor.sql
-- Post-cleanup bootstrap: create the "HR-ERP Platform" operator
-- contractor and assign admin@hr-erp.com to it with the superadmin role.
--
-- Required because 093_cleanup_demo_data.sql removed the demo contractor
-- (ABC Építő Kft) that admin was tied to; the login flow rejects users
-- with no active contractor ("A cég fiók inaktív").
--
-- Idempotent / fresh-DB-safe:
--   1. contractors.type was added out-of-band on prod (no prior
--      migration created it). We add it here with IF NOT EXISTS so
--      the rest of this file can reference it on fresh DBs too.
--   2. The INSERT/UPDATE/asserts are guarded on
--      EXISTS (admin@hr-erp.com), so on a fresh CI DB (where that
--      user has never been seeded) the whole script is a no-op.
-- ============================================================

BEGIN;

-- (1) Backfill the out-of-band contractors.type column.
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS type VARCHAR(50);

-- (2) Create the platform operator contractor — only when admin user
-- already exists, otherwise nothing to attach it to.
INSERT INTO contractors (id, name, slug, email, is_active, type)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'HR-ERP Platform',
  'hr-erp-platform',
  'admin@hr-erp.com',
  TRUE,
  'service_provider'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'admin@hr-erp.com')
ON CONFLICT (slug) DO NOTHING;

-- (3) Attach admin to it (no-op on fresh DB — UPDATE matches 0 rows).
UPDATE users
SET contractor_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE email = 'admin@hr-erp.com';

-- (4) Grant superadmin role (also no-op on fresh DB — SELECT yields 0 rows).
INSERT INTO user_roles (user_id, role_id, contractor_id)
SELECT u.id, r.id, '00000000-0000-0000-0000-000000000001'::uuid
FROM users u
JOIN roles r ON r.slug = 'superadmin'
WHERE u.email = 'admin@hr-erp.com'
ON CONFLICT DO NOTHING;

-- (5) Sanity checks — only enforced when admin user actually exists.
DO $$
DECLARE
  ok_contractor boolean;
  role_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@hr-erp.com') THEN
    RAISE NOTICE '094 platform_admin_contractor: fresh DB — admin asserts skipped';
    RETURN;
  END IF;

  SELECT (contractor_id IS NOT NULL) INTO ok_contractor FROM users WHERE email = 'admin@hr-erp.com';
  SELECT COUNT(*) INTO role_count FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.email = 'admin@hr-erp.com';
  IF NOT ok_contractor THEN
    RAISE EXCEPTION 'admin@hr-erp.com still has no contractor_id';
  END IF;
  IF role_count < 1 THEN
    RAISE EXCEPTION 'admin@hr-erp.com has no roles assigned';
  END IF;
  RAISE NOTICE 'admin@hr-erp.com: contractor_id linked, role_count=%', role_count;
END $$;

COMMIT;
