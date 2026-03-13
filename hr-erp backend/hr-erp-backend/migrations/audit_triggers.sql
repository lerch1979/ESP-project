-- Migration 041: Audit Triggers
-- Auto-log INSERT/UPDATE/DELETE on sensitive tables to activity_logs.
-- Uses PostgreSQL trigger functions for automatic audit trail.

-- Step 1: Create the audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  old_data JSONB;
  new_data JSONB;
  changes JSONB;
  action_type VARCHAR(20);
  entity_id UUID;
  app_user_id UUID;
BEGIN
  -- Determine action type
  action_type := TG_OP;

  -- Try to get the application user_id from session variable (set by the app)
  BEGIN
    app_user_id := current_setting('app.current_user_id', true)::UUID;
  EXCEPTION WHEN others THEN
    app_user_id := NULL;
  END;

  -- Determine entity_id and data based on operation
  IF (TG_OP = 'DELETE') THEN
    entity_id := OLD.id;
    old_data := to_jsonb(OLD);
    new_data := NULL;
    changes := jsonb_build_object('deleted', old_data);
  ELSIF (TG_OP = 'UPDATE') THEN
    entity_id := NEW.id;
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    -- Build changes object: only include fields that actually changed
    changes := '{}'::JSONB;
    DECLARE
      key TEXT;
      old_val JSONB;
      new_val JSONB;
    BEGIN
      FOR key IN SELECT jsonb_object_keys(new_data)
      LOOP
        old_val := old_data -> key;
        new_val := new_data -> key;
        IF old_val IS DISTINCT FROM new_val THEN
          -- Skip updated_at as it always changes
          IF key != 'updated_at' THEN
            changes := changes || jsonb_build_object(
              key, jsonb_build_object('old', old_val, 'new', new_val)
            );
          END IF;
        END IF;
      END LOOP;
    END;
    -- Skip if no meaningful changes
    IF changes = '{}'::JSONB THEN
      RETURN NEW;
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    entity_id := NEW.id;
    old_data := NULL;
    new_data := to_jsonb(NEW);
    changes := jsonb_build_object('created', new_data);
  END IF;

  -- Insert audit log entry
  INSERT INTO activity_logs (
    user_id,
    entity_type,
    entity_id,
    action,
    changes,
    metadata,
    created_at
  ) VALUES (
    app_user_id,
    TG_TABLE_NAME,
    entity_id,
    action_type,
    changes,
    jsonb_build_object(
      'trigger', true,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA
    ),
    NOW()
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create triggers on sensitive tables

-- employees table
DROP TRIGGER IF EXISTS audit_employees_trigger ON employees;
CREATE TRIGGER audit_employees_trigger
  AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- users table
DROP TRIGGER IF EXISTS audit_users_trigger ON users;
CREATE TRIGGER audit_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- invoices table (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    DROP TRIGGER IF EXISTS audit_invoices_trigger ON invoices;
    CREATE TRIGGER audit_invoices_trigger
      AFTER INSERT OR UPDATE OR DELETE ON invoices
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- salary_bands table (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'salary_bands') THEN
    DROP TRIGGER IF EXISTS audit_salary_bands_trigger ON salary_bands;
    CREATE TRIGGER audit_salary_bands_trigger
      AFTER INSERT OR UPDATE OR DELETE ON salary_bands
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- employee_salaries table (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_salaries') THEN
    DROP TRIGGER IF EXISTS audit_employee_salaries_trigger ON employee_salaries;
    CREATE TRIGGER audit_employee_salaries_trigger
      AFTER INSERT OR UPDATE OR DELETE ON employee_salaries
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- Step 3: Add index for trigger-based audit entries
CREATE INDEX IF NOT EXISTS idx_activity_logs_trigger
  ON activity_logs ((metadata->>'trigger'))
  WHERE metadata->>'trigger' = 'true';
