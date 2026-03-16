-- Migration 055: Complete Audit Triggers
-- Add audit triggers to ALL remaining sensitive tables

-- tickets table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
    DROP TRIGGER IF EXISTS audit_tickets_trigger ON tickets;
    CREATE TRIGGER audit_tickets_trigger
      AFTER INSERT OR UPDATE OR DELETE ON tickets
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- projects table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    DROP TRIGGER IF EXISTS audit_projects_trigger ON projects;
    CREATE TRIGGER audit_projects_trigger
      AFTER INSERT OR UPDATE OR DELETE ON projects
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- payments table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
    DROP TRIGGER IF EXISTS audit_payments_trigger ON payments;
    CREATE TRIGGER audit_payments_trigger
      AFTER INSERT OR UPDATE OR DELETE ON payments
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- chatbot_knowledge_base (content changes should be audited)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chatbot_knowledge_base') THEN
    DROP TRIGGER IF EXISTS audit_chatbot_kb_trigger ON chatbot_knowledge_base;
    CREATE TRIGGER audit_chatbot_kb_trigger
      AFTER INSERT OR UPDATE OR DELETE ON chatbot_knowledge_base
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- permissions table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permissions') THEN
    DROP TRIGGER IF EXISTS audit_permissions_trigger ON permissions;
    CREATE TRIGGER audit_permissions_trigger
      AFTER INSERT OR UPDATE OR DELETE ON permissions
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- role_permissions table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'role_permissions') THEN
    DROP TRIGGER IF EXISTS audit_role_permissions_trigger ON role_permissions;
    CREATE TRIGGER audit_role_permissions_trigger
      AFTER INSERT OR UPDATE OR DELETE ON role_permissions
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- Useful indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type
  ON activity_logs(entity_type);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
  ON activity_logs(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON activity_logs(created_at);

-- Audit summary view for monitoring
CREATE OR REPLACE VIEW audit_summary AS
SELECT
  entity_type,
  action,
  COUNT(*) as count,
  DATE(created_at) as date
FROM activity_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY entity_type, action, DATE(created_at)
ORDER BY date DESC, entity_type, action;
