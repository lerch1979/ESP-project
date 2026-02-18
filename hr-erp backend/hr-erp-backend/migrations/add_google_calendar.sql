-- Migration: Google Calendar Integration
-- Tables: google_calendar_tokens, google_calendar_sync_map

-- ============================================================
-- 1. Google Calendar Tokens (OAuth2 tokenek felhasználónként)
-- ============================================================
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  google_email VARCHAR(255),
  calendar_id VARCHAR(255) DEFAULT 'primary',
  webhook_channel_id VARCHAR(255),
  webhook_resource_id VARCHAR(255),
  webhook_expiry TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_tokens_user ON google_calendar_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_tokens_channel ON google_calendar_tokens(webhook_channel_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_google_calendar_tokens_updated_at'
  ) THEN
    CREATE TRIGGER set_google_calendar_tokens_updated_at
      BEFORE UPDATE ON google_calendar_tokens
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 2. Google Calendar Sync Map (HR-ERP ↔ Google event mapping)
-- ============================================================
CREATE TABLE IF NOT EXISTS google_calendar_sync_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_event_id UUID,
  local_event_type VARCHAR(30) CHECK (local_event_type IN ('shift', 'medical_appointment', 'personal_event')),
  google_event_id VARCHAR(255),
  google_calendar_id VARCHAR(255),
  sync_direction VARCHAR(10) NOT NULL CHECK (sync_direction IN ('outbound', 'inbound')),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  local_updated_at TIMESTAMPTZ,
  google_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_map_local
  ON google_calendar_sync_map(user_id, local_event_id, local_event_type)
  WHERE local_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_map_google
  ON google_calendar_sync_map(user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_map_user ON google_calendar_sync_map(user_id);
