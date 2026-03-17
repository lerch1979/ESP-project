const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const wellmindService = require('../services/wellmind.service');
const integrationService = require('../services/wellbeingIntegration.service');

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/v1/wellmind/pulse */
const submitPulse = async (req, res) => {
  try {
    const { mood_score, stress_level, sleep_quality, workload_level, notes } = req.body;

    const pulse = await wellmindService.submitPulse(
      req.user.id, req.user.contractorId,
      { mood_score, stress_level, sleep_quality, workload_level, notes }
    );

    res.status(201).json({ success: true, data: pulse });
  } catch (error) {
    if (error.message.includes('mood_score')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error submitting pulse:', error);
    res.status(500).json({ success: false, message: 'Hiba történt a pulse rögzítésekor' });
  }
};

/** GET /api/v1/wellmind/pulse/history */
const getPulseHistory = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const pulses = await wellmindService.getPulseHistory(req.user.id, days);
    const trend = await wellmindService.calculatePulseTrend(req.user.id);
    const anomaly = await wellmindService.detectPulseAnomaly(req.user.id);

    res.json({
      success: true,
      data: { pulses, trend, anomaly }
    });
  } catch (error) {
    logger.error('Error fetching pulse history:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellmind/pulse/today */
const getTodayPulse = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM wellmind_pulse_surveys
       WHERE user_id = $1 AND survey_date = CURRENT_DATE`,
      [req.user.id]
    );

    const questions = await query(
      `SELECT id, question_text, question_text_en, response_type, category, display_order
       FROM wellmind_questions
       WHERE question_type = 'pulse' AND is_active = true
       ORDER BY display_order`
    );

    res.json({
      success: true,
      data: {
        submitted: result.rows.length > 0,
        pulse: result.rows[0] || null,
        questions: questions.rows,
      }
    });
  } catch (error) {
    logger.error('Error fetching today pulse:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/wellmind/assessment */
const submitAssessment = async (req, res) => {
  try {
    const { responses } = req.body;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ success: false, message: 'Válaszok megadása kötelező' });
    }

    const assessment = await wellmindService.submitAssessment(
      req.user.id, req.user.contractorId, responses
    );

    // Check for auto-referral triggers
    let referralCreated = false;
    if (assessment.risk_level === 'red') {
      const referral = await integrationService.checkWellMindRiskTriggers(
        req.user.id, req.user.contractorId, assessment
      );
      referralCreated = !!referral;
    }

    // Get generated interventions
    const interventions = await wellmindService.getRecommendedInterventions(req.user.id);

    res.status(201).json({
      success: true,
      data: {
        assessment,
        interventions,
        referral_created: referralCreated,
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ebben a negyedévben már kitöltötted az értékelést' });
    }
    logger.error('Error submitting assessment:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellmind/assessment/history */
const getAssessmentHistory = async (req, res) => {
  try {
    const history = await wellmindService.getAssessmentHistory(req.user.id);
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('Error fetching assessment history:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellmind/my-dashboard */
const getMyDashboard = async (req, res) => {
  try {
    const profile = await integrationService.getUserWellbeingProfile(req.user.id);
    const latestAssessment = await wellmindService.getLatestAssessment(req.user.id);
    const interventions = await wellmindService.getRecommendedInterventions(req.user.id);
    const coaching = await wellmindService.getCoachingSessions(req.user.id, 'scheduled');
    const referrals = await integrationService.getPendingReferrals(req.user.id);
    const unread = await integrationService.getUnreadCount(req.user.id);

    // Today's pulse
    const todayPulse = await query(
      'SELECT * FROM wellmind_pulse_surveys WHERE user_id = $1 AND survey_date = CURRENT_DATE',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        health_score: profile.overall_health_score,
        health_status: profile.health_status,
        pulse_today: todayPulse.rows[0] || null,
        pulse_summary: profile.wellmind,
        assessment_latest: latestAssessment,
        interventions,
        coaching_upcoming: coaching,
        referrals_pending: referrals,
        unread_notifications: unread,
      }
    });
  } catch (error) {
    logger.error('Error building dashboard:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellmind/interventions */
const getInterventions = async (req, res) => {
  try {
    const { status } = req.query;

    let interventions;
    if (status) {
      const result = await query(
        `SELECT * FROM wellmind_interventions
         WHERE user_id = $1 AND status = $2
         ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
                  recommended_at DESC`,
        [req.user.id, status]
      );
      interventions = result.rows;
    } else {
      interventions = await wellmindService.getRecommendedInterventions(req.user.id);
    }

    res.json({ success: true, data: interventions });
  } catch (error) {
    logger.error('Error fetching interventions:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/wellmind/interventions/:id/accept */
const acceptIntervention = async (req, res) => {
  try {
    const intervention = await wellmindService.acceptIntervention(req.params.id, req.user.id);
    res.json({ success: true, data: intervention });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Intervenció nem található' });
    }
    logger.error('Error accepting intervention:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/wellmind/interventions/:id/complete */
const completeIntervention = async (req, res) => {
  try {
    const { completion_notes, effectiveness_rating } = req.body;
    const intervention = await wellmindService.completeIntervention(
      req.params.id, req.user.id, completion_notes, effectiveness_rating
    );
    res.json({ success: true, data: intervention });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Intervenció nem található' });
    }
    logger.error('Error completing intervention:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/wellmind/interventions/:id/skip */
const skipIntervention = async (req, res) => {
  try {
    const { decline_reason } = req.body;
    const intervention = await wellmindService.declineIntervention(
      req.params.id, req.user.id, decline_reason
    );
    res.json({ success: true, data: intervention });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Intervenció nem található' });
    }
    logger.error('Error skipping intervention:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellmind/coaching-sessions */
const getCoachingSessions = async (req, res) => {
  try {
    const status = req.query.status || null;
    const sessions = await wellmindService.getCoachingSessions(req.user.id, status);

    // Strip coach_notes for non-coach users
    const sanitized = sessions.map(s => {
      const { coach_notes, ...rest } = s;
      return rest;
    });

    res.json({ success: true, data: sanitized });
  } catch (error) {
    logger.error('Error fetching coaching sessions:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/wellmind/coaching-sessions/:id/feedback */
const rateCoachingSession = async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Értékelés 1-5 között legyen' });
    }
    const session = await wellmindService.rateCoachingSession(req.params.id, req.user.id, rating, feedback);
    res.json({ success: true, data: session });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('not completed')) {
      return res.status(404).json({ success: false, message: 'Foglalás nem található vagy nem befejezett' });
    }
    logger.error('Error rating coaching session:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MANAGER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/wellmind/team/:teamId/metrics */
const getTeamMetrics = async (req, res) => {
  try {
    const { teamId } = req.params;
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = req.query.endDate || new Date().toISOString().split('T')[0];

    const metrics = await wellmindService.getTeamMetrics(
      req.user.contractorId, startDate, endDate
    );

    await integrationService.logDataAccess(
      req.user.id, null, req.user.contractorId,
      'view_team_metrics', 'team_metrics', teamId, 'Manager team view'
    );

    res.json({ success: true, data: metrics });
  } catch (error) {
    if (error.message.includes('privacy') || error.message.includes('5 employees')) {
      return res.status(403).json({ success: false, message: 'Kevesebb mint 5 alkalmazott — adatvédelmi okokból nem elérhető' });
    }
    logger.error('Error fetching team metrics:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/wellmind/admin/dashboard */
const getAdminDashboard = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;

    const dashboard = await wellmindService.getCompanyDashboard(contractorId);

    let wellbeingIndex = null;
    try {
      const indexData = await integrationService.getCompanyWellbeingIndex(contractorId);
      wellbeingIndex = indexData;
    } catch (e) {
      // Not enough data for index — continue
    }

    await integrationService.logDataAccess(
      req.user.id, null, req.user.contractorId,
      'view_admin_dashboard', 'company_dashboard', null, 'Admin dashboard access'
    );

    res.json({
      success: true,
      data: {
        ...dashboard,
        wellbeing_index: wellbeingIndex,
      }
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellmind/admin/risk-employees */
const getRiskEmployees = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const riskLevel = req.query.risk_level || 'red';

    const employees = await wellmindService.getRiskEmployees(contractorId, riskLevel);

    await integrationService.logDataAccess(
      req.user.id, null, req.user.contractorId,
      'view_risk_employees', 'ml_prediction', null,
      `Risk level filter: ${riskLevel}`
    );

    res.json({ success: true, data: employees });
  } catch (error) {
    logger.error('Error fetching risk employees:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellmind/admin/trends */
const getTrends = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const startDate = req.query.startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = req.query.endDate || new Date().toISOString().split('T')[0];

    // Weekly pulse trends
    const pulseTrends = await query(
      `SELECT DATE_TRUNC('week', survey_date)::date AS week,
              ROUND(AVG(mood_score)::numeric, 2) AS avg_mood,
              ROUND(AVG(stress_level)::numeric, 2) AS avg_stress,
              COUNT(DISTINCT user_id) AS participants
       FROM wellmind_pulse_surveys
       WHERE contractor_id = $1 AND survey_date BETWEEN $2 AND $3
       GROUP BY week ORDER BY week`,
      [contractorId, startDate, endDate]
    );

    // Assessment risk distribution over time
    const riskTrends = await query(
      `SELECT quarter, risk_level, COUNT(*) AS count
       FROM wellmind_assessments
       WHERE contractor_id = $1 AND assessment_date BETWEEN $2 AND $3
       GROUP BY quarter, risk_level ORDER BY quarter`,
      [contractorId, startDate, endDate]
    );

    res.json({
      success: true,
      data: {
        pulse_trends: pulseTrends.rows,
        risk_trends: riskTrends.rows,
      }
    });
  } catch (error) {
    logger.error('Error fetching trends:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/wellmind/admin/questions */
const createQuestion = async (req, res) => {
  try {
    const { question_type, question_text, question_text_en, response_type, category, display_order } = req.body;

    if (!question_type || !question_text || !response_type || !category) {
      return res.status(400).json({ success: false, message: 'Kötelező mezők hiányoznak' });
    }

    const result = await query(
      `INSERT INTO wellmind_questions
         (question_type, question_text, question_text_en, response_type, category, display_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [question_type, question_text, question_text_en || null, response_type, category, display_order || 0]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating question:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/wellmind/admin/questions/:id */
const updateQuestion = async (req, res) => {
  try {
    const { question_text, question_text_en, is_active, display_order, category, response_type } = req.body;

    const updates = [];
    const params = [req.params.id];
    let idx = 2;

    if (question_text !== undefined) { updates.push(`question_text = $${idx}`); params.push(question_text); idx++; }
    if (question_text_en !== undefined) { updates.push(`question_text_en = $${idx}`); params.push(question_text_en); idx++; }
    if (is_active !== undefined) { updates.push(`is_active = $${idx}`); params.push(is_active); idx++; }
    if (display_order !== undefined) { updates.push(`display_order = $${idx}`); params.push(display_order); idx++; }
    if (category !== undefined) { updates.push(`category = $${idx}`); params.push(category); idx++; }
    if (response_type !== undefined) { updates.push(`response_type = $${idx}`); params.push(response_type); idx++; }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs frissítendő mező' });
    }

    const result = await query(
      `UPDATE wellmind_questions SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kérdés nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating question:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** DELETE /api/v1/wellmind/admin/questions/:id */
const deleteQuestion = async (req, res) => {
  try {
    // Check if question has been used in any assessment response
    const used = await query(
      `SELECT EXISTS(
         SELECT 1 FROM wellmind_assessments WHERE responses::text LIKE '%' || $1 || '%'
       ) AS in_use`,
      [req.params.id]
    );

    if (used.rows[0].in_use) {
      // Soft delete — just deactivate
      await query('UPDATE wellmind_questions SET is_active = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
      return res.json({ success: true, message: 'Kérdés deaktiválva (használatban volt)' });
    }

    const result = await query('DELETE FROM wellmind_questions WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kérdés nem található' });
    }

    res.json({ success: true, message: 'Kérdés törölve' });
  } catch (error) {
    logger.error('Error deleting question:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/wellmind/admin/questions */
const getQuestions = async (req, res) => {
  try {
    let sql = 'SELECT * FROM wellmind_questions WHERE 1=1';
    const params = [];
    let idx = 1;

    if (req.query.question_type) {
      sql += ` AND question_type = $${idx}`;
      params.push(req.query.question_type);
      idx++;
    }
    if (req.query.is_active !== undefined) {
      sql += ` AND is_active = $${idx}`;
      params.push(req.query.is_active === 'true');
      idx++;
    }

    sql += ' ORDER BY question_type, display_order, created_at';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching questions:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/wellmind/admin/bulk-intervention */
const bulkIntervention = async (req, res) => {
  try {
    const { intervention_type, title, description, target_risk_level, contractor_id } = req.body;

    if (!intervention_type || !title || !description || !target_risk_level) {
      return res.status(400).json({ success: false, message: 'Kötelező mezők hiányoznak' });
    }

    const cid = contractor_id || req.user.contractorId;

    // Get employees at target risk level
    const employees = await query(
      `SELECT DISTINCT ON (a.user_id) a.user_id
       FROM wellmind_assessments a
       WHERE a.contractor_id = $1 AND a.risk_level = $2
       ORDER BY a.user_id, a.assessment_date DESC`,
      [cid, target_risk_level]
    );

    let created = 0;
    for (const emp of employees.rows) {
      try {
        await query(
          `INSERT INTO wellmind_interventions
             (user_id, contractor_id, intervention_type, title, description,
              priority, triggered_by, recommended_reason)
           VALUES ($1, $2, $3, $4, $5, 'medium', 'manual', 'Vállalati szintű program')
           ON CONFLICT DO NOTHING`,
          [emp.user_id, cid, intervention_type, title, description]
        );
        created++;
      } catch (e) {
        logger.error('Bulk intervention insert failed', { userId: emp.user_id, error: e.message });
      }
    }

    await integrationService.logDataAccess(
      req.user.id, null, req.user.contractorId,
      'bulk_intervention_created', 'intervention', null,
      `Bulk ${intervention_type} for ${target_risk_level} employees: ${created} created`
    );

    res.status(201).json({
      success: true,
      data: { created_count: created, target_risk_level }
    });
  } catch (error) {
    logger.error('Error creating bulk intervention:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

module.exports = {
  submitPulse, getPulseHistory, getTodayPulse,
  submitAssessment, getAssessmentHistory,
  getMyDashboard,
  getInterventions, acceptIntervention, completeIntervention, skipIntervention,
  getCoachingSessions, rateCoachingSession,
  getTeamMetrics,
  getAdminDashboard, getRiskEmployees, getTrends,
  createQuestion, updateQuestion, deleteQuestion, getQuestions,
  bulkIntervention,
};
