-- Migration 076: Add source-language tracking to translatable tables (ADDITIVE ONLY)
--
-- Why: the Claude translation service (src/services/translation.service.js) translates
-- content to the viewer's preferred_language on read. To do that correctly, each row
-- needs to know what language it was originally written in. Migration 075 already
-- added `language` to `tickets`; this adds the same column to the other user-generated
-- content tables we translate at read-time.
--
-- Safe to re-run: every ALTER is guarded by IF NOT EXISTS / information_schema checks.

BEGIN;

-- ── damage_reports.language ─────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'damage_reports' AND column_name = 'language'
  ) THEN
    ALTER TABLE damage_reports ADD COLUMN language VARCHAR(5) DEFAULT 'hu';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_damage_reports_language ON damage_reports(language);

-- ── ticket_comments.language ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_comments' AND column_name = 'language'
  ) THEN
    ALTER TABLE ticket_comments ADD COLUMN language VARCHAR(5) DEFAULT 'hu';
  END IF;
END $$;

-- ── chatbot_messages.language ───────────────────────────────────────
-- Tracks the language of each individual message (user messages reflect the
-- sender's preferred_language; bot messages are generated in Hungarian by
-- default and translated on read).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chatbot_messages' AND column_name = 'language'
  ) THEN
    ALTER TABLE chatbot_messages ADD COLUMN language VARCHAR(5) DEFAULT 'hu';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_language ON chatbot_messages(language);

COMMIT;
