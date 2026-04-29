/**
 * Ticket-thread chat (migration 106).
 *
 *   GET    /api/v1/tickets/:ticketId/messages
 *   POST   /api/v1/tickets/:ticketId/messages
 *   PATCH  /api/v1/tickets/:ticketId/messages/:messageId/read
 *   DELETE /api/v1/tickets/:ticketId/messages/:messageId
 *
 * Posting a message also fires in-app notifications to the OTHER parties
 * on the ticket (creator / assigned worker / linked employee's user) —
 * never to the sender themselves. Failures in the notification path are
 * non-fatal: the message is already persisted and matters more than the
 * push.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const inApp = require('../services/inAppNotification.service');

// Resolve sender_role from the ticket context. 'admin' wins over the
// other roles for users who happen to also be linked to the ticket.
async function _detectSenderRole(ticketId, userId) {
  const r = await query(
    `SELECT
       t.contractor_id, t.created_by, t.assigned_to,
       e.user_id AS linked_employee_user_id,
       EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1 AND r.slug IN ('admin', 'superadmin')
       ) AS is_admin
     FROM tickets t
     LEFT JOIN employees e ON e.id = t.linked_employee_id
     WHERE t.id = $2
     LIMIT 1`,
    [userId, ticketId]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  if (row.is_admin)                              return 'admin';
  if (row.assigned_to === userId)                return 'assigned_worker';
  if (row.linked_employee_user_id === userId)    return 'related_employee';
  return 'other';
}

// Recipients = everyone touching this ticket EXCEPT the sender.
// Returns an array of user UUIDs.
async function _findRecipients(ticketId, senderId) {
  const r = await query(
    `SELECT DISTINCT u.id
       FROM tickets t
       LEFT JOIN employees e ON e.id = t.linked_employee_id
       LEFT JOIN users le_user ON le_user.id = e.user_id
       LEFT JOIN users creator ON creator.id = t.created_by
       LEFT JOIN users assignee ON assignee.id = t.assigned_to
       JOIN users u ON u.id IN (creator.id, assignee.id, le_user.id)
      WHERE t.id = $1 AND u.id <> $2 AND u.is_active = TRUE`,
    [ticketId, senderId]
  );
  return r.rows.map(x => x.id);
}

// ── GET /messages ─────────────────────────────────────────────────────
const list = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const r = await query(
      `SELECT m.id, m.ticket_id, m.sender_id, m.sender_role, m.message,
              m.attachments, m.source, m.source_id, m.read_by,
              m.edited_at, m.created_at,
              u.first_name AS sender_first_name,
              u.last_name  AS sender_last_name,
              u.email      AS sender_email
         FROM ticket_messages m
         LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.ticket_id = $1 AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC
        LIMIT 500`,
      [ticketId]
    );
    res.json({ success: true, data: { messages: r.rows } });
  } catch (err) {
    logger.error('[ticketMessages.list]', err);
    res.status(500).json({ success: false, message: 'Üzenetek betöltési hiba' });
  }
};

// ── POST /messages ────────────────────────────────────────────────────
const send = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message, attachments } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Üzenet kötelező' });
    }

    const role = await _detectSenderRole(ticketId, req.user.id);
    if (!role) return res.status(404).json({ success: false, message: 'Hibajegy nem található' });

    const ins = await query(
      `INSERT INTO ticket_messages
         (ticket_id, sender_id, sender_role, message, attachments, source)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'in_app')
       RETURNING *`,
      [ticketId, req.user.id, role, message.trim(), JSON.stringify(attachments || [])]
    );
    const created = ins.rows[0];

    // Best-effort fan-out to other parties. Do not block the response.
    (async () => {
      try {
        const recipients = await _findRecipients(ticketId, req.user.id);
        if (recipients.length === 0) return;
        const t = await query(
          `SELECT t.ticket_number, t.contractor_id,
                  s.first_name || ' ' || s.last_name AS sender_name
             FROM tickets t
             LEFT JOIN users s ON s.id = $2
            WHERE t.id = $1`,
          [ticketId, req.user.id]
        );
        const tk = t.rows[0] || {};
        const preview = String(message).trim().slice(0, 80);
        for (const userId of recipients) {
          await inApp.notify({
            userId,
            contractorId: tk.contractor_id,
            type: 'ticket_message',
            title: `Új üzenet: hibajegy ${tk.ticket_number || `#${ticketId.slice(0,8)}`}`,
            message: tk.sender_name ? `${tk.sender_name}: ${preview}` : preview,
            link: `/tickets/${ticketId}`,
            data: { ticket_id: ticketId, message_id: created.id },
          }).catch(e => logger.warn('[ticketMessages.notify] one failed:', e.message));
        }
      } catch (err) {
        logger.error('[ticketMessages.notify] fanout failed:', err.message);
      }
    })();

    // Re-read with sender names so the UI can render the new bubble immediately
    const r2 = await query(
      `SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name, u.email AS sender_email
         FROM ticket_messages m
         LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.id = $1`,
      [created.id]
    );
    res.status(201).json({ success: true, data: { message: r2.rows[0] } });
  } catch (err) {
    logger.error('[ticketMessages.send]', err);
    res.status(500).json({ success: false, message: 'Üzenet küldési hiba' });
  }
};

// ── PATCH /:messageId/read ────────────────────────────────────────────
const markRead = async (req, res) => {
  try {
    const { ticketId, messageId } = req.params;
    const userId = req.user.id;

    // Append { user_id, read_at } if not already present. We do this in
    // SQL with a CASE so we don't need a SELECT-then-UPDATE round trip.
    const r = await query(
      `UPDATE ticket_messages
          SET read_by = CASE
            WHEN read_by @> $3::jsonb THEN read_by
            ELSE read_by || $4::jsonb
          END
        WHERE id = $1 AND ticket_id = $2 AND deleted_at IS NULL
        RETURNING id, read_by`,
      [
        messageId, ticketId,
        JSON.stringify([{ user_id: userId }]),
        JSON.stringify([{ user_id: userId, read_at: new Date().toISOString() }]),
      ]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Üzenet nem található' });
    res.json({ success: true, data: { read_by: r.rows[0].read_by } });
  } catch (err) {
    logger.error('[ticketMessages.markRead]', err);
    res.status(500).json({ success: false, message: 'Olvasott jelölési hiba' });
  }
};

// ── DELETE /:messageId — sender (or admin) only, soft delete ─────────
const remove = async (req, res) => {
  try {
    const { ticketId, messageId } = req.params;
    const userId = req.user.id;
    const isAdmin = (req.user.roles || []).some(r => r === 'admin' || r === 'superadmin');

    const r = await query(
      `UPDATE ticket_messages
          SET deleted_at = NOW()
        WHERE id = $1 AND ticket_id = $2
          AND (sender_id = $3 OR $4::boolean = TRUE)
          AND deleted_at IS NULL
        RETURNING id`,
      [messageId, ticketId, userId, isAdmin]
    );
    if (r.rowCount === 0) {
      return res.status(403).json({ success: false, message: 'Csak a feladó vagy admin törölheti' });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('[ticketMessages.remove]', err);
    res.status(500).json({ success: false, message: 'Törlési hiba' });
  }
};

module.exports = { list, send, markRead, remove };
