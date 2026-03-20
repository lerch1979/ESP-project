const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

router.use(authenticateToken);

// GET /api/v1/analytics/pulse/overview — contractor pulse summary
router.get('/pulse/overview', async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;

    const [daily, alerts, categories] = await Promise.all([
      query(`SELECT * FROM v_pulse_contractor_daily WHERE contractor_id = $1 ORDER BY survey_date DESC LIMIT 30`, [contractorId]),
      query(`SELECT * FROM v_pulse_alerts WHERE contractor_id = $1`, [contractorId]),
      query(`SELECT * FROM v_pulse_category_stats`),
    ]);

    const latestDay = daily.rows[0];
    res.json({
      success: true,
      data: {
        summary: {
          avg_mood: latestDay?.avg_mood || 0,
          avg_stress: latestDay?.avg_stress || 0,
          avg_sleep: latestDay?.avg_sleep || 0,
          avg_workload: latestDay?.avg_workload || 0,
          respondents_today: latestDay?.respondents || 0,
          active_alerts: alerts.rows.length,
        },
        daily_trend: daily.rows,
        alerts: alerts.rows,
        category_stats: categories.rows,
      },
    });
  } catch (error) {
    logger.error('Analytics overview error:', error.message);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

// GET /api/v1/analytics/pulse/trend — daily trend with filters
router.get('/pulse/trend', async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const days = Math.min(parseInt(req.query.days) || 30, 90);

    const result = await query(
      `SELECT * FROM v_pulse_contractor_daily
       WHERE contractor_id = $1 AND survey_date >= CURRENT_DATE - CAST($2 AS INTEGER)
       ORDER BY survey_date ASC`,
      [contractorId, days]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Analytics trend error:', error.message);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

// GET /api/v1/analytics/pulse/alerts — active wellbeing alerts
router.get('/pulse/alerts', async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const result = await query(`SELECT * FROM v_pulse_alerts WHERE contractor_id = $1`, [contractorId]);

    const grouped = {
      critical: result.rows.filter(a => a.alert_level === 'critical'),
      warning: result.rows.filter(a => a.alert_level === 'warning'),
    };

    res.json({ success: true, data: { total: result.rows.length, by_level: grouped, all: result.rows } });
  } catch (error) {
    logger.error('Analytics alerts error:', error.message);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

// GET /api/v1/analytics/pulse/housing — housing wellbeing insights
router.get('/pulse/housing', async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const result = await query(
      `SELECT * FROM v_pulse_housing_daily WHERE contractor_id = $1 ORDER BY inspection_date DESC LIMIT 30`,
      [contractorId]
    );
    const avg = result.rows.length > 0
      ? (result.rows.reduce((s, r) => s + parseFloat(r.avg_housing_score), 0) / result.rows.length).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        summary: { avg_housing_score: avg, days_tracked: result.rows.length },
        daily: result.rows,
      },
    });
  } catch (error) {
    logger.error('Analytics housing error:', error.message);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

// GET /api/v1/analytics/pulse/categories — question category stats
router.get('/pulse/categories', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM v_pulse_category_stats`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Analytics categories error:', error.message);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

// GET /api/v1/analytics/pulse/export — CSV export
router.get('/pulse/export', async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const result = await query(
      `SELECT survey_date, avg_mood, avg_stress, avg_sleep, avg_workload, respondents
       FROM v_pulse_contractor_daily WHERE contractor_id = $1 ORDER BY survey_date DESC`,
      [contractorId]
    );

    const headers = 'date,avg_mood,avg_stress,avg_sleep,avg_workload,respondents\n';
    const csv = headers + result.rows.map(r =>
      `${r.survey_date},${r.avg_mood},${r.avg_stress},${r.avg_sleep},${r.avg_workload},${r.respondents}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=pulse-analytics-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Analytics export error:', error.message);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

module.exports = router;
