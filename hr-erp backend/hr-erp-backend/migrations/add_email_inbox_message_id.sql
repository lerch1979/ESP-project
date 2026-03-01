-- Add email_message_id and source columns to email_inbox for Gmail universal poller
-- email_message_id: Gmail message ID for deduplication
-- source: 'manual' (default) or 'gmail'

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_inbox' AND column_name = 'email_message_id') THEN
    ALTER TABLE email_inbox ADD COLUMN email_message_id VARCHAR(300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_inbox' AND column_name = 'source') THEN
    ALTER TABLE email_inbox ADD COLUMN source VARCHAR(50) DEFAULT 'manual';
  END IF;
END $$;

-- Unique partial index for deduplication (only non-null message IDs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_inbox_message_id
  ON email_inbox (email_message_id)
  WHERE email_message_id IS NOT NULL;
