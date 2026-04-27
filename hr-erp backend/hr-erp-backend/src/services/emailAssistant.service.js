/**
 * Email Assistant — bridges Gmail polling to the AI assistant pipeline.
 *
 * Called by gmailUniversalPoller for any email the invoice filter would
 * otherwise drop (no financial signal, no invoice attachment), as long
 * as the email isn't on the negative-keyword blacklist (newsletters,
 * security alerts, password resets — those stay rejected).
 *
 * Pipeline:
 *   1. Dedup by Gmail message_id against email_assistant_interactions.
 *   2. Identify sender → users.email lookup (case-insensitive).
 *      Unknown senders are logged + (optionally) get a polite rejection.
 *   3. Compose `subject\n\nbody` and call aiAssistant.analyzeMessage().
 *   4. Confidence gating:
 *        ≥ 0.85: high — eligible for auto-action
 *        0.60 – 0.85: medium — log + ask for clarification reply
 *        < 0.60: low — log only, no reply (avoid noise)
 *   5. Action execution gated by EMAIL_ASSISTANT_ENABLE_ACTIONS=true.
 *      When off, every interaction is logged with action_type='logged_only'.
 *      When on, dispatch to aiAssistantHandlers (handleTicket / handleFaq
 *      / handleDataQuery / handleEmergency).
 *   6. Reply: send the assistant's user_response back via email.service.sendMail
 *      (also gated — set EMAIL_ASSISTANT_REPLY=true to enable outbound).
 *   7. Insert one row in email_assistant_interactions for every call,
 *      including the dedup-skip case (no row written, just early return).
 *
 * Failure-tolerant: never throws to the caller. Gmail polling shouldn't
 * be derailed by a single problematic email.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const aiAssistant = require('./aiAssistant.service');
const aiHandlers = require('./aiAssistantHandlers.service');
const emailService = require('./email.service');

// ── Feature flags ─────────────────────────────────────────────────────
// Default OFF: master switch must be on for ANY processing to happen.
const ENABLED         = process.env.EMAIL_ASSISTANT_ENABLED === 'true';
// Action execution. When false, the service still calls Claude and logs
// the analysis, but doesn't create tickets/etc. Use this to verify
// classification accuracy before letting the bot act.
const ACTIONS_ENABLED = process.env.EMAIL_ASSISTANT_ENABLE_ACTIONS === 'true';
// Outbound replies. Auto-replies can be problematic (loops, unwanted
// noise to legitimate human senders), so disabled by default.
const REPLY_ENABLED   = process.env.EMAIL_ASSISTANT_REPLY === 'true';

// Confidence band thresholds (mirrors part 6 of the spec).
const HIGH_CONFIDENCE_MIN  = 0.85;
const MEDIUM_CONFIDENCE_MIN = 0.6;

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Extract the bare email address from a "From:" header.
 * Examples:
 *   "Lerch Balazs <lerch@example.com>" → "lerch@example.com"
 *   "lerch@example.com"                → "lerch@example.com"
 *   ""                                  → null
 */
function extractEmailAddress(fromHeader) {
  if (!fromHeader) return null;
  const m = String(fromHeader).match(/<([^>]+)>/);
  const candidate = (m ? m[1] : fromHeader).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate) ? candidate : null;
}

async function findUserByEmail(emailAddr) {
  if (!emailAddr) return null;
  const r = await query(
    `SELECT id, email, contractor_id, first_name, last_name, preferred_language
     FROM users
     WHERE LOWER(email) = $1 AND is_active = TRUE
     LIMIT 1`,
    [emailAddr]
  );
  return r.rows[0] || null;
}

async function alreadyProcessed(messageId) {
  const r = await query(
    `SELECT id FROM email_assistant_interactions WHERE email_message_id = $1`,
    [messageId]
  );
  return r.rowCount > 0;
}

async function logInteraction(row) {
  // Best-effort insert. Never throws — caller path mustn't fail because
  // of an audit-row write hiccup.
  try {
    await query(
      `INSERT INTO email_assistant_interactions
         (email_message_id, email_from, email_subject, email_body, email_received_at,
          user_id, ai_message_id, intent, confidence,
          action_type, action_success, created_ticket_id, created_task_id,
          response_sent, response_sent_at, response_message_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (email_message_id) DO NOTHING`,
      [
        row.email_message_id, row.email_from, row.email_subject, row.email_body,
        row.email_received_at || null, row.user_id || null,
        row.ai_message_id || null, row.intent || null,
        row.confidence != null ? Number(row.confidence) : null,
        row.action_type || null, row.action_success ?? null,
        row.created_ticket_id || null, row.created_task_id || null,
        row.response_sent || false, row.response_sent_at || null,
        row.response_message_id || null, row.notes || null,
      ]
    );
  } catch (err) {
    logger.error('[emailAssistant.logInteraction] insert failed:', err.message);
  }
}

// Map analysis.intent → handler. handleDamageReport intentionally not
// wired here: the create-from-chat shortcut is admin-mediated and
// shouldn't fire from inbound email.
async function dispatchAction(intent, ctx) {
  switch (intent) {
    case 'ticket':       return aiHandlers.handleTicket(ctx);
    case 'faq':          return aiHandlers.handleFaq({ ...ctx, claudeUserResponse: ctx.user_response });
    case 'data_query':   return aiHandlers.handleDataQuery(ctx);
    case 'emergency':    return aiHandlers.handleEmergency(ctx);
    default:             return null;
  }
}

async function sendReply(originalEmail, body, subject) {
  if (!REPLY_ENABLED) return { skipped: true, reason: 'EMAIL_ASSISTANT_REPLY=false' };
  return emailService.sendMail({
    to: originalEmail.from,
    subject: subject || `Re: ${originalEmail.subject || 'üzenet'}`.slice(0, 200),
    text: body,
    inReplyTo: originalEmail.messageId,
    references: originalEmail.messageId,
  });
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Process a single inbound email. Returns a small status object the
 * caller (gmailUniversalPoller) can log; never throws.
 *
 * Input shape (built by the poller from Gmail's full message):
 *   { messageId, from, subject, bodyText, receivedAt? }
 */
async function processEmail(input) {
  if (!ENABLED) return { handled: false, reason: 'EMAIL_ASSISTANT_ENABLED=false' };

  const { messageId, from, subject, bodyText, receivedAt } = input || {};
  if (!messageId || !from) {
    logger.warn('[emailAssistant] processEmail: missing messageId or from, skipping');
    return { handled: false, reason: 'invalid_input' };
  }

  try {
    // 1. Dedup
    if (await alreadyProcessed(messageId)) {
      return { handled: false, reason: 'already_processed' };
    }

    const senderAddr = extractEmailAddress(from);
    const baseRow = {
      email_message_id: messageId,
      email_from:       from,
      email_subject:    subject || null,
      email_body:       bodyText ? String(bodyText).slice(0, 16000) : null,
      email_received_at: receivedAt || null,
    };

    // 2. Identify sender
    const user = senderAddr ? await findUserByEmail(senderAddr) : null;
    if (!user) {
      // Polite rejection (only if reply enabled — otherwise just log)
      let response = null;
      if (REPLY_ENABLED) {
        response = await sendReply(
          { from, subject, messageId },
          'Köszönjük a megkeresést! Ez egy automatizált email-asszisztens, amely csak regisztrált felhasználóktól fogad üzenetet. Kérjük, vegye fel a kapcsolatot velünk a megszokott csatornán.',
          undefined
        );
      }
      await logInteraction({
        ...baseRow,
        action_type: 'unknown_sender',
        action_success: !!response?.data,
        response_sent: !!response?.data,
        response_sent_at: response?.data ? new Date() : null,
        notes: senderAddr ? `Unknown sender ${senderAddr}` : 'Unparseable From header',
      });
      return { handled: true, reason: 'unknown_sender', user_id: null };
    }

    // 3. Compose message + analyze
    const message = `${subject || ''}\n\n${bodyText || ''}`.trim();
    if (message.length < 5) {
      await logInteraction({
        ...baseRow,
        user_id: user.id,
        action_type: 'empty_message',
        notes: 'Empty subject + body',
      });
      return { handled: true, reason: 'empty', user_id: user.id };
    }

    const analysis = await aiAssistant.analyzeMessage(user.id, message);
    const conf = analysis?.confidence ?? 0;

    // 4. Confidence gating
    let band = 'low';
    if (conf >= HIGH_CONFIDENCE_MIN) band = 'high';
    else if (conf >= MEDIUM_CONFIDENCE_MIN) band = 'medium';

    // 5. Action execution (if globally enabled AND high-band)
    let actionResult = null;
    let action_type = 'logged_only';
    if (ACTIONS_ENABLED && band === 'high' && analysis.intent && analysis.intent !== 'unknown') {
      try {
        const profile = await aiAssistant._loadUserProfile(user.id);
        const ctx = {
          user: { id: user.id, contractorId: user.contractor_id },
          profile,
          entities: analysis.entities || {},
          message,
          user_response: analysis.user_response,
        };
        actionResult = await dispatchAction(analysis.intent, ctx);
        action_type = actionResult?.action_type || analysis.intent;
      } catch (err) {
        logger.error('[emailAssistant] dispatchAction failed:', err.message);
        action_type = 'action_error';
      }
    }

    // 6. Reply — only on medium/high confidence and when enabled
    let replyResp = null;
    const replyBody = actionResult?.user_response_override || analysis?.user_response;
    if (REPLY_ENABLED && replyBody && (band === 'high' || band === 'medium')) {
      replyResp = await sendReply({ from, subject, messageId }, replyBody);
    }

    // 7. Log
    await logInteraction({
      ...baseRow,
      user_id: user.id,
      intent: analysis?.intent || null,
      confidence: conf,
      action_type,
      action_success: actionResult ? !!actionResult.success : null,
      created_ticket_id: actionResult?.created_ticket_id || null,
      created_task_id:   actionResult?.created_task_id   || null,
      response_sent:    !!replyResp?.data,
      response_sent_at: replyResp?.data ? new Date() : null,
      response_message_id: replyResp?.data?.messageId || null,
      notes: `band=${band}; actions_enabled=${ACTIONS_ENABLED}; reply_enabled=${REPLY_ENABLED}`,
    });

    return {
      handled: true,
      user_id: user.id,
      intent: analysis?.intent,
      confidence: conf,
      band,
      action_type,
      ticket_id: actionResult?.created_ticket_id || null,
    };
  } catch (err) {
    logger.error('[emailAssistant.processEmail] fatal:', err.message);
    // Try to log the failure so we don't lose the trail
    await logInteraction({
      email_message_id: messageId,
      email_from: from,
      email_subject: subject || null,
      email_body: bodyText ? String(bodyText).slice(0, 16000) : null,
      action_type: 'error',
      notes: `fatal: ${err.message}`,
    });
    return { handled: false, reason: 'error', error: err.message };
  }
}

module.exports = {
  processEmail,
  // exposed for tests + admin tooling
  extractEmailAddress,
  findUserByEmail,
  ENABLED,
  ACTIONS_ENABLED,
  REPLY_ENABLED,
};
