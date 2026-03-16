-- Migration 056: Password Policies
-- Track password history, expiration, and failed login attempts

-- Password history table (stores hashed passwords, never plaintext)
CREATE TABLE IF NOT EXISTS password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_id
  ON password_history(user_id);

-- Add password policy columns to users table
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP WITH TIME ZONE DEFAULT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Security events log (for monitoring suspicious activity)
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_type
  ON security_events(event_type);

CREATE INDEX IF NOT EXISTS idx_security_events_severity
  ON security_events(severity) WHERE severity IN ('warning', 'critical');

CREATE INDEX IF NOT EXISTS idx_security_events_user_id
  ON security_events(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_created_at
  ON security_events(created_at);

-- Audit trigger on security_events itself
DROP TRIGGER IF EXISTS audit_security_events_trigger ON security_events;
-- No audit trigger on security_events (would cause infinite loop)

COMMENT ON TABLE password_history IS 'Stores last N password hashes to prevent reuse';
COMMENT ON TABLE security_events IS 'Security event log for monitoring and alerting';
