const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// SCORING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Maslach Burnout Inventory (MBI) configuration
// EE: Emotional Exhaustion (score range per item: 1-10, higher = worse)
// DP: Depersonalization (score range per item: 1-10, higher = worse)
// PA: Personal Accomplishment (score range per item: 1-10, higher = BETTER → reverse in burnout)
const MBI_WEIGHTS = { ee: 0.45, dp: 0.25, pa: 0.30 };

// Utrecht Work Engagement Scale (UWES) configuration
// Vigor, Dedication, Absorption (all: higher = better)
const UWES_WEIGHTS = { vigor: 0.35, dedication: 0.40, absorption: 0.25 };

// Risk thresholds
const RISK_THRESHOLDS = {
  burnout: { yellow: 50, red: 70 },
  engagement: { yellow: 50, red: 30 },
};

const MIN_TEAM_SIZE = 5;

// ═══════════════════════════════════════════════════════════════════════════
// PULSE SURVEY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Submit a daily pulse survey. One per user per day (upsert).
 */
async function submitPulse(userId, contractorId, pulseData) {
  const { mood_score, stress_level, sleep_quality, workload_level, notes } = pulseData;

  if (!mood_score || mood_score < 1 || mood_score > 5) {
    throw new Error('mood_score must be between 1 and 5');
  }

  const result = await query(
    `INSERT INTO wellmind_pulse_surveys
       (user_id, contractor_id, mood_score, stress_level, sleep_quality, workload_level, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, survey_date)
     DO UPDATE SET
       mood_score = EXCLUDED.mood_score,
       stress_level = EXCLUDED.stress_level,
       sleep_quality = EXCLUDED.sleep_quality,
       workload_level = EXCLUDED.workload_level,
       notes = EXCLUDED.notes,
       submitted_at = NOW()
     RETURNING *`,
    [userId, contractorId, mood_score, stress_level || null, sleep_quality || null, workload_level || null, notes || null]
  );

  // Check immediate risk after submission
  await checkImmediateRisk(userId, contractorId);

  return result.rows[0];
}

/**
 * Get pulse history for a user over the given number of days.
 */
async function getPulseHistory(userId, days = 30) {
  const result = await query(
    `SELECT survey_date, mood_score, stress_level, sleep_quality, workload_level, notes, submitted_at
     FROM wellmind_pulse_surveys
     WHERE user_id = $1 AND survey_date >= CURRENT_DATE - $2
     ORDER BY survey_date DESC`,
    [userId, days]
  );
  return result.rows;
}

/**
 * Calculate 7-day moving average for mood score.
 */
async function calculatePulseTrend(userId, windowDays = 7) {
  const result = await query(
    `WITH daily AS (
       SELECT survey_date, mood_score
       FROM wellmind_pulse_surveys
       WHERE user_id = $1 AND survey_date >= CURRENT_DATE - 60
       ORDER BY survey_date
     )
     SELECT
       survey_date,
       mood_score,
       AVG(mood_score) OVER (
         ORDER BY survey_date
         ROWS BETWEEN $2 PRECEDING AND CURRENT ROW
       ) AS moving_avg
     FROM daily
     ORDER BY survey_date DESC`,
    [userId, windowDays - 1]
  );
  return result.rows;
}

/**
 * Detect sudden drops in pulse scores (anomaly).
 * Returns true if the latest score dropped by >= 2 compared to 7-day average.
 */
async function detectPulseAnomaly(userId) {
  const result = await query(
    `WITH recent AS (
       SELECT mood_score, survey_date,
              AVG(mood_score) OVER (ORDER BY survey_date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) AS prev_avg
       FROM wellmind_pulse_surveys
       WHERE user_id = $1 AND survey_date >= CURRENT_DATE - 14
       ORDER BY survey_date DESC
       LIMIT 1
     )
     SELECT mood_score, prev_avg,
            (prev_avg - mood_score) AS drop_size
     FROM recent
     WHERE prev_avg IS NOT NULL`,
    [userId]
  );

  if (result.rows.length === 0) return { anomaly: false };

  const { mood_score, prev_avg, drop_size } = result.rows[0];
  const anomaly = parseFloat(drop_size) >= 2;

  return {
    anomaly,
    current_score: parseFloat(mood_score),
    previous_avg: parseFloat(prev_avg),
    drop_size: parseFloat(drop_size),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSESSMENT SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate burnout score from assessment responses.
 *
 * Responses is an array of { category, score } where:
 *   - category: 'emotional_exhaustion' | 'depersonalization' | 'personal_accomplishment'
 *   - score: 1-10 (raw item score)
 *
 * Returns { total, ee, dp, pa } all normalized to 0-100.
 */
function calculateBurnoutScore(responses) {
  const byCategory = {};
  for (const r of responses) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r.score);
  }

  // Average each dimension (1-10 scale), normalize to 0-100
  const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 5;
  const normalize = (val) => ((val - 1) / 9) * 100; // 1→0, 10→100

  const eeRaw = avg(byCategory['emotional_exhaustion'] || []);
  const dpRaw = avg(byCategory['depersonalization'] || []);
  const paRaw = avg(byCategory['personal_accomplishment'] || []);

  const ee = normalize(eeRaw);   // Higher = worse
  const dp = normalize(dpRaw);   // Higher = worse
  const pa = normalize(paRaw);   // Higher = BETTER, so invert for burnout

  // Composite burnout: EE*0.45 + DP*0.25 + (100-PA)*0.30
  const total = round2(ee * MBI_WEIGHTS.ee + dp * MBI_WEIGHTS.dp + (100 - pa) * MBI_WEIGHTS.pa);

  return {
    total: clamp(total),
    emotional_exhaustion: round2(ee),
    depersonalization: round2(dp),
    personal_accomplishment: round2(pa),
  };
}

/**
 * Calculate engagement score from assessment responses.
 *
 * Responses is an array of { category, score } where:
 *   - category: 'vigor' | 'dedication' | 'absorption'
 *   - score: 1-10
 *
 * Returns { total, vigor, dedication, absorption } all 0-100.
 */
function calculateEngagementScore(responses) {
  const byCategory = {};
  for (const r of responses) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r.score);
  }

  const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 5;
  const normalize = (val) => ((val - 1) / 9) * 100;

  const vigor = normalize(avg(byCategory['vigor'] || []));
  const dedication = normalize(avg(byCategory['dedication'] || []));
  const absorption = normalize(avg(byCategory['absorption'] || []));

  const total = round2(
    vigor * UWES_WEIGHTS.vigor +
    dedication * UWES_WEIGHTS.dedication +
    absorption * UWES_WEIGHTS.absorption
  );

  return {
    total: clamp(total),
    vigor: round2(vigor),
    dedication: round2(dedication),
    absorption: round2(absorption),
  };
}

/**
 * Determine risk level from burnout and engagement scores.
 */
function determineRiskLevel(burnoutScore, engagementScore) {
  if (burnoutScore > RISK_THRESHOLDS.burnout.red || engagementScore < RISK_THRESHOLDS.engagement.red) {
    return 'red';
  }
  if (burnoutScore >= RISK_THRESHOLDS.burnout.yellow || engagementScore <= RISK_THRESHOLDS.engagement.yellow) {
    return 'yellow';
  }
  return 'green';
}

/**
 * Submit a quarterly assessment. Computes scores and risk level.
 */
async function submitAssessment(userId, contractorId, responses) {
  const quarter = getCurrentQuarter();

  // Split responses by burnout vs engagement
  const burnoutResponses = responses.filter(r =>
    ['emotional_exhaustion', 'depersonalization', 'personal_accomplishment'].includes(r.category)
  );
  const engagementResponses = responses.filter(r =>
    ['vigor', 'dedication', 'absorption'].includes(r.category)
  );

  const burnout = calculateBurnoutScore(burnoutResponses);
  const engagement = calculateEngagementScore(engagementResponses);
  const riskLevel = determineRiskLevel(burnout.total, engagement.total);

  const riskFactors = [];
  if (burnout.emotional_exhaustion > 70) riskFactors.push({ factor: 'emotional_exhaustion', severity: 'high', score: burnout.emotional_exhaustion });
  if (burnout.depersonalization > 60) riskFactors.push({ factor: 'depersonalization', severity: 'high', score: burnout.depersonalization });
  if (engagement.vigor < 40) riskFactors.push({ factor: 'low_vigor', severity: 'moderate', score: engagement.vigor });
  if (engagement.dedication < 40) riskFactors.push({ factor: 'low_dedication', severity: 'moderate', score: engagement.dedication });

  const result = await query(
    `INSERT INTO wellmind_assessments
       (user_id, contractor_id, quarter, responses,
        burnout_score, engagement_score,
        emotional_exhaustion_score, depersonalization_score, personal_accomplishment_score,
        vigor_score, dedication_score, absorption_score,
        risk_level, risk_factors)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (user_id, quarter) DO UPDATE SET
       responses = EXCLUDED.responses,
       burnout_score = EXCLUDED.burnout_score,
       engagement_score = EXCLUDED.engagement_score,
       emotional_exhaustion_score = EXCLUDED.emotional_exhaustion_score,
       depersonalization_score = EXCLUDED.depersonalization_score,
       personal_accomplishment_score = EXCLUDED.personal_accomplishment_score,
       vigor_score = EXCLUDED.vigor_score,
       dedication_score = EXCLUDED.dedication_score,
       absorption_score = EXCLUDED.absorption_score,
       risk_level = EXCLUDED.risk_level,
       risk_factors = EXCLUDED.risk_factors,
       submitted_at = NOW()
     RETURNING *`,
    [
      userId, contractorId, quarter, JSON.stringify(responses),
      burnout.total, engagement.total,
      burnout.emotional_exhaustion, burnout.depersonalization, burnout.personal_accomplishment,
      engagement.vigor, engagement.dedication, engagement.absorption,
      riskLevel, JSON.stringify(riskFactors),
    ]
  );

  // Auto-generate interventions based on results
  if (riskLevel !== 'green') {
    await generateInterventions(userId, contractorId, result.rows[0]);
  }

  return result.rows[0];
}

async function getLatestAssessment(userId) {
  const result = await query(
    `SELECT * FROM wellmind_assessments
     WHERE user_id = $1 ORDER BY assessment_date DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getAssessmentHistory(userId) {
  const result = await query(
    `SELECT id, quarter, assessment_date, burnout_score, engagement_score, risk_level, submitted_at
     FROM wellmind_assessments
     WHERE user_id = $1 ORDER BY assessment_date DESC`,
    [userId]
  );
  return result.rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERVENTION RECOMMENDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const INTERVENTION_RULES = [
  {
    id: 'R01_high_burnout',
    condition: (a) => a.burnout_score > 70,
    intervention: {
      intervention_type: 'eap_referral',
      title: 'Szakmai támogatás ajánlott',
      description: 'A wellbeing felméréséd magas stresszt mutat. Javasoljuk, hogy beszélj egy szakemberrel a CarePath programon keresztül.',
      priority: 'urgent',
    },
  },
  {
    id: 'R02_low_engagement',
    condition: (a) => a.engagement_score < 40,
    intervention: {
      intervention_type: 'coaching',
      title: 'Karrier coaching alkalom',
      description: 'Egy coaching beszélgetés segíthet újra megtalálni a motivációdat és a munkád értelmét.',
      priority: 'high',
    },
  },
  {
    id: 'R03_moderate_burnout',
    condition: (a) => a.burnout_score >= 50 && a.burnout_score <= 70,
    intervention: {
      intervention_type: 'meditation',
      title: 'Mindfulness és meditációs program',
      description: 'Napi 10 perces vezetett meditáció a stresszcsökkentés érdekében.',
      priority: 'medium',
    },
  },
  {
    id: 'R04_high_emotional_exhaustion',
    condition: (a) => a.emotional_exhaustion_score > 70,
    intervention: {
      intervention_type: 'time_off',
      title: 'Pihenés ajánlott',
      description: 'Magas érzelmi kimerültség — fontold meg néhány nap szabadság kivételét a regenerálódáshoz.',
      priority: 'high',
    },
  },
  {
    id: 'R05_workload_issue',
    condition: (a) => a.depersonalization_score > 60,
    intervention: {
      intervention_type: 'workload_adjustment',
      title: 'Munkaterhelés felülvizsgálata',
      description: 'Egyeztess a vezetőddel a feladatok priorizálásáról és a munkaterhelés elosztásáról.',
      priority: 'medium',
    },
  },
  {
    id: 'R06_low_accomplishment',
    condition: (a) => a.personal_accomplishment_score < 40,
    intervention: {
      intervention_type: 'training',
      title: 'Szakmai fejlődési lehetőség',
      description: 'Növeld az önbizalmad egy szakmai fejlesztő tréninggel vagy workshoppal.',
      priority: 'low',
    },
  },
  {
    id: 'R07_exercise',
    condition: (a) => a.burnout_score >= 40 && a.engagement_score <= 60,
    intervention: {
      intervention_type: 'exercise',
      title: 'Testmozgás program',
      description: 'Heti 3× 30 perces testmozgás bizonyítottan csökkenti a stresszt és javítja a hangulatot.',
      priority: 'low',
    },
  },
];

/**
 * Generate interventions based on assessment results.
 */
async function generateInterventions(userId, contractorId, assessment) {
  const created = [];

  for (const rule of INTERVENTION_RULES) {
    if (!rule.condition(assessment)) continue;

    // Check if same type intervention already active
    const existing = await query(
      `SELECT id FROM wellmind_interventions
       WHERE user_id = $1 AND intervention_type = $2
         AND status IN ('recommended', 'accepted', 'in_progress')`,
      [userId, rule.intervention.intervention_type]
    );

    if (existing.rows.length > 0) continue;

    const result = await query(
      `INSERT INTO wellmind_interventions
         (user_id, contractor_id, intervention_type, title, description,
          priority, recommended_reason, triggered_by, trigger_source_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'assessment', $8)
       RETURNING id, intervention_type, title, priority`,
      [
        userId, contractorId,
        rule.intervention.intervention_type, rule.intervention.title,
        rule.intervention.description, rule.intervention.priority,
        `Rule ${rule.id}: assessment scores triggered`,
        assessment.id,
      ]
    );

    created.push(result.rows[0]);
  }

  return created;
}

/**
 * Recommend interventions based on assessment (pure function for preview, no DB writes).
 */
function recommendInterventions(assessment) {
  return INTERVENTION_RULES
    .filter(rule => rule.condition(assessment))
    .map(rule => ({ ...rule.intervention, rule_id: rule.id }));
}

async function getRecommendedInterventions(userId) {
  const result = await query(
    `SELECT * FROM wellmind_interventions
     WHERE user_id = $1 AND status IN ('recommended', 'accepted', 'in_progress')
     ORDER BY
       CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
       recommended_at DESC`,
    [userId]
  );
  return result.rows;
}

async function acceptIntervention(interventionId, userId) {
  const result = await query(
    `UPDATE wellmind_interventions
     SET status = 'accepted', accepted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'recommended'
     RETURNING *`,
    [interventionId, userId]
  );
  if (result.rows.length === 0) throw new Error('Intervention not found or not in recommended status');
  return result.rows[0];
}

async function declineIntervention(interventionId, userId, reason) {
  const result = await query(
    `UPDATE wellmind_interventions
     SET status = 'declined', declined_at = NOW(), completion_notes = $3
     WHERE id = $1 AND user_id = $2 AND status IN ('recommended', 'accepted')
     RETURNING *`,
    [interventionId, userId, reason || null]
  );
  if (result.rows.length === 0) throw new Error('Intervention not found or already processed');
  return result.rows[0];
}

async function completeIntervention(interventionId, userId, notes, rating) {
  const result = await query(
    `UPDATE wellmind_interventions
     SET status = 'completed', completed_at = NOW(),
         completion_notes = $3, effectiveness_rating = $4
     WHERE id = $1 AND user_id = $2 AND status IN ('recommended', 'accepted', 'in_progress')
     RETURNING *`,
    [interventionId, userId, notes || null, rating || null]
  );
  if (result.rows.length === 0) throw new Error('Intervention not found or already completed');
  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// COACHING SESSIONS
// ═══════════════════════════════════════════════════════════════════════════

async function scheduleCoachingSession(userId, contractorId, sessionData) {
  const { coach_name, coach_user_id, session_date, duration_minutes, session_type } = sessionData;

  const result = await query(
    `INSERT INTO wellmind_coaching_sessions
       (user_id, contractor_id, coach_name, coach_user_id,
        session_date, duration_minutes, session_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
     RETURNING *`,
    [userId, contractorId, coach_name, coach_user_id || null,
     session_date, duration_minutes || 45, session_type || 'general']
  );
  return result.rows[0];
}

async function getCoachingSessions(userId, status) {
  let sql = `SELECT * FROM wellmind_coaching_sessions WHERE user_id = $1`;
  const params = [userId];

  if (status) {
    sql += ` AND status = $2`;
    params.push(status);
  }

  sql += ` ORDER BY session_date DESC`;
  const result = await query(sql, params);
  return result.rows;
}

async function rateCoachingSession(sessionId, userId, rating, feedback) {
  const result = await query(
    `UPDATE wellmind_coaching_sessions
     SET employee_rating = $3, employee_feedback = $4
     WHERE id = $1 AND user_id = $2 AND status = 'completed'
     RETURNING *`,
    [sessionId, userId, rating, feedback || null]
  );
  if (result.rows.length === 0) throw new Error('Session not found or not completed');
  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// TEAM METRICS (PRIVACY-COMPLIANT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get aggregated team metrics. Enforces minimum 5 employees.
 */
async function getTeamMetrics(contractorId, startDate, endDate) {
  const result = await query(
    `SELECT metric_date, employee_count, avg_mood_score, avg_stress_level,
            avg_burnout_score, avg_engagement_score, risk_distribution,
            pulse_response_rate, mood_trend, stress_trend
     FROM wellmind_team_metrics
     WHERE contractor_id = $1
       AND metric_date BETWEEN $2 AND $3
       AND employee_count >= $4
     ORDER BY metric_date DESC`,
    [contractorId, startDate, endDate, MIN_TEAM_SIZE]
  );
  return result.rows;
}

/**
 * Calculate and store team metrics for a given date. Used by cron job.
 */
async function calculateTeamMetrics(contractorId, date) {
  const metricsResult = await query(
    `SELECT
       COUNT(DISTINCT user_id) AS employee_count,
       ROUND(AVG(mood_score)::numeric, 2) AS avg_mood,
       ROUND(AVG(stress_level)::numeric, 2) AS avg_stress,
       ROUND(AVG(sleep_quality)::numeric, 2) AS avg_sleep,
       ROUND(AVG(workload_level)::numeric, 2) AS avg_workload
     FROM wellmind_pulse_surveys
     WHERE contractor_id = $1 AND survey_date = $2`,
    [contractorId, date]
  );

  const m = metricsResult.rows[0];
  const employeeCount = parseInt(m.employee_count);

  if (employeeCount < MIN_TEAM_SIZE) {
    return null; // Privacy: not enough employees
  }

  // Get risk distribution from latest assessments
  const riskResult = await query(
    `SELECT risk_level, COUNT(*) AS count
     FROM (
       SELECT DISTINCT ON (user_id) risk_level
       FROM wellmind_assessments
       WHERE contractor_id = $1
       ORDER BY user_id, assessment_date DESC
     ) latest
     GROUP BY risk_level`,
    [contractorId]
  );

  const risk = { green: 0, yellow: 0, red: 0 };
  riskResult.rows.forEach(r => { risk[r.risk_level] = parseInt(r.count); });

  const result = await query(
    `INSERT INTO wellmind_team_metrics
       (contractor_id, metric_date, employee_count,
        avg_mood_score, avg_stress_level, risk_distribution, pulse_response_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (contractor_id, team_id, metric_date) DO UPDATE SET
       avg_mood_score = EXCLUDED.avg_mood_score,
       avg_stress_level = EXCLUDED.avg_stress_level,
       risk_distribution = EXCLUDED.risk_distribution
     RETURNING *`,
    [contractorId, date, employeeCount, m.avg_mood, m.avg_stress, JSON.stringify(risk), null]
  );

  return result.rows[0];
}

/**
 * Get HR company-wide dashboard data.
 */
async function getCompanyDashboard(contractorId) {
  const [overview, riskDist, recentMetrics, topRisks] = await Promise.all([
    query(
      `SELECT
         COUNT(DISTINCT user_id) AS active_users,
         ROUND(AVG(mood_score)::numeric, 2) AS avg_mood,
         ROUND(AVG(stress_level)::numeric, 2) AS avg_stress
       FROM wellmind_pulse_surveys
       WHERE contractor_id = $1 AND survey_date >= CURRENT_DATE - 30`,
      [contractorId]
    ),
    query(
      `SELECT risk_level, COUNT(*) AS count
       FROM (
         SELECT DISTINCT ON (user_id) risk_level
         FROM wellmind_assessments WHERE contractor_id = $1
         ORDER BY user_id, assessment_date DESC
       ) latest GROUP BY risk_level`,
      [contractorId]
    ),
    query(
      `SELECT * FROM wellmind_team_metrics
       WHERE contractor_id = $1 ORDER BY metric_date DESC LIMIT 12`,
      [contractorId]
    ),
    query(
      `SELECT user_id, turnover_risk_score, risk_level, burnout_progression_trend, top_risk_factors
       FROM wellmind_ml_predictions
       WHERE contractor_id = $1 AND risk_level IN ('yellow', 'red')
       ORDER BY turnover_risk_score DESC LIMIT 10`,
      [contractorId]
    ),
  ]);

  const risk = { green: 0, yellow: 0, red: 0 };
  riskDist.rows.forEach(r => { risk[r.risk_level] = parseInt(r.count); });

  return {
    overview: overview.rows[0],
    risk_distribution: risk,
    recent_metrics: recentMetrics.rows,
    top_risk_employees: topRisks.rows,
  };
}

/**
 * Get high-risk employees list (admin only).
 */
async function getRiskEmployees(contractorId, riskLevel = 'red') {
  const result = await query(
    `SELECT
       ml.user_id, ml.turnover_risk_score, ml.risk_level,
       ml.burnout_progression_trend, ml.top_risk_factors, ml.confidence_score,
       a.burnout_score AS latest_burnout, a.engagement_score AS latest_engagement,
       a.risk_level AS assessment_risk
     FROM wellmind_ml_predictions ml
     LEFT JOIN LATERAL (
       SELECT burnout_score, engagement_score, risk_level
       FROM wellmind_assessments
       WHERE user_id = ml.user_id
       ORDER BY assessment_date DESC LIMIT 1
     ) a ON true
     WHERE ml.contractor_id = $1 AND ml.risk_level = $2
     ORDER BY ml.turnover_risk_score DESC`,
    [contractorId, riskLevel]
  );
  return result.rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMMEDIATE RISK DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check for 3 consecutive low pulse scores (mood <= 2).
 * If detected, auto-creates a CarePath referral.
 */
async function checkImmediateRisk(userId, contractorId) {
  const recent = await query(
    `SELECT mood_score FROM wellmind_pulse_surveys
     WHERE user_id = $1 ORDER BY survey_date DESC LIMIT 3`,
    [userId]
  );

  if (recent.rows.length < 3) return false;

  const allLow = recent.rows.every(p => p.mood_score <= 2);
  if (!allLow) return false;

  // Check if referral already exists recently
  const existingRef = await query(
    `SELECT id FROM wellbeing_referrals
     WHERE user_id = $1 AND referral_type = 'consecutive_low_pulse'
       AND status IN ('pending', 'accepted')
       AND created_at >= CURRENT_DATE - 7`,
    [userId]
  );

  if (existingRef.rows.length > 0) return false; // Already referred

  // Create auto-referral
  await query(
    `INSERT INTO wellbeing_referrals
       (user_id, contractor_id, source_module, target_module,
        referral_type, urgency_level, referral_reason, is_auto_generated)
     VALUES ($1, $2, 'wellmind', 'carepath', 'consecutive_low_pulse', 'high',
             '3 egymást követő napon alacsony hangulati pontszám (≤2/5). Azonnali támogatás ajánlott.', true)`,
    [userId, contractorId]
  );

  // Create notification
  await query(
    `INSERT INTO wellbeing_notifications
       (user_id, contractor_id, notification_type, notification_channel,
        title, message, priority, action_url, source_module)
     VALUES ($1, $2, 'carepath_referral_created', 'push',
             'Támogatás elérhető', 'Észrevettük, hogy nehéz napjaid voltak. A CarePath program 24/7 elérhető számodra.',
             'urgent', '/carepath/home', 'wellmind')`,
    [userId, contractorId]
  );

  logger.warn('Immediate risk detected', { userId, type: 'consecutive_low_pulse' });
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// ML PREDICTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple heuristic turnover risk prediction.
 * In production, replace with actual ML model inference.
 */
async function predictTurnoverRisk(userId, contractorId) {
  // Gather features
  const [pulseData, assessData] = await Promise.all([
    query(
      `SELECT AVG(mood_score) AS avg_mood, AVG(stress_level) AS avg_stress
       FROM wellmind_pulse_surveys
       WHERE user_id = $1 AND survey_date >= CURRENT_DATE - 30`,
      [userId]
    ),
    query(
      `SELECT burnout_score, engagement_score
       FROM wellmind_assessments
       WHERE user_id = $1 ORDER BY assessment_date DESC LIMIT 1`,
      [userId]
    ),
  ]);

  const avgMood = parseFloat(pulseData.rows[0]?.avg_mood) || 3;
  const avgStress = parseFloat(pulseData.rows[0]?.avg_stress) || 5;
  const burnout = parseFloat(assessData.rows[0]?.burnout_score) || 30;
  const engagement = parseFloat(assessData.rows[0]?.engagement_score) || 60;

  // Heuristic scoring (replace with ML model)
  const moodRisk = ((5 - avgMood) / 4) * 100;
  const stressRisk = (avgStress / 10) * 100;
  const turnoverRisk = clamp(round2(
    moodRisk * 0.2 + stressRisk * 0.1 + burnout * 0.4 + (100 - engagement) * 0.3
  ));

  const riskLevel = turnoverRisk > 70 ? 'red' : turnoverRisk > 40 ? 'yellow' : 'green';
  const trend = burnout > 50 ? 'declining' : burnout < 30 ? 'improving' : 'stable';

  const features = { avg_mood_30d: avgMood, avg_stress_30d: avgStress, burnout, engagement };
  const topFactors = [];
  if (burnout > 60) topFactors.push({ factor: 'high_burnout', importance: 0.4 });
  if (engagement < 40) topFactors.push({ factor: 'low_engagement', importance: 0.3 });
  if (avgMood < 3) topFactors.push({ factor: 'low_mood', importance: 0.2 });

  await query(
    `INSERT INTO wellmind_ml_predictions
       (user_id, contractor_id, turnover_risk_score, burnout_progression_trend,
        risk_level, confidence_score, model_version, features, top_risk_factors)
     VALUES ($1, $2, $3, $4, $5, 75, 'v1.0-heuristic', $6, $7)
     ON CONFLICT (user_id, prediction_date, model_version) DO UPDATE SET
       turnover_risk_score = EXCLUDED.turnover_risk_score,
       risk_level = EXCLUDED.risk_level,
       features = EXCLUDED.features`,
    [userId, contractorId, turnoverRisk, trend, riskLevel, JSON.stringify(features), JSON.stringify(topFactors)]
  );

  return { turnover_risk_score: turnoverRisk, risk_level: riskLevel, trend, features, top_risk_factors: topFactors };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function round2(val) { return Math.round(val * 100) / 100; }
function clamp(val) { return Math.max(0, Math.min(100, val)); }

function getCurrentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Pulse
  submitPulse, getPulseHistory, calculatePulseTrend, detectPulseAnomaly,
  // Assessment
  submitAssessment, getLatestAssessment, getAssessmentHistory,
  calculateBurnoutScore, calculateEngagementScore, determineRiskLevel,
  // Interventions
  recommendInterventions, generateInterventions,
  getRecommendedInterventions, acceptIntervention, declineIntervention, completeIntervention,
  // Coaching
  scheduleCoachingSession, getCoachingSessions, rateCoachingSession,
  // Team metrics
  getTeamMetrics, calculateTeamMetrics, getCompanyDashboard, getRiskEmployees,
  // Risk detection
  checkImmediateRisk,
  // ML
  predictTurnoverRisk,
  // Constants
  MBI_WEIGHTS, UWES_WEIGHTS, RISK_THRESHOLDS, MIN_TEAM_SIZE, INTERVENTION_RULES,
  // Helpers
  getCurrentQuarter,
};
