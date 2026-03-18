const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const slackBotService = require('../services/slack/slackBot.service');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG ENDPOINTS (admin only)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/slack/config */
const getConfig = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM slack_checkin_config WHERE contractor_id = $1`,
      [req.user.contractorId]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    logger.error('Error fetching Slack config:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/slack/config */
const updateConfig = async (req, res) => {
  try {
    const { enabled, check_in_time, timezone, message_template } = req.body;

    // Validate time format
    if (check_in_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(check_in_time)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen időformátum (HH:MM)' });
    }

    const result = await query(
      `INSERT INTO slack_checkin_config
         (contractor_id, enabled, check_in_time, timezone, message_template)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (contractor_id)
       DO UPDATE SET
         enabled = COALESCE($2, slack_checkin_config.enabled),
         check_in_time = COALESCE($3, slack_checkin_config.check_in_time),
         timezone = COALESCE($4, slack_checkin_config.timezone),
         message_template = COALESCE($5, slack_checkin_config.message_template),
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.contractorId,
        enabled ?? false,
        check_in_time || '09:00:00',
        timezone || 'Europe/Budapest',
        message_template || 'Szia! 👋 Hogy érzed magad ma?',
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating Slack config:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// USER SYNC
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/v1/slack/sync-users */
const syncUsers = async (req, res) => {
  try {
    const result = await slackBotService.syncUsers(req.user.contractorId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error syncing Slack users:', error);
    const message = error.message.includes('not initialized')
      ? 'Slack bot nincs konfigurálva (SLACK_BOT_TOKEN hiányzik)'
      : 'Hiba történt a szinkronizálás során';
    res.status(500).json({ success: false, message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST MESSAGE
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/v1/slack/test-message */
const sendTestMessage = async (req, res) => {
  try {
    // Find the admin's Slack user
    const slackUser = await query(
      `SELECT slack_user_id FROM slack_users WHERE user_id = $1`,
      [req.user.id]
    );

    if (slackUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Slack fiókod nincs szinkronizálva. Futtasd először a felhasználó-szinkronizálást.',
      });
    }

    const config = await query(
      `SELECT message_template FROM slack_checkin_config WHERE contractor_id = $1`,
      [req.user.contractorId]
    );

    const result = await slackBotService.sendTestMessage(
      slackUser.rows[0].slack_user_id,
      config.rows[0]?.message_template
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error sending test message:', error);
    const message = error.message.includes('not initialized')
      ? 'Slack bot nincs konfigurálva'
      : 'Hiba történt a teszt üzenet küldésekor';
    res.status(500).json({ success: false, message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/slack/stats */
const getStats = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         (SELECT COUNT(*) FROM slack_users
          WHERE contractor_id = $1 AND enabled = true) AS users_synced,
         (SELECT COUNT(*) FROM slack_checkin_messages
          WHERE contractor_id = $1 AND DATE(sent_at) = CURRENT_DATE) AS sent_today,
         (SELECT COUNT(*) FROM slack_checkin_messages
          WHERE contractor_id = $1 AND DATE(sent_at) = CURRENT_DATE AND responded_at IS NOT NULL) AS responses_today,
         (SELECT COUNT(*) FROM slack_checkin_messages
          WHERE contractor_id = $1 AND sent_at >= NOW() - INTERVAL '7 days') AS sent_week,
         (SELECT COUNT(*) FROM slack_checkin_messages
          WHERE contractor_id = $1 AND sent_at >= NOW() - INTERVAL '7 days' AND responded_at IS NOT NULL) AS responses_week`,
      [req.user.contractorId]
    );

    const s = result.rows[0];
    const sentToday = parseInt(s.sent_today);
    const responsesToday = parseInt(s.responses_today);
    const sentWeek = parseInt(s.sent_week);
    const responsesWeek = parseInt(s.responses_week);

    res.json({
      success: true,
      data: {
        usersSynced: parseInt(s.users_synced),
        sentToday,
        responsesToday,
        responseRateToday: sentToday > 0 ? parseFloat((responsesToday / sentToday * 100).toFixed(1)) : 0,
        sentWeek,
        responsesWeek,
        responseRateWeek: sentWeek > 0 ? parseFloat((responsesWeek / sentWeek * 100).toFixed(1)) : 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching Slack stats:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/slack/users */
const getSlackUsers = async (req, res) => {
  try {
    const result = await query(
      `SELECT su.id, su.slack_user_id, su.slack_email, su.slack_real_name,
              su.enabled, su.created_at, su.updated_at, u.name AS user_name
       FROM slack_users su
       JOIN users u ON u.id = su.user_id
       WHERE su.contractor_id = $1
       ORDER BY su.slack_real_name`,
      [req.user.contractorId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching Slack users:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/slack/users/:id/toggle */
const toggleSlackUser = async (req, res) => {
  try {
    const result = await query(
      `UPDATE slack_users SET enabled = NOT enabled, updated_at = NOW()
       WHERE id = $1 AND contractor_id = $2
       RETURNING *`,
      [req.params.id, req.user.contractorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Slack felhasználó nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error toggling Slack user:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

module.exports = {
  getConfig,
  updateConfig,
  syncUsers,
  sendTestMessage,
  getStats,
  getSlackUsers,
  toggleSlackUser,
};
