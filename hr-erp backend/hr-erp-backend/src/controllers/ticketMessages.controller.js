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
const emailService = require('../services/email.service');
const { buildSubject } = require('../utils/ticketEmailToken');

// Dual env-flag for outbound chat→email. EMAIL_ASSISTANT_REPLY remains the
// master "outbound enabled?" switch; this finer flag scopes ticket-chat
// fan-out specifically so an op can disable outbound chat without killing
// the assistant's clarification replies. Default OFF — opt-in.
// Read per-call so a .env change doesn't require a backend restart.
function _ticketChatEmailOutEnabled() {
  return process.env.TICKET_CHAT_EMAIL_OUTBOUND === 'true';
}

// Build the HTML body sent to remote recipients of a ticket-chat message.
// Plain string concatenation is deliberate — the message + ticket data
// are the only dynamic bits, both escaped via _esc.
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _buildEmailHtml({ senderName, message, ticket, ticketUrl }) {
  const safeMsg = _esc(message).replace(/\n/g, '<br>');
  const accommodation = ticket.accommodation_name || '—';
  const room = ticket.room_number || '—';
  const category = ticket.category_name || '—';
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;">
    <p><strong>${_esc(senderName || 'Admin')}</strong> üzent a hibajegyhez:</p>
    <blockquote style="margin:10px 0 16px 0;padding:10px 14px;border-left:3px solid #2563eb;background:#f8fafc;color:#111;">
      ${safeMsg}
    </blockquote>
    <table style="font-size:13px;color:#374151;border-collapse:collapse;margin:14px 0;">
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Hibajegy:</td><td>${_esc(ticket.title)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Helyszín:</td><td>${_esc(accommodation)}, ${_esc(room)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Kategória:</td><td>${_esc(category)}</td></tr>
    </table>
    ${ticketUrl ? `<p><a href="${_esc(ticketUrl)}" style="display:inline-block;padding:8px 14px;background:#2563eb;color:white;text-decoration:none;border-radius:4px;">Megnyitás a rendszerben</a></p>` : ''}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;">
    <p style="color:#9ca3af;font-size:12px;">
      Válaszolj erre az emailre, és a válaszod automatikusan megjelenik a hibajegy chatben.
      A levél tárgyában ne módosítsd a <code>[#TICKET-…]</code> azonosítót, mert csak akkor kerül a megfelelő hibajegyhez.
    </p>
  </div>`;
}

/**
 * Resolve the recipients (user_id + email) for outbound fanout. Drops
 * the sender, drops anyone without an active email. Same population as
 * the in-app notification fanout — see _findRecipients — but with
 * email addresses joined.
 */
async function _findEmailRecipients(ticketId, senderId) {
  const r = await query(
    `SELECT DISTINCT u.id, u.email,
            u.first_name || ' ' || u.last_name AS name
       FROM tickets t
       LEFT JOIN employees e ON e.id = t.linked_employee_id
       LEFT JOIN users le_user ON le_user.id = e.user_id
       LEFT JOIN users assignee ON assignee.id = t.assigned_to
       JOIN users u ON u.id IN (assignee.id, le_user.id)
      WHERE t.id = $1
        AND u.id <> $2
        AND u.is_active = TRUE
        AND u.email IS NOT NULL
        AND u.email <> ''`,
    [ticketId, senderId]
  );
  return r.rows;
}

// Build a public ticket URL using FRONTEND_URL (set in .env). Falls back
// to a relative path if the env isn't configured — the email body is
// still readable, but the link won't open from outside the network.
function _ticketUrl(ticketId) {
  const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  return base ? `${base}/tickets/${ticketId}` : null;
}

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

    // Best-effort fan-out (in-app notification + optional outbound email).
    // Does not block the response.
    (async () => {
      try {
        const recipients = await _findRecipients(ticketId, req.user.id);
        if (recipients.length === 0) return;

        // Pull richer ticket context once for both fanout paths.
        const t = await query(
          `SELECT t.ticket_number, t.contractor_id, t.title AS ticket_title,
                  e.room_number AS room_number,
                  c.name AS category_name,
                  acc.name AS accommodation_name,
                  s.first_name || ' ' || s.last_name AS sender_name
             FROM tickets t
             LEFT JOIN ticket_categories c ON c.id = t.category_id
             LEFT JOIN employees e ON e.id = t.linked_employee_id
             LEFT JOIN accommodations acc ON acc.id = e.accommodation_id
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

        // Email fanout — gated by the env flag so a fresh install or a
        // panicked op can switch it off without code changes.
        if (_ticketChatEmailOutEnabled() && tk.ticket_number) {
          const emailRecipients = await _findEmailRecipients(ticketId, req.user.id);
          if (emailRecipients.length > 0) {
            const subject = buildSubject(tk.ticket_title, tk.ticket_number);
            const html = _buildEmailHtml({
              senderName: tk.sender_name,
              message,
              ticket: {
                title: tk.ticket_title,
                category_name: tk.category_name,
                accommodation_name: tk.accommodation_name,
                room_number: tk.room_number,
              },
              ticketUrl: _ticketUrl(ticketId),
            });
            for (const r of emailRecipients) {
              const out = await emailService.sendMail({
                to: r.email,
                subject,
                html,
                text: `${tk.sender_name || 'Admin'} üzent: ${message}\n\nVálaszolj erre az emailre — a válasz a [#TICKET-…] azonosító alapján visszakerül a chat ablakba.`,
              }).catch(e => ({ error: e.message }));
              if (out?.error) {
                logger.warn(`[ticketMessages.email→${r.email}] failed:`, out.error);
              } else {
                logger.info(`[ticketMessages.email→${r.email}] sent for ${tk.ticket_number}`);
              }
            }
          }
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
