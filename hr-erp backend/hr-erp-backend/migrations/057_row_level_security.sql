-- Migration 057: Row-Level Security (RLS)
-- Implements PostgreSQL RLS policies for multi-tenant and role-based data isolation.
--
-- Strategy:
--   App sets session vars per request:
--     SET LOCAL app.current_user_id = '<uuid>';
--     SET LOCAL app.current_contractor_id = '<uuid>';
--     SET LOCAL app.current_role = 'admin';
--
--   RLS policies filter rows based on these session vars.
--   Superadmins bypass RLS (via role check in policy).

-- ─── Helper function: get current session vars safely ───────────────────────

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.current_user_id', true)::UUID;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION app_current_contractor_id() RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.current_contractor_id', true)::UUID;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_role', true);
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION app_is_superadmin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_setting('app.current_role', true) = 'superadmin';
EXCEPTION WHEN others THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── Enable RLS on sensitive tables ─────────────────────────────────────────

-- employees: contractor isolation + self-access
DO $$ BEGIN
  ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
  ALTER TABLE employees FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS employees_rls_policy ON employees;
CREATE POLICY employees_rls_policy ON employees
  USING (
    app_is_superadmin()
    OR contractor_id = app_current_contractor_id()
  );

DROP POLICY IF EXISTS employees_rls_insert ON employees;
CREATE POLICY employees_rls_insert ON employees
  FOR INSERT
  WITH CHECK (
    app_is_superadmin()
    OR contractor_id = app_current_contractor_id()
  );

-- users: contractor isolation
DO $$ BEGIN
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE users FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS users_rls_policy ON users;
CREATE POLICY users_rls_policy ON users
  USING (
    app_is_superadmin()
    OR contractor_id = app_current_contractor_id()
    OR id = app_current_user_id()
  );

-- tickets: creator, assignee, or same contractor
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
    ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tickets FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS tickets_rls_policy ON tickets;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
    EXECUTE 'CREATE POLICY tickets_rls_policy ON tickets
      USING (
        app_is_superadmin()
        OR contractor_id = app_current_contractor_id()
      )';
  END IF;
END $$;

-- invoices: contractor isolation
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS invoices_rls_policy ON invoices;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    EXECUTE 'CREATE POLICY invoices_rls_policy ON invoices
      USING (
        app_is_superadmin()
        OR contractor_id = app_current_contractor_id()
      )';
  END IF;
END $$;

-- salary_bands: admin/superadmin only, or own contractor (only if contractor_id column exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_bands' AND column_name = 'contractor_id') THEN
    ALTER TABLE salary_bands ENABLE ROW LEVEL SECURITY;
    ALTER TABLE salary_bands FORCE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS salary_bands_rls_policy ON salary_bands';
    EXECUTE 'CREATE POLICY salary_bands_rls_policy ON salary_bands
      USING (
        app_is_superadmin()
        OR app_current_role() IN (''admin'', ''data_controller'')
        OR contractor_id = app_current_contractor_id()
      )';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'salary_bands') THEN
    -- Table exists but no contractor_id — apply admin-only RLS
    ALTER TABLE salary_bands ENABLE ROW LEVEL SECURITY;
    ALTER TABLE salary_bands FORCE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS salary_bands_rls_policy ON salary_bands';
    EXECUTE 'CREATE POLICY salary_bands_rls_policy ON salary_bands
      USING (
        app_is_superadmin()
        OR app_current_role() IN (''admin'', ''data_controller'')
      )';
  END IF;
END $$;

-- documents: contractor isolation (only if contractor_id column exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'contractor_id') THEN
    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE documents FORCE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS documents_rls_policy ON documents';
    EXECUTE 'CREATE POLICY documents_rls_policy ON documents
      USING (
        app_is_superadmin()
        OR contractor_id = app_current_contractor_id()
      )';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
    -- Table exists but no contractor_id — apply permissive policy
    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE documents FORCE ROW LEVEL SECURITY;
    EXECUTE 'DROP POLICY IF EXISTS documents_rls_policy ON documents';
    EXECUTE 'CREATE POLICY documents_rls_policy ON documents
      USING (
        app_is_superadmin()
        OR app_current_role() IN (''admin'', ''data_controller'')
      )';
  END IF;
END $$;

-- projects: contractor isolation
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE projects FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS projects_rls_policy ON projects;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    EXECUTE 'CREATE POLICY projects_rls_policy ON projects
      USING (
        app_is_superadmin()
        OR contractor_id = app_current_contractor_id()
      )';
  END IF;
END $$;

-- ─── Comments ───────────────────────────────────────────────────────────────

COMMENT ON FUNCTION app_current_user_id() IS 'Returns the current app user UUID from session settings';
COMMENT ON FUNCTION app_current_contractor_id() IS 'Returns the current contractor UUID from session settings';
COMMENT ON FUNCTION app_current_role() IS 'Returns the current user role from session settings';
COMMENT ON FUNCTION app_is_superadmin() IS 'Returns true if current session user is superadmin';
