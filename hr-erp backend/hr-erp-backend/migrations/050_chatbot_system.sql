-- ============================================================================
-- Migration 050: Chatbot System Enhancements
-- Adds: analytics table, feedback fields, confidence scoring, view tracking
-- Builds on migrations 022 (add_chatbot) and 023 (chatbot_improvements)
-- ============================================================================

-- 1. Add feedback & view tracking to knowledge base
ALTER TABLE chatbot_knowledge_base
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_helpful_count INTEGER DEFAULT 0;

-- 2. Add confidence_score, faq_id, helpful to messages
ALTER TABLE chatbot_messages
  ADD COLUMN IF NOT EXISTS faq_id UUID REFERENCES chatbot_knowledge_base(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confidence_score FLOAT,
  ADD COLUMN IF NOT EXISTS helpful BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_chatbot_msg_faq ON chatbot_messages(faq_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_helpful ON chatbot_messages(helpful) WHERE helpful IS NOT NULL;

-- 3. Analytics table (daily aggregates)
CREATE TABLE IF NOT EXISTS chatbot_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_conversations INTEGER DEFAULT 0,
  resolved_by_bot INTEGER DEFAULT 0,
  escalated_to_ticket INTEGER DEFAULT 0,
  abandoned INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  user_messages INTEGER DEFAULT 0,
  bot_messages INTEGER DEFAULT 0,
  avg_confidence_score FLOAT,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  top_unresolved_queries JSONB DEFAULT '[]',
  top_categories JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(contractor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_analytics_contractor ON chatbot_analytics(contractor_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_analytics_date ON chatbot_analytics(date);
CREATE INDEX IF NOT EXISTS idx_chatbot_analytics_contractor_date ON chatbot_analytics(contractor_id, date DESC);

-- 4. Updated_at trigger for analytics
DROP TRIGGER IF EXISTS update_chatbot_analytics_updated_at ON chatbot_analytics;
CREATE TRIGGER update_chatbot_analytics_updated_at
  BEFORE UPDATE ON chatbot_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Add message count index for conversation stats
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_conv_created
  ON chatbot_messages(conversation_id, created_at DESC);

-- 6. Add index for conversation date range queries
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_created
  ON chatbot_conversations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chatbot_conv_contractor_created
  ON chatbot_conversations(contractor_id, created_at DESC);
