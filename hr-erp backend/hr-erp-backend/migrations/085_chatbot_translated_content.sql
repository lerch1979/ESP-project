-- Migration 085: Add translated_content + is_translated columns to chatbot_messages
--
-- Why: the chatbot always stores bot replies in canonical Hungarian (the bot
-- generation pipeline — FAQ matching, decision trees, Claude prompts — is
-- Hungarian-centric). To avoid re-translating on every read for the original
-- user, we cache their language-specific rendering alongside the canonical
-- Hungarian text in `content`.
--
--   content              -> canonical Hungarian (bot) / original text (user)
--   translated_content   -> user-language rendering of a bot reply (nullable)
--   is_translated        -> true when translated_content was populated at write-time
--
-- Admins always see Hungarian, so they read `content` directly (or get the
-- user message translated on-demand via translation_cache).
--
-- Safe to re-run: guarded by information_schema checks.

BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chatbot_messages' AND column_name='translated_content') THEN
    ALTER TABLE chatbot_messages ADD COLUMN translated_content TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chatbot_messages' AND column_name='is_translated') THEN
    ALTER TABLE chatbot_messages ADD COLUMN is_translated BOOLEAN DEFAULT false;
  END IF;
END $$;
COMMIT;
