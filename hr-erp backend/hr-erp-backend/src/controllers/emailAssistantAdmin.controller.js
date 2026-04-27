/**
 * Admin-side observability for the email assistant bridge
 * (services/emailAssistant.service.js + email_assistant_interactions).
 *
 * Three read-only endpoints:
 *   GET /admin/email-assistant/logs   — paginated list with filters
 *   GET /admin/email-assistant/stats  — rollup for the header cards
 *   GET /admin/email-assistant/status — current feature flag state + last poll
 *
 * No toggle / reprocess / mark-wrong endpoints yet — see UI README; those
 * need a DB-backed config table to be safe across restarts.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// Helper: only superadmins should see the audit trail (it contains
// sender email addresses + raw message bodies).
function _requireSuperadmin(req, res) {
  const roles = req.user?.roles || [];
  if (!roles.includes('superadmin') && !roles.includes('admin')) {
    res.status(403).json({ success: false, message: 'Csak admin/superadmin számára elérhető' });
    return false;
  }
  return true;
}

// Build the WHERE clause shared by /logs and /stats so they're filtered
// identically. Returns { whereSql, params, nextIndex }.
function _buildFilters(q) {
  const where = [];
  const params = [];
  let i = 1;

  if (q.intent && q.intent !== 'all') {
    where.push(`intent = $${i++}`);
    params.push(q.intent);
  }
  if (q.action && q.action !== 'all') {
    where.push(`action_type = $${i++}`);
    params.push(q.action);
  }
  if (q.confidence_min) {
    where.push(`confidence >= $${i++}`);
    params.push(parseFloat(q.confidence_min));
  }
  if (q.search) {
    where.push(`(email_from ILIKE $${i} OR email_subject ILIKE $${i} OR email_body ILIKE $${i})`);
    params.push(`%${q.search}%`); i++;
  }
  if (q.from) { where.push(`created_at >= $${i++}`); params.push(q.from); }
  if (q.to)   { where.push(`created_at <= $${i++}`); params.push(q.to); }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    nextIndex: i,
  };
}

// ─────────────────────────────────────────────────────────────────────
// GET /admin/email-assistant/logs
// ─────────────────────────────────────────────────────────────────────
const logs = async (req, res) => {
  if (!_requireSuperadmin(req, res)) return;
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const { whereSql, params, nextIndex } = _buildFilters(req.query);

    const total = await query(
      `SELECT COUNT(*)::int AS n FROM email_assistant_interactions ${whereSql}`,
      params
    );

    const rows = await query(
      `SELECT eai.*,
              u.first_name || ' ' || u.last_name AS user_name,
              u.email AS user_email
         FROM email_assistant_interactions eai
         LEFT JOIN users u ON u.id = eai.user_id
         ${whereSql}
         ORDER BY eai.created_at DESC
         LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: {
        interactions: rows.rows,
        pagination: { page, limit, total: total.rows[0].n },
      },
    });
  } catch (err) {
    logger.error('[emailAssistantAdmin.logs] error:', err);
    res.status(500).json({ success: false, message: 'Lekérési hiba' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// GET /admin/email-assistant/stats?days=7
// ─────────────────────────────────────────────────────────────────────
const stats = async (req, res) => {
  if (!_requireSuperadmin(req, res)) return;
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '7', 10)));

    // Roll-up driven by confidence band + special action_type values.
    // Mirrors the bands the service uses to gate behavior so the UI
    // and service stay in lockstep.
    const r = await query(
      `SELECT
         COUNT(*)::int                                                         AS total,
         COUNT(*) FILTER (WHERE confidence >= 0.85)::int                       AS high_conf,
         COUNT(*) FILTER (WHERE confidence >= 0.6 AND confidence < 0.85)::int  AS medium_conf,
         COUNT(*) FILTER (WHERE confidence < 0.6 AND confidence IS NOT NULL)::int AS low_conf,
         COUNT(*) FILTER (WHERE action_type = 'unknown_sender')::int           AS unknown_sender,
         COUNT(*) FILTER (WHERE action_type = 'error')::int                    AS errors,
         COUNT(*) FILTER (WHERE action_type = 'logged_only')::int              AS logged_only,
         COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int       AS unique_users,
         COUNT(*) FILTER (WHERE response_sent)::int                            AS replies_sent
       FROM email_assistant_interactions
       WHERE created_at >= NOW() - ($1::int || ' days')::interval`,
      [days]
    );

    const byIntent = await query(
      `SELECT intent, COUNT(*)::int AS c
         FROM email_assistant_interactions
        WHERE created_at >= NOW() - ($1::int || ' days')::interval
          AND intent IS NOT NULL
        GROUP BY intent
        ORDER BY c DESC`,
      [days]
    );

    res.json({
      success: true,
      data: {
        days,
        ...r.rows[0],
        by_intent: Object.fromEntries(byIntent.rows.map(x => [x.intent, x.c])),
      },
    });
  } catch (err) {
    logger.error('[emailAssistantAdmin.stats] error:', err);
    res.status(500).json({ success: false, message: 'Statisztika lekérési hiba' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// GET /admin/email-assistant/status
// Current feature-flag state + last activity. UI uses this to render
// the status pills + the "phase controls disabled" tooltip.
// ─────────────────────────────────────────────────────────────────────
const status = async (req, res) => {
  if (!_requireSuperadmin(req, res)) return;
  try {
    const flags = {
      enabled:         process.env.EMAIL_ASSISTANT_ENABLED         === 'true',
      actions_enabled: process.env.EMAIL_ASSISTANT_ENABLE_ACTIONS  === 'true',
      reply_enabled:   process.env.EMAIL_ASSISTANT_REPLY           === 'true',
      gmail_polling:   !!process.env.GMAIL_REFRESH_TOKEN,
    };

    // Phase derives from the flag combo and matches the rollout plan
    // documented in the original feature spec.
    let phase = 'disabled';
    if (flags.enabled && !flags.actions_enabled && !flags.reply_enabled) phase = 'observation';
    else if (flags.enabled && flags.actions_enabled && !flags.reply_enabled) phase = 'actions';
    else if (flags.enabled && flags.actions_enabled && flags.reply_enabled) phase = 'full';
    else if (flags.enabled) phase = 'custom';

    const lastInteraction = await query(
      `SELECT created_at FROM email_assistant_interactions ORDER BY created_at DESC LIMIT 1`
    );

    res.json({
      success: true,
      data: {
        flags,
        phase,
        polling_interval_minutes: 5, // matches server.js cron schedule
        last_interaction_at: lastInteraction.rows[0]?.created_at || null,
        // UI tooltip copy: be honest that flips need a restart today.
        toggles_writable: false,
        toggles_note: 'Edit .env and restart the backend to change phase. Live toggle requires a DB-backed config (planned).',
      },
    });
  } catch (err) {
    logger.error('[emailAssistantAdmin.status] error:', err);
    res.status(500).json({ success: false, message: 'Státusz lekérési hiba' });
  }
};

module.exports = { logs, stats, status };
