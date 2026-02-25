const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { logActivity, diffObjects } = require('../utils/activityLogger');

/**
 * GET /api/v1/projects
 * Lista összes projekt - szűrésekkel és lapozással
 */
const getAll = async (req, res) => {
  try {
    const { search, status, priority, cost_center_id, contractor_id, project_manager_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Contractor isolation (non-superadmin)
    if (!req.user.roles.includes('superadmin') && req.user.contractorId) {
      whereConditions.push(`p.contractor_id = $${paramIndex}`);
      params.push(req.user.contractorId);
      paramIndex++;
    } else if (contractor_id) {
      whereConditions.push(`p.contractor_id = $${paramIndex}`);
      params.push(contractor_id);
      paramIndex++;
    }

    if (status && status !== 'all') {
      whereConditions.push(`p.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (priority && priority !== 'all') {
      whereConditions.push(`p.priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    if (cost_center_id) {
      whereConditions.push(`p.cost_center_id = $${paramIndex}`);
      params.push(cost_center_id);
      paramIndex++;
    }

    if (project_manager_id) {
      whereConditions.push(`p.project_manager_id = $${paramIndex}`);
      params.push(project_manager_id);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(
        `(p.name ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM projects p ${whereClause}`,
      params
    );

    // Main query
    const result = await query(
      `SELECT p.*,
        u_pm.first_name as pm_first_name, u_pm.last_name as pm_last_name, u_pm.email as pm_email,
        cc.name as cost_center_name,
        c.name as contractor_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as completed_task_count,
        (SELECT COUNT(*) FROM project_team_members ptm WHERE ptm.project_id = p.id) as team_member_count
       FROM projects p
       LEFT JOIN users u_pm ON p.project_manager_id = u_pm.id
       LEFT JOIN cost_centers cc ON p.cost_center_id = cc.id
       LEFT JOIN contractors c ON p.contractor_id = c.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        projects: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Projektek lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Projektek lekérdezési hiba'
    });
  }
};

/**
 * GET /api/v1/projects/:id
 * Egyedi projekt részletekkel
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT p.*,
        u_pm.first_name as pm_first_name, u_pm.last_name as pm_last_name, u_pm.email as pm_email,
        u_cr.first_name as creator_first_name, u_cr.last_name as creator_last_name,
        cc.name as cost_center_name, cc.code as cost_center_code,
        c.name as contractor_name
       FROM projects p
       LEFT JOIN users u_pm ON p.project_manager_id = u_pm.id
       LEFT JOIN users u_cr ON p.created_by = u_cr.id
       LEFT JOIN cost_centers cc ON p.cost_center_id = cc.id
       LEFT JOIN contractors c ON p.contractor_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projekt nem található'
      });
    }

    const project = result.rows[0];

    // Team members
    const teamResult = await query(
      `SELECT ptm.*, u.first_name, u.last_name, u.email
       FROM project_team_members ptm
       JOIN users u ON ptm.user_id = u.id
       WHERE ptm.project_id = $1
       ORDER BY ptm.assigned_at`,
      [id]
    );

    // Task summary
    const taskSummary = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'todo') as todo,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'review') as review,
        COUNT(*) FILTER (WHERE status = 'done') as done,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
        COALESCE(SUM(estimated_hours), 0) as total_estimated_hours,
        COALESCE(SUM(actual_hours), 0) as total_actual_hours
       FROM tasks
       WHERE project_id = $1`,
      [id]
    );

    project.team_members = teamResult.rows;
    project.task_summary = taskSummary.rows[0];

    res.json({
      success: true,
      data: { project }
    });
  } catch (error) {
    logger.error('Projekt lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Projekt lekérdezési hiba'
    });
  }
};

/**
 * POST /api/v1/projects
 * Új projekt létrehozása
 */
const create = async (req, res) => {
  try {
    const {
      name, code, description, start_date, end_date, status, priority,
      budget, cost_center_id, project_manager_id, contractor_id
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Projekt név megadása kötelező'
      });
    }

    // Check unique code if provided
    if (code) {
      const existing = await query('SELECT id FROM projects WHERE code = $1', [code]);
      if (existing.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ez a projektkód már létezik'
        });
      }
    }

    const effectiveContractorId = contractor_id || req.user.contractorId;

    const result = await query(
      `INSERT INTO projects (name, code, description, start_date, end_date, status, priority, budget, cost_center_id, project_manager_id, contractor_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [name, code || null, description || null, start_date || null, end_date || null,
       status || 'planning', priority || 'medium', budget || null,
       cost_center_id || null, project_manager_id || null, effectiveContractorId, req.user.id]
    );

    const project = result.rows[0];

    // Auto-add project manager as team member
    if (project_manager_id) {
      await query(
        `INSERT INTO project_team_members (project_id, user_id, role)
         VALUES ($1, $2, 'project_manager')
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [project.id, project_manager_id]
      );
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'project',
      entityId: project.id,
      action: 'create',
      metadata: { name: project.name, code: project.code }
    });

    res.status(201).json({
      success: true,
      message: 'Projekt létrehozva',
      data: { project }
    });
  } catch (error) {
    logger.error('Projekt létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Projekt létrehozási hiba'
    });
  }
};

/**
 * PUT /api/v1/projects/:id
 * Projekt szerkesztése
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, code, description, start_date, end_date, status, priority,
      budget, actual_cost, completion_percentage, cost_center_id, project_manager_id
    } = req.body;

    const current = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projekt nem található'
      });
    }

    // Check unique code if changed
    if (code && code !== current.rows[0].code) {
      const existing = await query('SELECT id FROM projects WHERE code = $1 AND id != $2', [code, id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ez a projektkód már létezik'
        });
      }
    }

    const result = await query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        description = COALESCE($3, description),
        start_date = COALESCE($4, start_date),
        end_date = COALESCE($5, end_date),
        status = COALESCE($6, status),
        priority = COALESCE($7, priority),
        budget = COALESCE($8, budget),
        actual_cost = COALESCE($9, actual_cost),
        completion_percentage = COALESCE($10, completion_percentage),
        cost_center_id = COALESCE($11, cost_center_id),
        project_manager_id = COALESCE($12, project_manager_id)
       WHERE id = $13
       RETURNING *`,
      [name, code, description, start_date, end_date, status, priority,
       budget, actual_cost, completion_percentage, cost_center_id, project_manager_id, id]
    );

    const changes = diffObjects(current.rows[0], result.rows[0], [
      'name', 'code', 'description', 'start_date', 'end_date', 'status',
      'priority', 'budget', 'actual_cost', 'completion_percentage', 'cost_center_id', 'project_manager_id'
    ]);

    if (changes) {
      await logActivity({
        userId: req.user.id,
        entityType: 'project',
        entityId: id,
        action: 'update',
        changes
      });
    }

    res.json({
      success: true,
      message: 'Projekt frissítve',
      data: { project: result.rows[0] }
    });
  } catch (error) {
    logger.error('Projekt frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Projekt frissítési hiba'
    });
  }
};

/**
 * DELETE /api/v1/projects/:id
 * Projekt törlése (status = cancelled)
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projekt nem található'
      });
    }

    await query(
      `UPDATE projects SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await logActivity({
      userId: req.user.id,
      entityType: 'project',
      entityId: id,
      action: 'delete',
      metadata: { name: current.rows[0].name }
    });

    res.json({
      success: true,
      message: 'Projekt törölve (archiválva)'
    });
  } catch (error) {
    logger.error('Projekt törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Projekt törlési hiba'
    });
  }
};

/**
 * GET /api/v1/projects/dashboard
 * Áttekintő statisztikák
 */
const getDashboard = async (req, res) => {
  try {
    let contractorFilter = '';
    let params = [];

    if (!req.user.roles.includes('superadmin') && req.user.contractorId) {
      contractorFilter = 'WHERE p.contractor_id = $1';
      params = [req.user.contractorId];
    }

    // Project status summary
    const statusSummary = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE p.status = 'planning') as planning,
        COUNT(*) FILTER (WHERE p.status = 'active') as active,
        COUNT(*) FILTER (WHERE p.status = 'on_hold') as on_hold,
        COUNT(*) FILTER (WHERE p.status = 'completed') as completed,
        COUNT(*) FILTER (WHERE p.status = 'cancelled') as cancelled,
        COALESCE(SUM(p.budget), 0) as total_budget,
        COALESCE(SUM(p.actual_cost), 0) as total_actual_cost
       FROM projects p
       ${contractorFilter}`,
      params
    );

    // Task status summary (across all projects)
    const taskSummary = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'todo') as todo,
        COUNT(*) FILTER (WHERE t.status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE t.status = 'review') as review,
        COUNT(*) FILTER (WHERE t.status = 'done') as done,
        COUNT(*) FILTER (WHERE t.status = 'blocked') as blocked
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       ${contractorFilter}`,
      params
    );

    // Overdue tasks
    const overdueTasks = await query(
      `SELECT t.id, t.title, t.due_date, t.status, t.priority,
        p.name as project_name, p.id as project_id,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       ${contractorFilter ? contractorFilter + ' AND' : 'WHERE'} t.due_date < CURRENT_DATE AND t.status NOT IN ('done', 'blocked')
       ORDER BY t.due_date ASC
       LIMIT 10`,
      params
    );

    // Recent projects
    const recentProjects = await query(
      `SELECT p.id, p.name, p.code, p.status, p.priority, p.completion_percentage,
        p.start_date, p.end_date,
        u.first_name as pm_first_name, u.last_name as pm_last_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count
       FROM projects p
       LEFT JOIN users u ON p.project_manager_id = u.id
       ${contractorFilter}
       ORDER BY p.updated_at DESC
       LIMIT 5`,
      params
    );

    // Upcoming deadlines
    const upcomingDeadlines = await query(
      `SELECT t.id, t.title, t.due_date, t.status, t.priority,
        p.name as project_name, p.id as project_id,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       ${contractorFilter ? contractorFilter + ' AND' : 'WHERE'} t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND t.status NOT IN ('done')
       ORDER BY t.due_date ASC
       LIMIT 10`,
      params
    );

    res.json({
      success: true,
      data: {
        projects: statusSummary.rows[0],
        tasks: taskSummary.rows[0],
        overdue_tasks: overdueTasks.rows,
        recent_projects: recentProjects.rows,
        upcoming_deadlines: upcomingDeadlines.rows
      }
    });
  } catch (error) {
    logger.error('Projekt dashboard hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Projekt dashboard hiba'
    });
  }
};

/**
 * GET /api/v1/projects/:id/timeline
 * Gantt chart adat
 */
const getTimeline = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (project.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projekt nem található'
      });
    }

    // Tasks with dependencies
    const tasks = await query(
      `SELECT t.*,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name,
        ARRAY(
          SELECT td.depends_on_task_id
          FROM task_dependencies td
          WHERE td.task_id = t.id
        ) as dependencies
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.project_id = $1
       ORDER BY t.start_date NULLS LAST, t.created_at`,
      [id]
    );

    res.json({
      success: true,
      data: {
        project: project.rows[0],
        tasks: tasks.rows
      }
    });
  } catch (error) {
    logger.error('Projekt timeline hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Projekt timeline hiba'
    });
  }
};

/**
 * GET /api/v1/projects/:id/budget-summary
 * Költségvetés összesítő
 */
const getBudgetSummary = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await query(
      `SELECT id, name, code, budget, actual_cost FROM projects WHERE id = $1`,
      [id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projekt nem található'
      });
    }

    // Hours summary
    const hoursSummary = await query(
      `SELECT
        COALESCE(SUM(ts.hours), 0) as total_logged_hours,
        COUNT(DISTINCT ts.user_id) as contributors,
        COUNT(DISTINCT ts.work_date) as work_days
       FROM timesheets ts
       JOIN tasks t ON ts.task_id = t.id
       WHERE t.project_id = $1`,
      [id]
    );

    // Hours by user
    const hoursByUser = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email,
        COALESCE(SUM(ts.hours), 0) as total_hours
       FROM timesheets ts
       JOIN tasks t ON ts.task_id = t.id
       JOIN users u ON ts.user_id = u.id
       WHERE t.project_id = $1
       GROUP BY u.id, u.first_name, u.last_name, u.email
       ORDER BY total_hours DESC`,
      [id]
    );

    // Hours by month
    const hoursByMonth = await query(
      `SELECT
        TO_CHAR(ts.work_date, 'YYYY-MM') as month,
        COALESCE(SUM(ts.hours), 0) as total_hours
       FROM timesheets ts
       JOIN tasks t ON ts.task_id = t.id
       WHERE t.project_id = $1
       GROUP BY TO_CHAR(ts.work_date, 'YYYY-MM')
       ORDER BY month`,
      [id]
    );

    // Task estimates vs actuals
    const taskEstimates = await query(
      `SELECT
        COALESCE(SUM(estimated_hours), 0) as total_estimated,
        COALESCE(SUM(actual_hours), 0) as total_actual
       FROM tasks
       WHERE project_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        project: project.rows[0],
        hours: hoursSummary.rows[0],
        hours_by_user: hoursByUser.rows,
        hours_by_month: hoursByMonth.rows,
        estimates: taskEstimates.rows[0]
      }
    });
  } catch (error) {
    logger.error('Projekt budget összesítő hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Projekt budget összesítő hiba'
    });
  }
};

/**
 * POST /api/v1/projects/:id/team
 * Csapattag hozzárendelése
 */
const assignTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, role } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'Felhasználó megadása kötelező'
      });
    }

    const project = await query('SELECT id, name FROM projects WHERE id = $1', [id]);
    if (project.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projekt nem található'
      });
    }

    const result = await query(
      `INSERT INTO project_team_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
       RETURNING *`,
      [id, user_id, role || 'member']
    );

    // Get user info
    const user = await query(
      'SELECT id, first_name, last_name, email FROM users WHERE id = $1',
      [user_id]
    );

    await logActivity({
      userId: req.user.id,
      entityType: 'project',
      entityId: id,
      action: 'team_assign',
      metadata: {
        assigned_user_id: user_id,
        role: role || 'member',
        user_name: user.rows.length > 0 ? `${user.rows[0].last_name} ${user.rows[0].first_name}` : null
      }
    });

    res.status(201).json({
      success: true,
      message: 'Csapattag hozzárendelve',
      data: {
        team_member: {
          ...result.rows[0],
          first_name: user.rows[0]?.first_name,
          last_name: user.rows[0]?.last_name,
          email: user.rows[0]?.email
        }
      }
    });
  } catch (error) {
    logger.error('Csapattag hozzárendelési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Csapattag hozzárendelési hiba'
    });
  }
};

/**
 * DELETE /api/v1/projects/:id/team/:userId
 * Csapattag eltávolítása
 */
const removeTeamMember = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const result = await query(
      'DELETE FROM project_team_members WHERE project_id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Csapattag nem található a projektben'
      });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'project',
      entityId: id,
      action: 'team_remove',
      metadata: { removed_user_id: userId }
    });

    res.json({
      success: true,
      message: 'Csapattag eltávolítva'
    });
  } catch (error) {
    logger.error('Csapattag eltávolítási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Csapattag eltávolítási hiba'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  getDashboard,
  getTimeline,
  getBudgetSummary,
  assignTeamMember,
  removeTeamMember
};
