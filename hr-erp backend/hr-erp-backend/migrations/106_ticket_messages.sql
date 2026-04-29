-- ============================================================
-- 106_ticket_messages.sql
--
-- Direct chat thread on a ticket. Lives alongside the existing
-- ticket_comments (which is the public commentary stream) — messages
-- here are 1:1-style admin/worker conversation, with read tracking,
-- attachments, and a `source` discriminator so we can distinguish
-- in-app vs email-replied-into-ticket vs WhatsApp later.
--
-- ON DELETE CASCADE on ticket_id: removing a ticket also removes its
-- conversation. Soft-delete on individual messages via deleted_at so
-- senders can retract without losing audit trail.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- Sender (auth-derived). sender_role lets the UI render bubbles
  -- without re-resolving the ticket on every render.
  sender_id   uuid NOT NULL REFERENCES users(id),
  sender_role varchar(20),
    -- 'admin' | 'assigned_worker' | 'related_employee' | 'other'

  message     text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- [{ name, url, size, type }]

  source      varchar(20) NOT NULL DEFAULT 'in_app',
    -- 'in_app' | 'email' | 'whatsapp'
  source_id   varchar(255),
    -- email message-id, etc.

  read_by     jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- [{ user_id, read_at }]

  edited_at   timestamp,
  deleted_at  timestamp,

  created_at  timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket
  ON ticket_messages (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender
  ON ticket_messages (sender_id);
-- Partial index for "unread" / "alive" queries (most reads).
CREATE INDEX IF NOT EXISTS idx_ticket_messages_alive
  ON ticket_messages (ticket_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
