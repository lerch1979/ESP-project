-- ============================================================================
-- Chatbot Improvements Migration
-- Adds: pg_trgm, full-text search, ticket sequence, resolution tracking
-- ============================================================================

-- 1. Enable pg_trgm extension for fuzzy/typo-tolerant matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add search_vector column for full-text search
ALTER TABLE chatbot_knowledge_base
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 3. Create GIN index on search_vector for FTS
CREATE INDEX IF NOT EXISTS idx_kb_search_vector
  ON chatbot_knowledge_base USING GIN (search_vector);

-- 4. Create GIN trigram index on question for similarity matching
CREATE INDEX IF NOT EXISTS idx_kb_question_trgm
  ON chatbot_knowledge_base USING GIN (question gin_trgm_ops);

-- 5. Create trigger function to auto-populate search_vector
CREATE OR REPLACE FUNCTION chatbot_kb_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.question, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.keywords, ' '), '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.answer, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trg_kb_search_vector ON chatbot_knowledge_base;
CREATE TRIGGER trg_kb_search_vector
  BEFORE INSERT OR UPDATE ON chatbot_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION chatbot_kb_search_vector_update();

-- 6. Backfill search_vector for existing rows
UPDATE chatbot_knowledge_base SET
  search_vector =
    setweight(to_tsvector('simple', COALESCE(question, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(keywords, ' '), '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(answer, '')), 'B');

-- 7. Add 'suggestions' to chatbot_messages.message_type CHECK constraint
-- First drop the existing constraint, then recreate with 'suggestions' included
DO $$
BEGIN
  -- Try to drop existing CHECK constraint on message_type
  BEGIN
    ALTER TABLE chatbot_messages DROP CONSTRAINT IF EXISTS chatbot_messages_message_type_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Add updated CHECK constraint including 'suggestions'
  BEGIN
    ALTER TABLE chatbot_messages ADD CONSTRAINT chatbot_messages_message_type_check
      CHECK (message_type IN ('text', 'options', 'faq_list', 'escalation', 'suggestions'));
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 8. Create ticket_number_seq SEQUENCE starting from MAX existing ticket number + 1
DO $$
DECLARE
  max_num INTEGER;
BEGIN
  -- Extract numeric part from existing ticket numbers (format: #NNNN)
  SELECT COALESCE(MAX(CAST(REPLACE(ticket_number, '#', '') AS INTEGER)), 1000)
    INTO max_num
    FROM tickets;

  -- Create sequence if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'ticket_number_seq') THEN
    EXECUTE format('CREATE SEQUENCE ticket_number_seq START WITH %s', max_num + 1);
  ELSE
    EXECUTE format('ALTER SEQUENCE ticket_number_seq RESTART WITH %s', max_num + 1);
  END IF;
END $$;

-- 9. Add resolution_type column to chatbot_conversations
ALTER TABLE chatbot_conversations
  ADD COLUMN IF NOT EXISTS resolution_type VARCHAR(20);

-- Add CHECK constraint for resolution_type
DO $$
BEGIN
  BEGIN
    ALTER TABLE chatbot_conversations ADD CONSTRAINT chatbot_conversations_resolution_type_check
      CHECK (resolution_type IN ('resolved', 'escalated', 'abandoned') OR resolution_type IS NULL);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 10. Add composite index for message queries
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_conv_sender_created
  ON chatbot_messages (conversation_id, sender_type, created_at);
