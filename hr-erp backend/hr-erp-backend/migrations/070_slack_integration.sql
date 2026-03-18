-- ============================================================================
-- Migration 070: Slack Integration
-- Daily check-in bot, emoji responses → pulse surveys
-- ============================================================================

-- Slack user mapping
CREATE TABLE IF NOT EXISTS slack_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES contractors(id),
  slack_user_id VARCHAR(50) UNIQUE NOT NULL,
  slack_email VARCHAR(255),
  slack_real_name VARCHAR(255),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Slack check-in schedule config (one per contractor)
CREATE TABLE IF NOT EXISTS slack_checkin_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES contractors(id) UNIQUE,
  enabled BOOLEAN DEFAULT false,
  check_in_time TIME DEFAULT '09:00:00',
  timezone VARCHAR(50) DEFAULT 'Europe/Budapest',
  message_template TEXT DEFAULT 'Szia! 👋 Hogy érzed magad ma?',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Track sent messages for response correlation
CREATE TABLE IF NOT EXISTS slack_checkin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_user_id VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id),
  contractor_id UUID REFERENCES contractors(id),
  message_ts VARCHAR(50) NOT NULL,
  channel_id VARCHAR(50) NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP,
  response_emoji VARCHAR(50),
  pulse_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_slack_users_user ON slack_users(user_id);
CREATE INDEX IF NOT EXISTS idx_slack_users_slack_id ON slack_users(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_slack_users_contractor ON slack_users(contractor_id);
CREATE INDEX IF NOT EXISTS idx_slack_messages_user ON slack_checkin_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_slack_messages_ts ON slack_checkin_messages(message_ts);
CREATE INDEX IF NOT EXISTS idx_slack_messages_sent ON slack_checkin_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_slack_messages_contractor ON slack_checkin_messages(contractor_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_slack_config_contractor ON slack_checkin_config(contractor_id);
