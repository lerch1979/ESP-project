/**
 * AI Assistant — HTTP wrapper around aiAssistant + aiAssistantHandlers services.
 *
 * Endpoints:
 *   POST  /api/v1/ai-assistant/chat
 *   GET   /api/v1/ai-assistant/history
 *   POST  /api/v1/ai-assistant/feedback/:messageId
 *   GET   /api/v1/admin/ai-assistant/logs   (mounted on admin router)
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const ai = require('../services/aiAssistant.service');
const handlers = require('../services/aiAssistantHandlers.service');

// ─── POST /chat ─────────────────────────────────────────────────────────────

const chat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { message, attachments } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Üzenet megadása kötelező' });
    }

    // Rate limit
    const rate = ai._rateAllowed(userId);
    if (!rate.ok) {
      return res.status(429).json({
        success: false,
        message: rate.reason === 'hourly_limit'
          ? 'Túl sok üzenet egy órán belül. Kérlek várj kicsit.'
          : 'Napi üzenetkorlát elérve. Próbáld újra holnap.',
      });
    }

    const profile = await ai._loadUserProfile(userId);
    const analysis = await ai.analyzeMessage(userId, message);

    // Decide whether to auto-execute
    let actionResult = null;
    let userResponseOverride = null;
    const willExecute =
      analysis.confidence >= ai.CONFIDENCE_THRESHOLD &&
      ['ticket', 'damage_report', 'faq', 'data_query', 'emergency'].includes(analysis.intent);

    if (willExecute) {
      try {
        const ctx = {
          user: req.user,
          profile,
          entities: analysis.entities,
          message,
          claudeUserResponse: analysis.user_response,
        };
        switch (analysis.intent) {
          case 'ticket':         actionResult = await handlers.handleTicket(ctx); break;
          case 'damage_report':  actionResult = await handlers.handleDamageReport(ctx); break;
          case 'faq':            actionResult = await handlers.handleFaq(ctx); break;
          case 'data_query':     actionResult = await handlers.handleDataQuery(ctx); break;
          case 'emergency':      actionResult = await handlers.handleEmergency(ctx); break;
        }
        if (actionResult?.user_response_override) {
          userResponseOverride = actionResult.user_response_override;
        }
      } catch (err) {
        logger.error('[aiAssistant.chat] handler error:', err);
        actionResult = { success: false, action_type: analysis.intent, error: err.message };
      }
    }

    const finalUserResponse =
      userResponseOverride ||
      analysis.user_response ||
      (willExecute ? '' : 'Nem vagyok biztos benne, mit szeretnél. Megerősítenéd kérlek?');

    // Persist
    const insert = await query(
      `INSERT INTO ai_assistant_messages
         (user_id, user_message, user_language, attachments,
          intent, confidence, entities,
          ai_response, ai_response_language,
          action_type, action_params, action_success, action_result,
          created_ticket_id, created_damage_report_id, created_task_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id`,
      [
        userId,
        message,
        analysis.language_detected || profile?.preferred_language || 'hu',
        attachments ? JSON.stringify(attachments) : null,
        analysis.intent,
        analysis.confidence,
        JSON.stringify(analysis.entities || {}),
        finalUserResponse,
        analysis.language_detected || profile?.preferred_language || 'hu',
        actionResult?.action_type || (willExecute ? null : 'skipped_low_confidence'),
        actionResult?.action_params ? JSON.stringify(actionResult.action_params) : null,
        actionResult ? !!actionResult.success : null,
        actionResult?.action_result ? JSON.stringify(actionResult.action_result) : null,
        actionResult?.created_ticket_id || null,
        actionResult?.created_damage_report_id || null,
        actionResult?.created_task_id || null,
      ]
    );

    res.json({
      success: true,
      data: {
        message_id: insert.rows[0].id,
        intent: analysis.intent,
        confidence: analysis.confidence,
        entities: analysis.entities,
        executed: willExecute && actionResult?.success,
        needs_confirmation: !willExecute && analysis.intent !== 'unknown',
        action: actionResult ? {
          type: actionResult.action_type,
          result: actionResult.action_result,
          ticket_id: actionResult.created_ticket_id || null,
        } : null,
        user_response: finalUserResponse,
        language: analysis.language_detected,
        emergency: analysis.emergency_keyword || analysis.intent === 'emergency',
      },
    });
  } catch (err) {
    logger.error('[aiAssistant.chat] error:', err);
    res.status(500).json({ success: false, message: 'AI asszisztens hiba' });
  }
};

// ─── GET /history ───────────────────────────────────────────────────────────

const history = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const result = await query(
      `SELECT id, user_message, intent, confidence, entities,
              ai_response, action_type, action_success,
              created_ticket_id, created_damage_report_id, created_task_id,
              user_feedback, created_at
         FROM ai_assistant_messages
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [req.user.id, limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[aiAssistant.history] error:', err);
    res.status(500).json({ success: false, message: 'Előzmény lekérési hiba' });
  }
};

// ─── POST /feedback/:messageId ──────────────────────────────────────────────

const feedback = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { feedback, comment } = req.body || {};
    if (!['helpful', 'not_helpful'].includes(feedback)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen visszajelzés' });
    }
    const result = await query(
      `UPDATE ai_assistant_messages
          SET user_feedback = $1, feedback_comment = $2
        WHERE id = $3 AND user_id = $4
        RETURNING id`,
      [feedback, comment || null, messageId, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Üzenet nem található' });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('[aiAssistant.feedback] error:', err);
    res.status(500).json({ success: false, message: 'Visszajelzés mentés hiba' });
  }
};

// ─── GET /admin/ai-assistant/logs (superadmin) ──────────────────────────────

const adminLogs = async (req, res) => {
  try {
    if (!req.user.roles.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Csak superadmin számára elérhető' });
    }
    const {
      intent, success, feedback: fb, search,
      from, to,
      page = 1, limit = 100,
    } = req.query;
    const where = [];
    const params = [];
    let i = 1;
    if (intent && intent !== 'all') { where.push(`intent = $${i++}`); params.push(intent); }
    if (success === 'true')         { where.push(`action_success = TRUE`); }
    if (success === 'false')        { where.push(`action_success = FALSE`); }
    if (fb && fb !== 'all')         { where.push(`user_feedback = $${i++}`); params.push(fb); }
    if (search) {
      where.push(`(user_message ILIKE $${i} OR ai_response ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (from) { where.push(`created_at >= $${i++}`); params.push(from); }
    if (to)   { where.push(`created_at <= $${i++}`); params.push(to); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const stats = await query(`
      SELECT
        COUNT(*)::int                                                         AS total,
        COUNT(*) FILTER (WHERE action_success = TRUE)::int                    AS success_count,
        COUNT(*) FILTER (WHERE user_feedback = 'helpful')::int                AS helpful_count,
        COUNT(*) FILTER (WHERE user_feedback = 'not_helpful')::int            AS not_helpful_count,
        AVG(confidence)::numeric(3,2)                                         AS avg_confidence,
        json_object_agg(intent, c) FILTER (WHERE intent IS NOT NULL)          AS by_intent
      FROM (
        SELECT intent, COUNT(*)::int AS c, action_success, user_feedback, confidence
        FROM ai_assistant_messages
        ${whereSql}
        GROUP BY GROUPING SETS ((intent), (intent, action_success, user_feedback, confidence))
      ) t
    `, params).catch(() => ({ rows: [{ total: 0 }] }));
    // The complex stats query above is best-effort; if it ever fails we still
    // return rows below. Fallback for the by_intent map:
    const byIntent = await query(`
      SELECT intent, COUNT(*)::int AS c
        FROM ai_assistant_messages
        ${whereSql}
        GROUP BY intent
        ORDER BY c DESC
    `, params);

    const rows = await query(
      `SELECT m.*,
              u.first_name || ' ' || u.last_name AS user_name,
              u.email AS user_email
         FROM ai_assistant_messages m
         LEFT JOIN users u ON u.id = m.user_id
         ${whereSql}
         ORDER BY m.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      success: true,
      data: {
        messages: rows.rows,
        stats: {
          total: stats.rows[0]?.total || 0,
          success_count: stats.rows[0]?.success_count || 0,
          helpful_count: stats.rows[0]?.helpful_count || 0,
          not_helpful_count: stats.rows[0]?.not_helpful_count || 0,
          avg_confidence: stats.rows[0]?.avg_confidence || null,
          by_intent: Object.fromEntries(byIntent.rows.map(r => [r.intent, r.c])),
        },
        pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10) },
      },
    });
  } catch (err) {
    logger.error('[aiAssistant.adminLogs] error:', err);
    res.status(500).json({ success: false, message: 'AI log lekérési hiba' });
  }
};

module.exports = { chat, history, feedback, adminLogs };
