const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

/**
 * POST /api/v1/timesheets
 * Munkaidő rögzítése
 */
const logHours = async (req, res) => {
  try {
    const { task_id, user_id, hours, work_date, description } = req.body;

    if (!task_id || !hours || !work_date) {
      return res.status(400).json({
        success: false,
        message: 'Feladat, óraszám és dátum megadása kötelező'
      });
    }

    if (hours <= 0 || hours > 24) {
      return res.status(400).json({
        success: false,
        message: 'Óraszám 0 és 24 között kell legyen'
      });
    }

    // Verify task exists
    const task = await query('SELECT id, project_id, title FROM tasks WHERE id = $1', [task_id]);
    if (task.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feladat nem található'
      });
    }

    const effectiveUserId = user_id || req.user.id;

    // If logging for another user, check permission
    if (effectiveUserId !== req.user.id) {
      if (!req.user.roles.includes('superadmin') && !req.user.permissions.includes('timesheets.view_all')) {
        return res.status(403).json({
          success: false,
          message: 'Nincs jogosultságod más felhasználó nevében munkaidőt rögzíteni'
        });
      }
    }

    const result = await query(
      `INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [task_id, effectiveUserId, hours, work_date, description || null]
    );

    // Update task actual hours
    await query(
      `UPDATE tasks SET actual_hours = (
        SELECT COALESCE(SUM(hours), 0) FROM timesheets WHERE task_id = $1
       ) WHERE id = $1`,
      [task_id]
    );

    await logActivity({
      userId: req.user.id,
      entityType: 'timesheet',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: {
        task_id,
        task_title: task.rows[0].title,
        hours,
        work_date,
        logged_for: effectiveUserId
      }
    });

    res.status(201).json({
      success: true,
      message: 'Munkaidő rögzítve',
      data: { timesheet: result.rows[0] }
    });
  } catch (error) {
    logger.error('Munkaidő rögzítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkaidő rögzítési hiba'
    });
  }
};

/**
 * GET /api/v1/timesheets/task/:taskId
 * Feladathoz tartozó munkaidő bejegyzések
 */
const getByTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await query(
      `SELECT ts.*, u.first_name, u.last_name, u.email
       FROM timesheets ts
       JOIN users u ON ts.user_id = u.id
       WHERE ts.task_id = $1
       ORDER BY ts.work_date DESC`,
      [taskId]
    );

    const totalResult = await query(
      'SELECT COALESCE(SUM(hours), 0) as total_hours FROM timesheets WHERE task_id = $1',
      [taskId]
    );

    res.json({
      success: true,
      data: {
        timesheets: result.rows,
        total_hours: parseFloat(totalResult.rows[0].total_hours)
      }
    });
  } catch (error) {
    logger.error('Munkaidő lekérdezési hiba (task):', error);
    res.status(500).json({
      success: false,
      message: 'Munkaidő lekérdezési hiba'
    });
  }
};

/**
 * GET /api/v1/timesheets/user/:userId
 * Felhasználóhoz tartozó munkaidő bejegyzések
 */
const getByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { start_date, end_date, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Permission check: own data or view_all
    if (userId !== req.user.id && !req.user.roles.includes('superadmin') && !req.user.permissions.includes('timesheets.view_all')) {
      return res.status(403).json({
        success: false,
        message: 'Nincs jogosultságod más felhasználó munkaidő adataihoz'
      });
    }

    let whereConditions = ['ts.user_id = $1'];
    let params = [userId];
    let paramIndex = 2;

    if (start_date) {
      whereConditions.push(`ts.work_date >= $${paramIndex}`);
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereConditions.push(`ts.work_date <= $${paramIndex}`);
      params.push(end_date);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM timesheets ts ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT ts.*, t.title as task_title, t.project_id,
        p.name as project_name, p.code as project_code
       FROM timesheets ts
       JOIN tasks t ON ts.task_id = t.id
       JOIN projects p ON t.project_id = p.id
       ${whereClause}
       ORDER BY ts.work_date DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const totalResult = await query(
      `SELECT COALESCE(SUM(ts.hours), 0) as total_hours FROM timesheets ts ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        timesheets: result.rows,
        total_hours: parseFloat(totalResult.rows[0].total_hours),
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Munkaidő lekérdezési hiba (user):', error);
    res.status(500).json({
      success: false,
      message: 'Munkaidő lekérdezési hiba'
    });
  }
};

/**
 * GET /api/v1/timesheets/project/:projectId
 * Projekthez tartozó munkaidő bejegyzések
 */
const getByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { start_date, end_date, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['t.project_id = $1'];
    let params = [projectId];
    let paramIndex = 2;

    if (start_date) {
      whereConditions.push(`ts.work_date >= $${paramIndex}`);
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereConditions.push(`ts.work_date <= $${paramIndex}`);
      params.push(end_date);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM timesheets ts JOIN tasks t ON ts.task_id = t.id ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT ts.*, t.title as task_title,
        u.first_name, u.last_name, u.email
       FROM timesheets ts
       JOIN tasks t ON ts.task_id = t.id
       JOIN users u ON ts.user_id = u.id
       ${whereClause}
       ORDER BY ts.work_date DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Summary by user
    const userSummary = await query(
      `SELECT u.id, u.first_name, u.last_name,
        COALESCE(SUM(ts.hours), 0) as total_hours,
        COUNT(*) as entry_count
       FROM timesheets ts
       JOIN tasks t ON ts.task_id = t.id
       JOIN users u ON ts.user_id = u.id
       ${whereClause}
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY total_hours DESC`,
      params
    );

    const totalResult = await query(
      `SELECT COALESCE(SUM(ts.hours), 0) as total_hours FROM timesheets ts JOIN tasks t ON ts.task_id = t.id ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        timesheets: result.rows,
        total_hours: parseFloat(totalResult.rows[0].total_hours),
        user_summary: userSummary.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Munkaidő lekérdezési hiba (project):', error);
    res.status(500).json({
      success: false,
      message: 'Munkaidő lekérdezési hiba'
    });
  }
};

module.exports = {
  logHours,
  getByTask,
  getByUser,
  getByProject
};
