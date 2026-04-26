-- ============================================================
-- 101_ai_assistant_messages.sql
-- Conversation log for the AI Assistant. One row per user turn:
-- the user's message, Claude's classification (intent/entities), the
-- action that was taken (or skipped), and any record IDs that were
-- created. Indexes support per-user history, intent stats, time range.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_assistant_messages (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  uuid REFERENCES users(id) ON DELETE CASCADE,

  -- Inbound (user)
  user_message             text NOT NULL,
  user_language            varchar(5),
  attachments              jsonb,

  -- Claude analysis
  intent                   varchar(50),
  confidence               numeric(3,2),
  entities                 jsonb,

  -- Outbound (AI)
  ai_response              text,
  ai_response_language     varchar(5),

  -- Action that ran (may be skipped if confidence < threshold)
  action_type              varchar(50),
  action_params            jsonb,
  action_success           boolean,
  action_result            jsonb,

  -- Record IDs created by the action (any/all may be NULL)
  created_ticket_id        uuid REFERENCES tickets(id)        ON DELETE SET NULL,
  created_damage_report_id uuid REFERENCES damage_reports(id) ON DELETE SET NULL,
  created_task_id          uuid REFERENCES tasks(id)          ON DELETE SET NULL,

  -- User feedback (👍/👎)
  user_feedback            varchar(20) CHECK (user_feedback IN ('helpful', 'not_helpful')),
  feedback_comment         text,

  created_at               timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_user    ON ai_assistant_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_intent  ON ai_assistant_messages(intent);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created ON ai_assistant_messages(created_at DESC);

COMMIT;
