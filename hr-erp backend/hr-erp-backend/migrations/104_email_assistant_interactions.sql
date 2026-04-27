-- ============================================================
-- 104_email_assistant_interactions.sql
--
-- Audit log for the email-bridged AI assistant flow. Every inbound
-- non-invoice email that the gmailUniversalPoller hands off to
-- emailAssistant.processEmail produces one row here — even when the
-- assistant can't act (unknown sender, low confidence, actions
-- disabled). Lets admins replay the inbox and reason about behavior.
--
-- The (email_message_id) UNIQUE constraint doubles as the dedup key:
-- a re-poll of the same Gmail message must not produce a second row.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS email_assistant_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Original email ───────────────────────────────────────────
  email_message_id   varchar(255) NOT NULL,
  email_from         varchar(255),
  email_subject      text,
  email_body         text,
  email_received_at  timestamp,

  -- User identification (NULL when sender doesn't match a known user)
  user_id  uuid REFERENCES users(id) ON DELETE SET NULL,

  -- AI analysis (link back to ai_assistant_messages when the analysis
  -- was persisted there as well; NULL if we only logged here).
  ai_message_id  uuid REFERENCES ai_assistant_messages(id) ON DELETE SET NULL,
  intent         varchar(50),
  confidence     numeric(4,3),

  -- Action taken (or 'skipped' / 'logged_only' when read-only mode)
  action_type        varchar(50),
  action_success     boolean,
  created_ticket_id  uuid REFERENCES tickets(id) ON DELETE SET NULL,
  created_task_id    uuid REFERENCES tasks(id)   ON DELETE SET NULL,

  -- Response email (NULL when no reply was sent)
  response_sent        boolean DEFAULT FALSE,
  response_sent_at     timestamp,
  response_message_id  varchar(255),

  -- Free-form notes from the service (rejection reason, error, etc.)
  notes  text,

  created_at  timestamp NOT NULL DEFAULT NOW(),

  CONSTRAINT email_assistant_interactions_msgid_unique UNIQUE (email_message_id)
);

CREATE INDEX IF NOT EXISTS idx_eai_user_created
  ON email_assistant_interactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eai_intent
  ON email_assistant_interactions (intent) WHERE intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eai_created
  ON email_assistant_interactions (created_at DESC);

COMMIT;
