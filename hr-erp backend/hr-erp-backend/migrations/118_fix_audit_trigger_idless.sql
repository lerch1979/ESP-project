-- 118_fix_audit_trigger_idless.sql
--
-- Bugfix: audit_trigger_func() assumed every audited row has an `id` column
-- (entity_id := NEW.id / OLD.id). Composite-PK tables like `role_permissions`
-- (PK = role_id, permission_id; no `id`) therefore failed EVERY insert/update/
-- delete with: `record "new" has no field "id"`. This silently froze ALL
-- role-permission management system-wide (grants seeded before the trigger
-- existed survived; no new grant could be written).
--
-- Fix: derive entity_id via a null-tolerant JSON lookup instead of NEW.id/OLD.id.
--   COALESCE((to_jsonb(NEW)->>'id')::uuid, NULL)
-- For tables WITH an id → identical behaviour (logs the row's id).
-- For id-less tables → `->>'id'` yields NULL (no field-access error), so the
-- row is still audited with entity_id = NULL. Audit coverage is preserved for
-- both table shapes; only the crash is removed.
--
-- Idempotent: CREATE OR REPLACE. No data changes.
--
-- Part 2 (same bugfix): activity_logs.entity_id was NOT NULL, so the null-
-- tolerant lookup above would still fail the audit INSERT for id-less tables
-- ("null value in column entity_id violates not-null constraint"). Allow NULL
-- so composite-PK entities can be audited (entity_id = NULL is honest — they
-- have no single id). Backward-compatible: 0 existing rows are null, there is
-- no FK on entity_id, and the btree index tolerates nulls.

ALTER TABLE activity_logs ALTER COLUMN entity_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.audit_trigger_func()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- Determine entity_id and data based on operation.
  -- entity_id uses a null-tolerant JSON lookup so composite-PK / id-less
  -- tables (e.g. role_permissions) are audited instead of erroring.
  IF (TG_OP = 'DELETE') THEN
    entity_id := COALESCE((to_jsonb(OLD)->>'id')::uuid, NULL);
    old_data := to_jsonb(OLD);
    new_data := NULL;
    changes := jsonb_build_object('deleted', old_data);
  ELSIF (TG_OP = 'UPDATE') THEN
    entity_id := COALESCE((to_jsonb(NEW)->>'id')::uuid, NULL);
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
    entity_id := COALESCE((to_jsonb(NEW)->>'id')::uuid, NULL);
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
$function$;
