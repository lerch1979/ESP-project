const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const integrationService = require('../services/wellbeingIntegration.service');
const carepathService = require('../services/carepath.service');

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/v1/wellbeing/referrals */
const createReferral = async (req, res) => {
  try {
    const { source_module, source_record_id, target_module, referral_type, urgency_level, referral_reason } = req.body;

    if (!source_module || !target_module || !referral_type || !referral_reason) {
      return res.status(400).json({ success: false, message: 'source_module, target_module, referral_type, referral_reason kötelező' });
    }

    const referral = await integrationService.createReferral({
      user_id: req.user.id,
      contractor_id: req.user.contractorId,
      source_module,
      source_record_id: source_record_id || null,
      target_module,
      referral_type,
      urgency_level: urgency_level || 'medium',
      referral_reason,
      referred_by: req.user.id,
    });

    // Notify the user
    try {
      await integrationService.createNotification({
        user_id: req.user.id,
        contractor_id: req.user.contractorId,
        notification_type: 'referral_created',
        notification_channel: 'in_app',
        title: 'Új ajánlás létrehozva',
        message: referral_reason,
        action_url: `/wellbeing/referrals/${referral.id}`,
        priority: urgency_level === 'crisis' ? 'urgent' : 'normal',
        source_module: 'wellbeing',
      });
    } catch (e) {
      logger.warn('Referral notification failed:', e.message);
    }

    res.status(201).json({ success: true, data: referral });
  } catch (error) {
    if (error.message.includes('required')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error creating referral:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellbeing/my-referrals */
const getMyReferrals = async (req, res) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.source_module) filters.source_module = req.query.source_module;

    const referrals = await integrationService.getReferrals(req.user.id, filters);

    const pending = referrals.filter(r => r.status === 'pending').length;
    const expired = referrals.filter(r => r.status === 'expired').length;

    res.json({
      success: true,
      data: { referrals, pending_count: pending, expired_count: expired }
    });
  } catch (error) {
    logger.error('Error fetching referrals:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/wellbeing/referrals/:id/accept */
const acceptReferral = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch referral to determine action
    const refResult = await query(
      'SELECT * FROM wellbeing_referrals WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (refResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Referral nem található' });
    }

    const referral = refResult.rows[0];

    if (referral.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Referral már feldolgozva' });
    }

    // Accept the referral
    const accepted = await integrationService.acceptReferral(id, req.user.id);

    let actionTaken = {};
    let nextSteps = '';

    // Execute action based on target_module
    switch (referral.target_module) {
      case 'carepath': {
        // Get default counseling category
        const catResult = await query(
          "SELECT id FROM carepath_service_categories WHERE is_active = true ORDER BY display_order LIMIT 1"
        );
        const categoryId = catResult.rows[0]?.id;

        if (categoryId) {
          try {
            const newCase = await carepathService.createCase(
              req.user.id, req.user.contractorId,
              {
                service_category_id: categoryId,
                urgency_level: referral.urgency_level,
                issue_description: `Referral: ${referral.referral_reason}`,
              }
            );

            // Link case to referral
            await query(
              'UPDATE wellbeing_referrals SET target_case_id = $1 WHERE id = $2',
              [newCase.id, id]
            );

            actionTaken = { type: 'carepath_case_created', case_id: newCase.id, case_number: newCase.case_number };
            nextSteps = 'A CarePath eseted létrejött. Keress szolgáltatót és foglalj időpontot.';
          } catch (e) {
            logger.error('Failed to create CarePath case from referral:', e);
            actionTaken = { type: 'carepath_case_failed', error: e.message };
            nextSteps = 'Kérjük, hozd létre manuálisan a CarePath eseted.';
          }
        }
        break;
      }

      case 'wellmind': {
        await integrationService.createNotification({
          user_id: req.user.id,
          contractor_id: req.user.contractorId,
          notification_type: 'wellmind_assessment_suggested',
          notification_channel: 'push',
          title: 'Közérzeti felmérés',
          message: 'Kérjük, töltsd ki a közérzeti felmérést.',
          action_url: '/wellmind/assessment',
          priority: 'high',
          source_module: 'wellmind',
        });
        actionTaken = { type: 'assessment_scheduled', url: '/wellmind/assessment' };
        nextSteps = 'Kérjük, töltsd ki a közérzeti felmérést. Mindössze 5 percet vesz igénybe.';
        break;
      }

      case 'coaching': {
        await integrationService.createNotification({
          user_id: req.user.id,
          contractor_id: req.user.contractorId,
          notification_type: 'coaching_available',
          notification_channel: 'push',
          title: 'Coaching elérhető',
          message: 'A HR csapat 48 órán belül felveszi veled a kapcsolatot.',
          action_url: '/wellmind/coaching-sessions',
          priority: 'normal',
          source_module: 'wellmind',
        });
        actionTaken = { type: 'coaching_notification_sent' };
        nextSteps = 'A HR csapat 48 órán belül felveszi veled a kapcsolatot a coaching időpont egyeztetéséhez.';
        break;
      }

      default: {
        actionTaken = { type: 'referral_accepted' };
        nextSteps = 'Az ajánlás elfogadva. Hamarosan további információt kapsz.';
      }
    }

    // Log the action
    await integrationService.logDataAccess(
      req.user.id, req.user.id, req.user.contractorId,
      'referral_accepted', 'referral', id,
      `Accepted referral: ${referral.target_module}`
    );

    res.json({
      success: true,
      data: {
        referral: accepted,
        action_taken: actionTaken,
        next_steps: nextSteps,
      }
    });
  } catch (error) {
    if (error.message.includes('not pending')) {
      return res.status(400).json({ success: false, message: 'Referral nem függőben' });
    }
    logger.error('Error accepting referral:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/wellbeing/referrals/:id/decline */
const declineReferral = async (req, res) => {
  try {
    const { decline_reason } = req.body;

    if (!decline_reason) {
      return res.status(400).json({ success: false, message: 'decline_reason kötelező' });
    }

    const declined = await integrationService.declineReferral(
      req.params.id, req.user.id, decline_reason
    );

    // Offer alternative support
    const alternatives = [
      { type: 'self_service', title: 'Önkiszolgáló eszközök', url: '/wellmind/pulse', description: 'Napi közérzeti felmérés és személyre szabott javaslatok' },
      { type: 'chatbot', title: 'Chatbot', url: '/chatbot', description: 'Azonnali válaszok a leggyakoribb kérdésekre' },
      { type: 'carepath_info', title: 'CarePath tájékoztató', url: '/carepath/categories', description: 'Ismerje meg a CarePath szolgáltatásokat' },
    ];

    await integrationService.logDataAccess(
      req.user.id, req.user.id, req.user.contractorId,
      'referral_declined', 'referral', req.params.id,
      'Declined with reason'
    );

    res.json({
      success: true,
      data: { referral: declined, alternative_support: alternatives }
    });
  } catch (error) {
    if (error.message.includes('not pending')) {
      return res.status(400).json({ success: false, message: 'Referral nem függőben' });
    }
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Referral nem található' });
    }
    logger.error('Error declining referral:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/wellbeing/notifications */
const getNotifications = async (req, res) => {
  try {
    const filters = {};
    if (req.query.unread === 'true') filters.unread = true;
    if (req.query.notification_type) filters.notification_type = req.query.notification_type;
    if (req.query.limit) filters.limit = parseInt(req.query.limit);

    const notifications = await integrationService.getNotifications(req.user.id, filters);
    const unreadCount = await integrationService.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: {
        notifications,
        unread_count: unreadCount,
        total_count: notifications.length,
      }
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/wellbeing/notifications/:id/read */
const markNotificationRead = async (req, res) => {
  try {
    await integrationService.markAsRead(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('already read')) {
      return res.status(404).json({ success: false, message: 'Értesítés nem található vagy már olvasott' });
    }
    logger.error('Error marking notification read:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/wellbeing/notifications/read-all */
const markAllNotificationsRead = async (req, res) => {
  try {
    const count = await integrationService.markAllAsRead(req.user.id);
    res.json({ success: true, data: { marked_count: count } });
  } catch (error) {
    logger.error('Error marking all read:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/wellbeing/feedback */
const submitFeedback = async (req, res) => {
  try {
    const { feedback_type, related_record_id, rating, is_helpful, feedback_text, improvement_suggestions, is_anonymous } = req.body;

    if (!feedback_type) {
      return res.status(400).json({ success: false, message: 'feedback_type kötelező' });
    }
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return res.status(400).json({ success: false, message: 'Értékelés 1-5 között legyen' });
    }

    const feedback = await integrationService.submitFeedback(req.user.id, req.user.contractorId, {
      feedback_type, related_record_id, rating, is_helpful,
      feedback_text, improvement_suggestions, is_anonymous,
    });

    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('Rating')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error submitting feedback:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFLICT ANALYTICS (admin)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/wellbeing/admin/conflicts/stats */
const getConflictStats = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    const result = await query(
      `SELECT tc.slug AS category, tc.name AS category_name, COUNT(*) AS count
       FROM tickets t
       JOIN ticket_categories tc ON t.category_id = tc.id
       WHERE t.contractor_id = $1
         AND tc.slug IN ('complaint', 'conflict', 'escalation', 'harassment', 'workplace_safety')
         AND t.created_at >= COALESCE($2::date, CURRENT_DATE - 90)
         AND t.created_at <= COALESCE($3::date, CURRENT_DATE)
       GROUP BY tc.slug, tc.name
       ORDER BY count DESC`,
      [contractorId, startDate, endDate]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching conflict stats:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellbeing/admin/conflicts/trends */
const getConflictTrends = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const weeks = Math.min(parseInt(req.query.weeks) || 12, 52);

    const result = await query(
      `SELECT * FROM v_conflict_wellbeing_correlation
       WHERE contractor_id = $1
       ORDER BY week DESC
       LIMIT $2`,
      [contractorId, weeks]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching conflict trends:', error);
    res.json({ success: true, data: [] });
  }
};

/** GET /api/v1/wellbeing/admin/conflicts/critical */
const getCriticalIncidents = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    const result = await query(
      `SELECT t.id, t.ticket_number, tc.name AS category_name, tc.slug AS category_slug,
              t.title, t.created_at, ts.name AS status_name,
              u.first_name, u.last_name
       FROM tickets t
       JOIN ticket_categories tc ON t.category_id = tc.id
       LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.contractor_id = $1
         AND tc.slug IN ('harassment', 'escalation')
         AND t.created_at >= CURRENT_DATE - CAST($2 AS INTEGER)
       ORDER BY t.created_at DESC`,
      [contractorId, days]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching critical incidents:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION ROTATION CONFIG (admin)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/wellbeing/admin/question-rotation */
const getQuestionRotation = async (req, res) => {
  try {
    const configResult = await query('SELECT * FROM wellmind_question_rotation WHERE is_active = TRUE LIMIT 1');
    const config = configResult.rows[0] || null;

    const poolResult = await query(
      `SELECT id, question_text, question_text_en, response_type, category, is_active
       FROM wellmind_questions
       WHERE question_type = 'pulse' AND is_active = TRUE
       ORDER BY display_order`
    );

    res.json({ success: true, data: { config, available_questions: poolResult.rows } });
  } catch (error) {
    logger.error('Error fetching rotation config:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/wellbeing/admin/question-rotation */
const updateQuestionRotation = async (req, res) => {
  try {
    const { rotation_period, questions_per_survey, include_core_questions, additional_question_pool, is_active } = req.body;

    const configResult = await query('SELECT id FROM wellmind_question_rotation LIMIT 1');
    if (configResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nincs konfiguráció.' });
    }

    const result = await query(
      `UPDATE wellmind_question_rotation SET
        rotation_period = COALESCE($2, rotation_period),
        questions_per_survey = COALESCE($3, questions_per_survey),
        include_core_questions = COALESCE($4, include_core_questions),
        additional_question_pool = COALESCE($5, additional_question_pool),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [configResult.rows[0].id, rotation_period, questions_per_survey, include_core_questions, additional_question_pool, is_active]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating rotation config:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED ANALYTICS (admin)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/wellbeing/admin/predictive */
const getPredictiveAnalytics = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;

    // Turnover risk: high burnout + low engagement
    const riskResult = await query(
      `SELECT wa.user_id, u.first_name, u.last_name,
              wa.burnout_score, wa.engagement_score, wa.risk_level,
              wa.assessment_date,
              ROUND((CAST(wa.burnout_score AS numeric) * 0.6 + (100 - CAST(wa.engagement_score AS numeric)) * 0.4)::numeric, 1) AS flight_risk_score
       FROM wellmind_assessments wa
       JOIN users u ON wa.user_id = u.id
       WHERE wa.contractor_id = $1
         AND wa.assessment_date = (
           SELECT MAX(assessment_date) FROM wellmind_assessments
           WHERE user_id = wa.user_id
         )
       ORDER BY flight_risk_score DESC
       LIMIT 20`,
      [contractorId]
    );

    // Sick leave prediction
    const sickResult = await query(
      `SELECT wa.user_id, u.first_name, u.last_name,
              wa.burnout_score, wa.risk_level,
              CASE
                WHEN CAST(wa.burnout_score AS numeric) > 70 THEN 80
                WHEN CAST(wa.burnout_score AS numeric) > 50 THEN 50
                ELSE 20
              END AS sick_leave_probability,
              COUNT(lr.id) AS recent_sick_leaves
       FROM wellmind_assessments wa
       JOIN users u ON wa.user_id = u.id
       LEFT JOIN leave_requests lr ON wa.user_id = lr.user_id
         AND lr.leave_type = 'sick' AND lr.status = 'approved'
         AND lr.start_date >= CURRENT_DATE - 90
       WHERE wa.contractor_id = $1
         AND wa.assessment_date = (
           SELECT MAX(assessment_date) FROM wellmind_assessments WHERE user_id = wa.user_id
         )
       GROUP BY wa.user_id, u.first_name, u.last_name, wa.burnout_score, wa.risk_level
       HAVING CAST(wa.burnout_score AS numeric) > 50
       ORDER BY sick_leave_probability DESC`,
      [contractorId]
    );

    res.json({
      success: true,
      data: {
        turnover_risk: riskResult.rows,
        sick_leave_prediction: sickResult.rows,
      },
    });
  } catch (error) {
    logger.error('Error fetching predictive analytics:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

module.exports = {
  createReferral, getMyReferrals, acceptReferral, declineReferral,
  getNotifications, markNotificationRead, markAllNotificationsRead,
  submitFeedback,
  getConflictStats, getConflictTrends, getCriticalIncidents,
  getQuestionRotation, updateQuestionRotation,
  getPredictiveAnalytics,
};
