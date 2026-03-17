const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const REFERRAL_STATUSES = ['pending', 'accepted', 'declined', 'completed', 'expired'];
const NOTIFICATION_CHANNELS = ['push', 'email', 'sms', 'in_app'];
const MIN_AGGREGATION_SIZE = 5;

const MENTAL_HEALTH_KEYWORDS = [
  'depressed', 'depresszió', 'anxious', 'szorongás', 'panic', 'pánik',
  'stressed', 'stressz', 'overwhelmed', 'túlterhelt', 'burnout', 'kiégés',
  'exhausted', 'kimerült', 'hopeless', 'reménytelen',
];
const CRISIS_KEYWORDS = [
  'suicide', 'öngyilkos', 'kill myself', 'megölöm magam',
  'end it all', 'véget vetek', 'want to die', 'meg akarok halni',
];

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function createReferral(data) {
  const {
    user_id, contractor_id, source_module, source_record_id,
    target_module, referral_type, urgency_level = 'medium',
    referral_reason, referred_by, is_auto_generated = false,
    expires_at,
  } = data;

  if (!user_id || !source_module || !target_module || !referral_reason) {
    throw new Error('user_id, source_module, target_module, and referral_reason are required');
  }

  // Resolve contractor_id if not provided
  let cid = contractor_id;
  if (!cid) {
    const userResult = await query('SELECT contractor_id FROM users WHERE id = $1', [user_id]);
    if (userResult.rows.length === 0) throw new Error('User not found');
    cid = userResult.rows[0].contractor_id;
  }

  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const result = await query(
    `INSERT INTO wellbeing_referrals
       (user_id, contractor_id, source_module, source_record_id,
        target_module, referral_type, urgency_level, referral_reason,
        referred_by, is_auto_generated, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [user_id, cid, source_module, source_record_id || null,
     target_module, referral_type, urgency_level, referral_reason,
     referred_by || null, is_auto_generated,
     expires_at || defaultExpiry]
  );

  logger.info('Referral created', { id: result.rows[0].id, type: referral_type, urgency: urgency_level });
  return result.rows[0];
}

async function getReferrals(userId, filters = {}) {
  let sql = `
    SELECT r.*, sc.category_name AS target_category
    FROM wellbeing_referrals r
    LEFT JOIN carepath_service_categories sc ON sc.id::text = r.source_record_id::text
    WHERE r.user_id = $1
  `;
  const params = [userId];
  let idx = 2;

  if (filters.status) {
    sql += ` AND r.status = $${idx}`;
    params.push(filters.status);
    idx++;
  }
  if (filters.source_module) {
    sql += ` AND r.source_module = $${idx}`;
    params.push(filters.source_module);
    idx++;
  }

  sql += ` ORDER BY r.created_at DESC`;
  const result = await query(sql, params);
  return result.rows;
}

async function getPendingReferrals(userId) {
  const result = await query(
    `SELECT * FROM wellbeing_referrals
     WHERE user_id = $1 AND status = 'pending' AND expires_at > NOW()
     ORDER BY
       CASE urgency_level WHEN 'crisis' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
       created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function acceptReferral(referralId, userId) {
  const result = await query(
    `UPDATE wellbeing_referrals
     SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [referralId, userId]
  );
  if (result.rows.length === 0) throw new Error('Referral not found or not pending');
  return result.rows[0];
}

async function declineReferral(referralId, userId, reason) {
  const result = await query(
    `UPDATE wellbeing_referrals
     SET status = 'declined', declined_at = NOW(), decline_reason = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [referralId, userId, reason || null]
  );
  if (result.rows.length === 0) throw new Error('Referral not found or not pending');
  return result.rows[0];
}

async function completeReferral(referralId, notes) {
  const result = await query(
    `UPDATE wellbeing_referrals
     SET status = 'completed', completed_at = NOW(), completion_notes = $2, updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'accepted')
     RETURNING *`,
    [referralId, notes || null]
  );
  if (result.rows.length === 0) throw new Error('Referral not found or already processed');
  return result.rows[0];
}

async function expireOldReferrals() {
  const result = await query(
    `UPDATE wellbeing_referrals
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING id`
  );
  const count = result.rows.length;
  if (count > 0) logger.info(`Expired ${count} referrals`);
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REFERRAL TRIGGERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check WellMind assessment results for CarePath referral triggers.
 * Returns the created referral or null.
 */
async function checkWellMindRiskTriggers(userId, contractorId, assessment) {
  const burnout = parseFloat(assessment.burnout_score) || 0;
  const riskLevel = assessment.risk_level;

  // Check existing recent referral to avoid duplicates
  const existing = await query(
    `SELECT id FROM wellbeing_referrals
     WHERE user_id = $1 AND source_module = 'wellmind'
       AND referral_type IN ('critical_burnout_to_carepath', 'high_burnout_to_carepath')
       AND status IN ('pending', 'accepted')
       AND created_at >= CURRENT_DATE - 30`,
    [userId]
  );
  if (existing.rows.length > 0) return null;

  // Critical: burnout > 80 AND red
  if (burnout > 80 && riskLevel === 'red') {
    const referral = await createReferral({
      user_id: userId, contractor_id: contractorId,
      source_module: 'wellmind', source_record_id: assessment.id,
      target_module: 'carepath', referral_type: 'critical_burnout_to_carepath',
      urgency_level: 'crisis',
      referral_reason: `Kritikus kiégés észlelve (pontszám: ${burnout}/100). Azonnali szakmai támogatás ajánlott.`,
      is_auto_generated: true,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await createNotification({
      user_id: userId, contractor_id: contractorId,
      notification_type: 'carepath_referral_urgent', notification_channel: 'push',
      title: 'Azonnali támogatás elérhető', priority: 'urgent',
      message: 'A wellbeing felméréséd magas stresszt mutat. A CarePath 24/7 elérhető számodra.',
      action_url: `/carepath/referrals/${referral.id}`,
      source_module: 'wellmind', source_entity_type: 'assessment', source_entity_id: assessment.id,
    });

    return referral;
  }

  // High: burnout > 70 AND red
  if (burnout > 70 && riskLevel === 'red') {
    const referral = await createReferral({
      user_id: userId, contractor_id: contractorId,
      source_module: 'wellmind', source_record_id: assessment.id,
      target_module: 'carepath', referral_type: 'high_burnout_to_carepath',
      urgency_level: 'high',
      referral_reason: `Magas kiégés észlelve (pontszám: ${burnout}/100). Szakmai támogatás ajánlott.`,
      is_auto_generated: true,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    await createNotification({
      user_id: userId, contractor_id: contractorId,
      notification_type: 'carepath_referral_recommended', notification_channel: 'push',
      title: 'Támogatás ajánlott', priority: 'high',
      message: 'A jóléted fontos számunkra. A CarePath tanácsadás elérhető számodra.',
      action_url: `/carepath/referrals/${referral.id}`,
      source_module: 'wellmind',
    });

    return referral;
  }

  return null;
}

/**
 * Check for 3 consecutive low pulse scores. Returns referral or null.
 */
async function checkConsecutiveLowPulse(userId, contractorId) {
  const recent = await query(
    'SELECT mood_score FROM wellmind_pulse_surveys WHERE user_id = $1 ORDER BY survey_date DESC LIMIT 3',
    [userId]
  );

  if (recent.rows.length < 3) return null;
  if (!recent.rows.every(p => p.mood_score <= 2)) return null;

  // Duplicate check
  const existing = await query(
    `SELECT id FROM wellbeing_referrals
     WHERE user_id = $1 AND referral_type = 'consecutive_low_pulse'
       AND status IN ('pending', 'accepted') AND created_at >= CURRENT_DATE - 7`,
    [userId]
  );
  if (existing.rows.length > 0) return null;

  const referral = await createReferral({
    user_id: userId, contractor_id: contractorId,
    source_module: 'wellmind', target_module: 'carepath',
    referral_type: 'consecutive_low_pulse', urgency_level: 'high',
    referral_reason: '3 egymást követő napon alacsony hangulat (≤2/5). Támogatás elérhető.',
    is_auto_generated: true,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  await createNotification({
    user_id: userId, contractor_id: contractorId,
    notification_type: 'carepath_support_available', notification_channel: 'push',
    title: 'Velünk vagy', priority: 'high',
    message: 'Úgy tűnik, nehéz napjaid vannak. A CarePath támogatás 24/7 elérhető.',
    action_url: `/carepath/referrals/${referral.id}`,
    source_module: 'wellmind',
  });

  logger.warn('Consecutive low pulse detected', { userId });
  return referral;
}

/**
 * Detect mental health / crisis keywords in chatbot messages.
 * Returns { type: 'crisis'|'mental_health', referral } or null.
 */
async function checkChatbotMentalHealthKeywords(userId, contractorId, message) {
  if (!message || typeof message !== 'string') return null;
  const lower = message.toLowerCase();

  // Crisis detection (highest priority)
  if (CRISIS_KEYWORDS.some(kw => lower.includes(kw))) {
    const referral = await createReferral({
      user_id: userId, contractor_id: contractorId,
      source_module: 'chatbot', target_module: 'carepath',
      referral_type: 'chatbot_crisis_detected', urgency_level: 'crisis',
      referral_reason: 'Krízis jelzés észlelve a chatbot beszélgetésben. Azonnali beavatkozás szükséges.',
      is_auto_generated: true,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await createNotification({
      user_id: userId, contractor_id: contractorId,
      notification_type: 'crisis_hotline', notification_channel: 'push',
      title: 'Krízis támogatás MOST elérhető', priority: 'urgent',
      message: 'CarePath Krízis Vonal: +36-1-116-123 (24/7). Nem vagy egyedül. Segítség elérhető.',
      action_url: '/carepath/crisis',
      source_module: 'chatbot',
    });

    await logDataAccess(null, null, contractorId, 'crisis_keyword_detected', 'chatbot_message', null,
      'Krízis kulcsszó észlelve chatbot beszélgetésben — automatikus CarePath referral');

    logger.warn('CRISIS keyword detected in chatbot', { userId });
    return { type: 'crisis', referral };
  }

  // Mental health keywords
  if (MENTAL_HEALTH_KEYWORDS.some(kw => lower.includes(kw))) {
    const existing = await query(
      `SELECT id FROM wellbeing_referrals
       WHERE user_id = $1 AND referral_type = 'chatbot_mental_health_keyword'
         AND status IN ('pending', 'accepted') AND created_at >= CURRENT_DATE - 7`,
      [userId]
    );
    if (existing.rows.length > 0) return null;

    const referral = await createReferral({
      user_id: userId, contractor_id: contractorId,
      source_module: 'chatbot', target_module: 'carepath',
      referral_type: 'chatbot_mental_health_keyword', urgency_level: 'medium',
      referral_reason: 'Mentális egészségre utaló kulcsszavak a chatbot beszélgetésben.',
      is_auto_generated: true,
    });

    await createNotification({
      user_id: userId, contractor_id: contractorId,
      notification_type: 'wellbeing_support_options', notification_channel: 'in_app',
      title: 'Támogatás elérhető', priority: 'normal',
      message: 'Szeretnél beszélgetni valakivel, vagy kitölteni egy gyors közérzeti felmérést?',
      action_url: '/wellbeing/support-options',
      source_module: 'chatbot',
    });

    return { type: 'mental_health', referral };
  }

  return null;
}

/**
 * Manager raises wellbeing concern about an employee.
 */
async function handleManagerConcern(managerId, employeeId, contractorId, concernData) {
  const { concern_type = 'general', description } = concernData;

  const referral = await createReferral({
    user_id: employeeId, contractor_id: contractorId,
    source_module: 'manager_alert', target_module: 'wellmind',
    referral_type: 'manager_concern_to_assessment',
    urgency_level: concern_type === 'urgent' ? 'high' : 'medium',
    referral_reason: 'A vezetőd aggódik a jólétedért. Egy bizalmas közérzeti felmérés ajánlott.',
    referred_by: managerId,
  });

  await createNotification({
    user_id: employeeId, contractor_id: contractorId,
    notification_type: 'wellmind_assessment_suggested', notification_channel: 'push',
    title: 'Közérzeti felmérés elérhető', priority: 'normal',
    message: 'Szánj 5 percet egy gyors közérzeti felmérésre. A válaszaid bizalmasak.',
    action_url: '/wellmind/assessment',
    source_module: 'wellmind',
  });

  await logDataAccess(managerId, employeeId, contractorId,
    'manager_concern_raised', 'referral', referral.id,
    `Vezetői aggodalom: ${concern_type}`);

  return referral;
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function createNotification(data) {
  const {
    user_id, contractor_id, notification_type, notification_channel,
    title, message, action_url, priority = 'normal',
    scheduled_for, source_module, source_entity_type, source_entity_id,
    metadata,
  } = data;

  if (!user_id || !notification_type || !notification_channel || !title || !message) {
    throw new Error('user_id, notification_type, notification_channel, title, and message are required');
  }
  if (!NOTIFICATION_CHANNELS.includes(notification_channel)) {
    throw new Error('Invalid notification_channel');
  }

  let cid = contractor_id;
  if (!cid) {
    const u = await query('SELECT contractor_id FROM users WHERE id = $1', [user_id]);
    cid = u.rows[0]?.contractor_id;
  }

  const result = await query(
    `INSERT INTO wellbeing_notifications
       (user_id, contractor_id, notification_type, notification_channel,
        title, message, action_url, priority, scheduled_for,
        source_module, source_entity_type, source_entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [user_id, cid, notification_type, notification_channel,
     title, message, action_url || null, priority,
     scheduled_for || new Date(),
     source_module || null, source_entity_type || null, source_entity_id || null,
     metadata ? JSON.stringify(metadata) : null]
  );

  return result.rows[0];
}

async function getNotifications(userId, filters = {}) {
  let sql = `SELECT * FROM wellbeing_notifications WHERE user_id = $1`;
  const params = [userId];
  let idx = 2;

  if (filters.unread) {
    sql += ` AND read_at IS NULL AND status IN ('sent', 'delivered')`;
  }
  if (filters.notification_type) {
    sql += ` AND notification_type = $${idx}`;
    params.push(filters.notification_type);
    idx++;
  }

  sql += ` ORDER BY created_at DESC`;

  if (filters.limit) {
    sql += ` LIMIT $${idx}`;
    params.push(filters.limit);
    idx++;
  }

  const result = await query(sql, params);
  return result.rows;
}

async function getUnreadCount(userId) {
  const result = await query(
    `SELECT COUNT(*) AS count FROM wellbeing_notifications
     WHERE user_id = $1 AND read_at IS NULL AND status IN ('sent', 'delivered')`,
    [userId]
  );
  return parseInt(result.rows[0].count);
}

async function markAsRead(notificationId, userId) {
  const result = await query(
    `UPDATE wellbeing_notifications
     SET read_at = NOW(), status = 'read'
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL
     RETURNING id`,
    [notificationId, userId]
  );
  if (result.rows.length === 0) throw new Error('Notification not found or already read');
  return result.rows[0];
}

async function markAllAsRead(userId) {
  const result = await query(
    `UPDATE wellbeing_notifications
     SET read_at = NOW(), status = 'read'
     WHERE user_id = $1 AND read_at IS NULL AND status IN ('sent', 'delivered')
     RETURNING id`
  , [userId]);
  return result.rows.length;
}

/**
 * Process pending notification queue. Returns count of processed notifications.
 */
async function sendPendingNotifications() {
  const pending = await query(
    `SELECT * FROM wellbeing_notifications
     WHERE status = 'pending' AND scheduled_for <= NOW() AND retry_count < max_retries
     ORDER BY
       CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END,
       scheduled_for ASC
     LIMIT 100`
  );

  let processed = 0;
  for (const notif of pending.rows) {
    try {
      const newStatus = notif.notification_channel === 'in_app' ? 'delivered' : 'sent';
      await query(
        `UPDATE wellbeing_notifications SET status = $1, sent_at = NOW() WHERE id = $2`,
        [newStatus, notif.id]
      );
      processed++;
    } catch (error) {
      await query(
        `UPDATE wellbeing_notifications
         SET retry_count = retry_count + 1,
             status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'pending' END,
             failed_reason = $2
         WHERE id = $1`,
        [notif.id, error.message]
      );
    }
  }

  if (processed > 0) logger.info(`Processed ${processed} notifications`);
  return processed;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════

async function logDataAccess(userId, accessedUserId, contractorId, action, resourceType, resourceId, reason) {
  const result = await query(
    `INSERT INTO wellbeing_audit_log
       (user_id, accessed_user_id, contractor_id, action, resource_type,
        resource_id, access_reason, access_granted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     RETURNING id`,
    [userId || null, accessedUserId || null, contractorId, action,
     resourceType, resourceId || null, reason || null]
  );
  return result.rows[0];
}

async function logAccessDenied(userId, accessedUserId, contractorId, action, resourceType, resourceId, denialReason) {
  await query(
    `INSERT INTO wellbeing_audit_log
       (user_id, accessed_user_id, contractor_id, action, resource_type,
        resource_id, access_granted, denial_reason)
     VALUES ($1, $2, $3, $4, $5, $6, false, $7)`,
    [userId, accessedUserId || null, contractorId, action,
     resourceType, resourceId || null, denialReason]
  );
}

async function getAuditLog(contractorId, filters = {}) {
  let sql = `SELECT * FROM wellbeing_audit_log WHERE contractor_id = $1`;
  const params = [contractorId];
  let idx = 2;

  if (filters.action) {
    sql += ` AND action = $${idx}`;
    params.push(filters.action);
    idx++;
  }
  if (filters.accessed_user_id) {
    sql += ` AND accessed_user_id = $${idx}`;
    params.push(filters.accessed_user_id);
    idx++;
  }
  if (filters.start_date) {
    sql += ` AND created_at >= $${idx}`;
    params.push(filters.start_date);
    idx++;
  }
  if (filters.end_date) {
    sql += ` AND created_at <= $${idx}`;
    params.push(filters.end_date);
    idx++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  params.push(filters.limit || 100);

  const result = await query(sql, params);
  return result.rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════

async function submitFeedback(userId, contractorId, feedbackData) {
  const {
    feedback_type, related_record_id, rating, is_helpful,
    feedback_text, improvement_suggestions, is_anonymous = false,
    submitted_via = 'mobile',
  } = feedbackData;

  if (!feedback_type) throw new Error('feedback_type is required');
  if (rating !== undefined && (rating < 1 || rating > 5)) throw new Error('Rating must be 1-5');

  const result = await query(
    `INSERT INTO wellbeing_feedback
       (user_id, contractor_id, feedback_type, related_record_id, rating,
        is_helpful, feedback_text, improvement_suggestions, is_anonymous, submitted_via)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, feedback_type, rating, created_at`,
    [userId, contractorId, feedback_type, related_record_id || null,
     rating || null, is_helpful ?? null, feedback_text || null,
     improvement_suggestions || null, is_anonymous, submitted_via]
  );
  return result.rows[0];
}

async function getFeedbackStats(contractorId, feedbackType) {
  const result = await query(
    `SELECT
       COUNT(*) AS total,
       ROUND(AVG(rating)::numeric, 2) AS avg_rating,
       COUNT(*) FILTER (WHERE is_helpful = true) AS helpful_count,
       COUNT(*) FILTER (WHERE is_helpful = false) AS not_helpful_count
     FROM wellbeing_feedback
     WHERE contractor_id = $1 AND feedback_type = $2`,
    [contractorId, feedbackType]
  );
  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-MODULE AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combined WellMind + CarePath profile for a user.
 */
async function getUserWellbeingProfile(userId) {
  const [wellmindData, carepathData, referralData] = await Promise.all([
    query(
      `SELECT
         (SELECT AVG(mood_score) FROM wellmind_pulse_surveys WHERE user_id = $1 AND survey_date >= CURRENT_DATE - 30) AS avg_mood_30d,
         (SELECT AVG(stress_level) FROM wellmind_pulse_surveys WHERE user_id = $1 AND survey_date >= CURRENT_DATE - 30) AS avg_stress_30d,
         (SELECT COUNT(*) FROM wellmind_pulse_surveys WHERE user_id = $1 AND survey_date >= CURRENT_DATE - 30) AS pulse_count_30d,
         (SELECT burnout_score FROM wellmind_assessments WHERE user_id = $1 ORDER BY assessment_date DESC LIMIT 1) AS latest_burnout,
         (SELECT engagement_score FROM wellmind_assessments WHERE user_id = $1 ORDER BY assessment_date DESC LIMIT 1) AS latest_engagement,
         (SELECT risk_level FROM wellmind_assessments WHERE user_id = $1 ORDER BY assessment_date DESC LIMIT 1) AS risk_level,
         (SELECT COUNT(*) FROM wellmind_interventions WHERE user_id = $1 AND status IN ('recommended','accepted','in_progress')) AS active_interventions`,
      [userId]
    ),
    query(
      `SELECT
         (SELECT COUNT(*) FROM carepath_cases WHERE user_id = $1 AND status IN ('open','assigned','in_progress')) AS active_cases,
         (SELECT COUNT(*) FROM carepath_sessions s JOIN carepath_cases c ON s.case_id = c.id WHERE c.user_id = $1 AND s.session_date >= CURRENT_DATE - 90) AS sessions_90d`,
      [userId]
    ),
    query(
      'SELECT COUNT(*) AS pending FROM wellbeing_referrals WHERE user_id = $1 AND status = $2',
      [userId, 'pending']
    ),
  ]);

  const wm = wellmindData.rows[0];
  const cp = carepathData.rows[0];

  const mood = parseFloat(wm.avg_mood_30d) || 3;
  const stress = parseFloat(wm.avg_stress_30d) || 5;
  const burnout = parseFloat(wm.latest_burnout) || 50;
  const engagement = parseFloat(wm.latest_engagement) || 50;

  const healthScore = Math.round(
    (mood / 5 * 100) * 0.3 +
    ((10 - stress) / 10 * 100) * 0.3 +
    (100 - burnout) * 0.2 +
    engagement * 0.2
  );

  return {
    wellmind: wm,
    carepath: cp,
    pending_referrals: parseInt(referralData.rows[0].pending),
    overall_health_score: Math.max(0, Math.min(100, healthScore)),
    health_status: healthScore >= 70 ? 'healthy' : healthScore >= 50 ? 'needs_attention' : 'at_risk',
  };
}

/**
 * Company-wide wellbeing index. Privacy: requires >= 5 employees.
 */
async function getCompanyWellbeingIndex(contractorId) {
  const countResult = await query(
    `SELECT COUNT(DISTINCT user_id) AS count
     FROM wellmind_pulse_surveys
     WHERE contractor_id = $1 AND survey_date >= CURRENT_DATE - 30`,
    [contractorId]
  );

  if (parseInt(countResult.rows[0].count) < MIN_AGGREGATION_SIZE) {
    throw new Error('Insufficient data for company index (minimum 5 employees required)');
  }

  const result = await query(
    `SELECT
       ROUND(AVG(mood_score) * 20, 2) AS mood_index,
       ROUND((10 - AVG(stress_level)) * 10, 2) AS stress_index,
       COUNT(DISTINCT user_id) AS active_users
     FROM wellmind_pulse_surveys
     WHERE contractor_id = $1 AND survey_date >= CURRENT_DATE - 30`,
    [contractorId]
  );

  const assessResult = await query(
    `SELECT
       ROUND(100 - AVG(burnout_score), 2) AS burnout_index,
       ROUND(AVG(engagement_score), 2) AS engagement_index
     FROM wellmind_assessments
     WHERE contractor_id = $1 AND assessment_date >= CURRENT_DATE - 90`,
    [contractorId]
  );

  const m = result.rows[0];
  const a = assessResult.rows[0];

  const mood = parseFloat(m.mood_index) || 60;
  const stress = parseFloat(m.stress_index) || 50;
  const burnout = parseFloat(a.burnout_index) || 60;
  const engagement = parseFloat(a.engagement_index) || 60;

  const index = Math.round(mood * 0.3 + stress * 0.3 + burnout * 0.2 + engagement * 0.2);

  return {
    wellbeing_index: Math.max(0, Math.min(100, index)),
    status: index >= 70 ? 'healthy' : index >= 50 ? 'monitor' : 'intervention_needed',
    components: { mood_index: mood, stress_index: stress, burnout_index: burnout, engagement_index: engagement },
    active_employees: parseInt(m.active_users),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Referrals
  createReferral, getReferrals, getPendingReferrals,
  acceptReferral, declineReferral, completeReferral, expireOldReferrals,
  // Auto-triggers
  checkWellMindRiskTriggers, checkConsecutiveLowPulse,
  checkChatbotMentalHealthKeywords, handleManagerConcern,
  // Notifications
  createNotification, getNotifications, getUnreadCount,
  markAsRead, markAllAsRead, sendPendingNotifications,
  // Audit
  logDataAccess, logAccessDenied, getAuditLog,
  // Feedback
  submitFeedback, getFeedbackStats,
  // Aggregation
  getUserWellbeingProfile, getCompanyWellbeingIndex,
  // Constants
  MENTAL_HEALTH_KEYWORDS, CRISIS_KEYWORDS, REFERRAL_STATUSES, MIN_AGGREGATION_SIZE,
};
