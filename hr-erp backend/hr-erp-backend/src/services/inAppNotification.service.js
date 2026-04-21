/**
 * Tiny in-app notification helper.
 *
 * Writes to the pre-existing `notifications` table (created in migration
 * 018). The table is already used by gamification + email sends — this is
 * a thin wrapper so inspection/fine/compensation flows don't need to
 * know the SQL.
 *
 * Caller passes { userId, type, title, message, link?, data? }. userId
 * may be null — the notification is silently dropped in that case
 * (e.g. an on-site fine to a non-employee).
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

async function notify({ userId, type, title, message, link = null, data = null, contractorId = null } = {}) {
  if (!userId) return null;
  try {
    const r = await query(
      `INSERT INTO notifications (user_id, contractor_id, type, title, message, link, data, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id`,
      [userId, contractorId, type || 'system', title, message, link, data ? JSON.stringify(data) : null]
    );
    return r.rows[0]?.id || null;
  } catch (err) {
    // Don't let notification failures break the calling workflow.
    logger.error('[inAppNotification.notify]', err.message);
    return null;
  }
}

/**
 * Notify N users with the same payload. Skips rows with no user_id.
 * Returns the count of notifications written.
 */
async function notifyMany(userIds, payload) {
  let sent = 0;
  for (const id of userIds) {
    if (!id) continue;
    const res = await notify({ ...payload, userId: id });
    if (res) sent++;
  }
  return sent;
}

module.exports = { notify, notifyMany };
