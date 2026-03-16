-- Migration 053: Add AI context support to chatbot
-- Adds conversation_context JSONB to track multi-turn context
-- Adds ai_model tracking to messages for analytics

-- Conversation context for multi-turn AI support
ALTER TABLE chatbot_conversations
  ADD COLUMN IF NOT EXISTS conversation_context JSONB DEFAULT '{}';

-- Track which AI model generated the response (null = keyword match)
ALTER TABLE chatbot_messages
  ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100) DEFAULT NULL;

-- Track if response was AI-enhanced
ALTER TABLE chatbot_messages
  ADD COLUMN IF NOT EXISTS ai_enhanced BOOLEAN DEFAULT FALSE;

-- Index for analytics queries on AI usage
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_ai_model
  ON chatbot_messages(ai_model) WHERE ai_model IS NOT NULL;

-- AI usage statistics view
CREATE OR REPLACE VIEW chatbot_ai_stats AS
SELECT
  DATE(m.created_at) AS date,
  COUNT(*) FILTER (WHERE m.ai_model IS NOT NULL) AS ai_responses,
  COUNT(*) FILTER (WHERE m.ai_model IS NULL AND m.sender_type = 'bot') AS keyword_responses,
  COUNT(*) FILTER (WHERE m.ai_enhanced = true) AS ai_enhanced_responses,
  ROUND(
    COUNT(*) FILTER (WHERE m.ai_model IS NOT NULL)::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE m.sender_type = 'bot'), 0) * 100, 1
  ) AS ai_usage_pct
FROM chatbot_messages m
WHERE m.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(m.created_at)
ORDER BY date DESC;
