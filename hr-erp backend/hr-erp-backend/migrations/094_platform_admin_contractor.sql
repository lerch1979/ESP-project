-- ============================================================
-- 094_platform_admin_contractor.sql
-- Post-cleanup bootstrap: create the "HR-ERP Platform" operator
-- contractor and assign admin@hr-erp.com to it with the superadmin role.
--
-- Required because 093_cleanup_demo_data.sql removed the demo contractor
-- (ABC Építő Kft) that admin was tied to; the login flow rejects users
-- with no active contractor ("A cég fiók inaktív").
-- ============================================================

BEGIN;

-- Create the platform operator contractor (idempotent via ON CONFLICT on slug).
INSERT INTO contractors (id, name, slug, email, is_active, type)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'HR-ERP Platform',
  'hr-erp-platform',
  'admin@hr-erp.com',
  TRUE,
  'service_provider'
)
ON CONFLICT (slug) DO NOTHING;

-- Attach admin to it.
UPDATE users
SET contractor_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE email = 'admin@hr-erp.com';

-- Grant superadmin role on that contractor (user_roles is the join table).
INSERT INTO user_roles (user_id, role_id, contractor_id)
SELECT u.id, r.id, '00000000-0000-0000-0000-000000000001'::uuid
FROM users u
JOIN roles r ON r.slug = 'superadmin'
WHERE u.email = 'admin@hr-erp.com'
ON CONFLICT DO NOTHING;

-- Sanity check: admin must have a contractor and at least one role.
DO $$
DECLARE
  ok_contractor boolean;
  role_count int;
BEGIN
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
