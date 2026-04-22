-- Migration 091: Delivery tracking for inspection completion emails
--
-- Each row = one attempt to deliver the completion notice to one resident
-- in their preferred language. Retries increment attempt_count and append
-- to failed_reason — the UI aggregates by (inspection_id, resident_id) to
-- show the latest status per recipient.

BEGIN;

CREATE TABLE IF NOT EXISTS inspection_email_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,

  -- Resident may be a known user (resident_id → users.id) OR an arbitrary
  -- address captured at send-time from a snapshot. Both recorded so the
  -- trail survives user deletions.
  resident_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  resident_name VARCHAR(200),
  email_address VARCHAR(255) NOT NULL,
  language      VARCHAR(5) NOT NULL DEFAULT 'hu',

  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','failed','bounced','skipped')),

  sent_at       TIMESTAMP,
  delivered_at  TIMESTAMP,
  failed_reason TEXT,

  subject           TEXT,
  attachments_count INTEGER DEFAULT 0,
  -- SHA-256 over the canonical JSON payload — lets us prove this exact
  -- email content was sent to this recipient at this moment.
  content_hash      VARCHAR(64),

  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ien_inspection ON inspection_email_notifications(inspection_id);
CREATE INDEX IF NOT EXISTS idx_ien_resident   ON inspection_email_notifications(resident_id);
CREATE INDEX IF NOT EXISTS idx_ien_status     ON inspection_email_notifications(status);
CREATE INDEX IF NOT EXISTS idx_ien_retry      ON inspection_email_notifications(next_retry_at)
  WHERE status = 'failed';

COMMIT;
