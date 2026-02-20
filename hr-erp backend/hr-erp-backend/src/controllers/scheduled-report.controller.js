const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { executeReport, calculateNextRun } = require('../services/report-scheduler.service');

/**
 * GET / — list all scheduled reports with last run info
 */
const getAll = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        sr.*,
        (SELECT status FROM scheduled_report_runs WHERE scheduled_report_id = sr.id ORDER BY started_at DESC LIMIT 1) as last_run_status,
        (SELECT started_at FROM scheduled_report_runs WHERE scheduled_report_id = sr.id ORDER BY started_at DESC LIMIT 1) as last_run_at,
        (SELECT COUNT(*) FROM scheduled_report_runs WHERE scheduled_report_id = sr.id) as total_runs,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM scheduled_reports sr
      LEFT JOIN users u ON sr.created_by = u.id
      ORDER BY sr.created_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Scheduled reports list error:', error);
    res.status(500).json({ success: false, message: 'Ütemezett riportok lekérési hiba' });
  }
};

/**
 * POST / — create a new scheduled report
 */
const create = async (req, res) => {
  try {
    const { name, report_type, schedule_type, schedule_time, day_of_week, day_of_month, recipients, filters } = req.body;

    if (!name || !report_type || !schedule_type) {
      return res.status(400).json({ success: false, message: 'Név, riport típus és ütemezés típus kötelező' });
    }

    const nextRun = calculateNextRun(schedule_type, schedule_time, day_of_week, day_of_month);

    const result = await query(
      `INSERT INTO scheduled_reports
        (name, report_type, schedule_type, schedule_time, day_of_week, day_of_month, recipients, filters, next_run_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, report_type, schedule_type, schedule_time || '08:00', day_of_week, day_of_month, recipients || [], JSON.stringify(filters || []), nextRun, req.user.id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Scheduled report create error:', error);
    res.status(500).json({ success: false, message: 'Ütemezett riport létrehozási hiba' });
  }
};

/**
 * PUT /:id — update a scheduled report
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, report_type, schedule_type, schedule_time, day_of_week, day_of_month, recipients, filters } = req.body;

    const nextRun = calculateNextRun(schedule_type, schedule_time, day_of_week, day_of_month);

    const result = await query(
      `UPDATE scheduled_reports
       SET name = $1, report_type = $2, schedule_type = $3, schedule_time = $4,
           day_of_week = $5, day_of_month = $6, recipients = $7, filters = $8,
           next_run_at = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [name, report_type, schedule_type, schedule_time || '08:00', day_of_week, day_of_month, recipients || [], JSON.stringify(filters || []), nextRun, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ütemezett riport nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Scheduled report update error:', error);
    res.status(500).json({ success: false, message: 'Ütemezett riport módosítási hiba' });
  }
};

/**
 * DELETE /:id — delete a scheduled report (CASCADE removes runs)
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM scheduled_reports WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ütemezett riport nem található' });
    }

    res.json({ success: true, message: 'Ütemezett riport törölve' });
  } catch (error) {
    logger.error('Scheduled report delete error:', error);
    res.status(500).json({ success: false, message: 'Ütemezett riport törlési hiba' });
  }
};

/**
 * POST /:id/run — manually trigger a report run
 */
const triggerRun = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`SELECT * FROM scheduled_reports WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ütemezett riport nem található' });
    }

    // Run in background
    executeReport(result.rows[0]).catch(err => {
      logger.error('Manual report trigger failed:', err);
    });

    res.json({ success: true, message: 'Riport futtatás elindítva' });
  } catch (error) {
    logger.error('Scheduled report trigger error:', error);
    res.status(500).json({ success: false, message: 'Riport futtatási hiba' });
  }
};

/**
 * GET /:id/runs — run history for a scheduled report
 */
const getRunHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM scheduled_report_runs
       WHERE scheduled_report_id = $1
       ORDER BY started_at DESC
       LIMIT 50`,
      [id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Scheduled report runs error:', error);
    res.status(500).json({ success: false, message: 'Futtatási előzmények lekérési hiba' });
  }
};

/**
 * PATCH /:id/toggle — toggle active/inactive
 */
const toggleActive = async (req, res) => {
  try {
    const { id } = req.params;

    // Get current state
    const current = await query(`SELECT * FROM scheduled_reports WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ütemezett riport nem található' });
    }

    const report = current.rows[0];
    const newActive = !report.is_active;

    let nextRun = null;
    if (newActive) {
      nextRun = calculateNextRun(report.schedule_type, report.schedule_time, report.day_of_week, report.day_of_month);
    }

    const result = await query(
      `UPDATE scheduled_reports SET is_active = $1, next_run_at = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [newActive, nextRun, id]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Scheduled report toggle error:', error);
    res.status(500).json({ success: false, message: 'Státusz váltási hiba' });
  }
};

module.exports = {
  getAll,
  create,
  update,
  remove,
  triggerRun,
  getRunHistory,
  toggleActive,
};
