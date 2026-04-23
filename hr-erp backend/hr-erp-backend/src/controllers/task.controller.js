const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { logActivity, diffObjects } = require('../utils/activityLogger');
const autoAssignService = require('../services/autoAssign.service');
const inApp = require('../services/inAppNotification.service');
const path = require('path');
const fs = require('fs');

/**
 * GET /api/v1/projects/:projectId/tasks
 * Projekt feladatainak listája
 */
const getAll = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, priority, assigned_to, search, parent_task_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['t.project_id = $1'];
    let params = [projectId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      whereConditions.push(`t.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (priority && priority !== 'all') {
      whereConditions.push(`t.priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    if (assigned_to) {
      whereConditions.push(`t.assigned_to = $${paramIndex}`);
      params.push(assigned_to);
      paramIndex++;
    }

    if (parent_task_id === 'null') {
      whereConditions.push('t.parent_task_id IS NULL');
    } else if (parent_task_id) {
      whereConditions.push(`t.parent_task_id = $${paramIndex}`);
      params.push(parent_task_id);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM tasks t ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT t.*,
        u_assigned.first_name as assigned_first_name, u_assigned.last_name as assigned_last_name, u_assigned.email as assigned_email,
        u_creator.first_name as creator_first_name, u_creator.last_name as creator_last_name,
        cont.name as contractor_name,
        (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id) as subtask_count,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) as comment_count,
        (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) as attachment_count,
        ARRAY(
          SELECT td.depends_on_task_id FROM task_dependencies td WHERE td.task_id = t.id
        ) as dependencies
       FROM tasks t
       LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
       LEFT JOIN users u_creator ON t.created_by = u_creator.id
       LEFT JOIN contractors cont ON t.contractor_id = cont.id
       ${whereClause}
       ORDER BY
        CASE t.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.due_date NULLS LAST,
        t.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        tasks: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Feladatok lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Feladatok lekérdezési hiba'
    });
  }
};

/**
 * GET /api/v1/tasks/:id
 * Egyedi feladat részletekkel
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT t.*,
        u_assigned.first_name as assigned_first_name, u_assigned.last_name as assigned_last_name, u_assigned.email as assigned_email,
        u_creator.first_name as creator_first_name, u_creator.last_name as creator_last_name,
        p.name as project_name, p.code as project_code,
        cont.name as contractor_name,
        re.first_name as related_employee_first_name,
        re.last_name  as related_employee_last_name,
        re.workplace  as related_employee_workplace
       FROM tasks t
       LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
       LEFT JOIN users u_creator ON t.created_by = u_creator.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN contractors cont ON t.contractor_id = cont.id
       LEFT JOIN employees re ON t.related_employee_id = re.id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feladat nem található'
      });
    }

    const task = result.rows[0];

    // Get subtasks
    const subtasks = await query(
      `SELECT t.id, t.title, t.status, t.priority, t.progress, t.due_date, t.assigned_to,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.parent_task_id = $1
       ORDER BY t.created_at`,
      [id]
    );

    // Get comments
    const comments = await query(
      `SELECT tc.*, u.first_name, u.last_name, u.email
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.task_id = $1
       ORDER BY tc.created_at DESC`,
      [id]
    );

    // Get attachments
    const attachments = await query(
      `SELECT ta.*, u.first_name as uploader_first_name, u.last_name as uploader_last_name
       FROM task_attachments ta
       LEFT JOIN users u ON ta.uploaded_by = u.id
       WHERE ta.task_id = $1
       ORDER BY ta.uploaded_at DESC`,
      [id]
    );

    // Get dependencies
    const dependencies = await query(
      `SELECT td.*, t.title as depends_on_title, t.status as depends_on_status
       FROM task_dependencies td
       JOIN tasks t ON td.depends_on_task_id = t.id
       WHERE td.task_id = $1`,
      [id]
    );

    // Get time logs
    const timeLogs = await query(
      `SELECT ts.*, u.first_name, u.last_name
       FROM timesheets ts
       JOIN users u ON ts.user_id = u.id
       WHERE ts.task_id = $1
       ORDER BY ts.work_date DESC`,
      [id]
    );

    task.subtasks = subtasks.rows;
    task.comments = comments.rows;
    task.attachments = attachments.rows;
    task.dependencies = dependencies.rows;
    task.time_logs = timeLogs.rows;

    res.json({
      success: true,
      data: { task }
    });
  } catch (error) {
    logger.error('Feladat lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Feladat lekérdezési hiba'
    });
  }
};

/**
 * POST /api/v1/projects/:projectId/tasks
 * Új feladat létrehozása
 */
const create = async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      title, description, status, priority, assigned_to,
      start_date, due_date, estimated_hours, tags,
      parent_task_id, contractor_id
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Feladat cím megadása kötelező'
      });
    }

    // Verify project exists
    const project = await query('SELECT id, contractor_id FROM projects WHERE id = $1', [projectId]);
    if (project.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projekt nem található'
      });
    }

    // Verify parent task if provided
    if (parent_task_id) {
      const parentTask = await query(
        'SELECT id FROM tasks WHERE id = $1 AND project_id = $2',
        [parent_task_id, projectId]
      );
      if (parentTask.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Szülő feladat nem található ebben a projektben'
        });
      }
    }

    const effectiveContractorId = contractor_id || project.rows[0].contractor_id;

    const result = await query(
      `INSERT INTO tasks (project_id, parent_task_id, title, description, status, priority, assigned_to, start_date, due_date, estimated_hours, tags, contractor_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [projectId, parent_task_id || null, title, description || null,
       status || 'todo', priority || 'medium', assigned_to || null,
       start_date || null, due_date || null, estimated_hours || null,
       tags || null, effectiveContractorId, req.user.id]
    );

    await logActivity({
      userId: req.user.id,
      entityType: 'task',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: { title, project_id: projectId }
    });

    // Auto-assign if no assignee was specified
    let taskData = result.rows[0];
    if (!assigned_to) {
      const autoAssigned = await autoAssignService.assignTask(result.rows[0].id);
      if (autoAssigned) {
        taskData = autoAssigned;
      }
    }

    res.status(201).json({
      success: true,
      message: 'Feladat létrehozva',
      data: { task: taskData }
    });
  } catch (error) {
    logger.error('Feladat létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Feladat létrehozási hiba'
    });
  }
};

/**
 * PUT /api/v1/tasks/:id
 * Feladat szerkesztése
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, status, priority, assigned_to,
      start_date, due_date, estimated_hours, actual_hours, progress, tags,
      parent_task_id, contractor_id
    } = req.body;

    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feladat nem található'
      });
    }

    const completed_at = status === 'done' && current.rows[0].status !== 'done'
      ? 'NOW()'
      : (status && status !== 'done' ? 'NULL' : 'completed_at');

    const result = await query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        assigned_to = $5,
        start_date = COALESCE($6, start_date),
        due_date = COALESCE($7, due_date),
        estimated_hours = COALESCE($8, estimated_hours),
        actual_hours = COALESCE($9, actual_hours),
        progress = COALESCE($10, progress),
        tags = COALESCE($11, tags),
        parent_task_id = $12,
        contractor_id = COALESCE($13, contractor_id),
        completed_at = ${status === 'done' && current.rows[0].status !== 'done' ? 'NOW()' : status && status !== 'done' ? 'NULL' : 'completed_at'}
       WHERE id = $14
       RETURNING *`,
      [title, description, status, priority,
       assigned_to !== undefined ? assigned_to : current.rows[0].assigned_to,
       start_date, due_date, estimated_hours, actual_hours, progress, tags,
       parent_task_id !== undefined ? parent_task_id : current.rows[0].parent_task_id,
       contractor_id, id]
    );

    const changes = diffObjects(current.rows[0], result.rows[0], [
      'title', 'description', 'status', 'priority', 'assigned_to',
      'start_date', 'due_date', 'estimated_hours', 'actual_hours', 'progress'
    ]);

    if (changes) {
      await logActivity({
        userId: req.user.id,
        entityType: 'task',
        entityId: id,
        action: 'update',
        changes
      });
    }

    res.json({
      success: true,
      message: 'Feladat frissítve',
      data: { task: result.rows[0] }
    });
  } catch (error) {
    logger.error('Feladat frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Feladat frissítési hiba'
    });
  }
};

/**
 * DELETE /api/v1/tasks/:id
 * Feladat törlése
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feladat nem található'
      });
    }

    // Check for subtasks
    const subtasks = await query('SELECT COUNT(*) as count FROM tasks WHERE parent_task_id = $1', [id]);
    if (parseInt(subtasks.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Feladat nem törölhető, amíg alfeladatai vannak'
      });
    }

    await query('DELETE FROM tasks WHERE id = $1', [id]);

    await logActivity({
      userId: req.user.id,
      entityType: 'task',
      entityId: id,
      action: 'delete',
      metadata: { title: current.rows[0].title, project_id: current.rows[0].project_id }
    });

    res.json({
      success: true,
      message: 'Feladat törölve'
    });
  } catch (error) {
    logger.error('Feladat törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Feladat törlési hiba'
    });
  }
};

/**
 * PUT /api/v1/tasks/:id/status
 * Feladat státusz módosítása
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['todo', 'in_progress', 'review', 'done', 'blocked'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen státusz. Lehetséges értékek: ${validStatuses.join(', ')}`
      });
    }

    const current = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feladat nem található'
      });
    }

    // Check if blocked by incomplete dependencies
    if (status === 'in_progress') {
      const blockingDeps = await query(
        `SELECT t.id, t.title, t.status
         FROM task_dependencies td
         JOIN tasks t ON td.depends_on_task_id = t.id
         WHERE td.task_id = $1 AND t.status != 'done'`,
        [id]
      );
      if (blockingDeps.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Feladat nem indítható, amíg a függőségek nem készültek el',
          data: { blocking_tasks: blockingDeps.rows }
        });
      }
    }

    const progress = status === 'done' ? 100 : (status === 'todo' ? 0 : current.rows[0].progress);

    const result = await query(
      `UPDATE tasks SET status = $1::varchar, progress = $2,
              completed_at = CASE WHEN $1::varchar = 'done' THEN NOW() ELSE NULL END
         WHERE id = $3
         RETURNING *`,
      [status, progress, id]
    );

    // Update project completion percentage
    await updateProjectCompletion(current.rows[0].project_id);

    await logActivity({
      userId: req.user.id,
      entityType: 'task',
      entityId: id,
      action: 'status_change',
      changes: { status: { old: current.rows[0].status, new: status } }
    });

    res.json({
      success: true,
      message: 'Feladat státusz frissítve',
      data: { task: result.rows[0] }
    });
  } catch (error) {
    logger.error('Feladat státusz frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Feladat státusz frissítési hiba'
    });
  }
};

/**
 * POST /api/v1/tasks/:id/comments
 * Hozzászólás hozzáadása
 */
const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Hozzászólás szövege kötelező'
      });
    }

    const task = await query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (task.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feladat nem található'
      });
    }

    const result = await query(
      `INSERT INTO task_comments (task_id, user_id, comment)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, req.user.id, comment.trim()]
    );

    // Get user info for response
    const commentWithUser = await query(
      `SELECT tc.*, u.first_name, u.last_name, u.email
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json({
      success: true,
      message: 'Hozzászólás hozzáadva',
      data: { comment: commentWithUser.rows[0] }
    });
  } catch (error) {
    logger.error('Hozzászólás hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hozzászólás hozzáadási hiba'
    });
  }
};

/**
 * POST /api/v1/tasks/:id/attachments
 * Melléklet feltöltése
 */
const addAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Fájl feltöltése szükséges'
      });
    }

    const task = await query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (task.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feladat nem található'
      });
    }

    const result = await query(
      `INSERT INTO task_attachments (task_id, file_name, file_path, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, req.file.originalname, req.file.path, req.file.size, req.user.id]
    );

    res.status(201).json({
      success: true,
      message: 'Melléklet feltöltve',
      data: { attachment: result.rows[0] }
    });
  } catch (error) {
    logger.error('Melléklet feltöltési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Melléklet feltöltési hiba'
    });
  }
};

/**
 * GET /api/v1/tasks/:id/subtasks
 * Alfeladatok lekérdezése
 */
const getSubtasks = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT t.*,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.parent_task_id = $1
       ORDER BY t.created_at`,
      [id]
    );

    res.json({
      success: true,
      data: { subtasks: result.rows }
    });
  } catch (error) {
    logger.error('Alfeladatok lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Alfeladatok lekérdezési hiba'
    });
  }
};

/**
 * POST /api/v1/tasks/:id/dependencies
 * Függőség hozzáadása
 */
const addDependency = async (req, res) => {
  try {
    const { id } = req.params;
    const { depends_on_task_id, dependency_type } = req.body;

    if (!depends_on_task_id) {
      return res.status(400).json({
        success: false,
        message: 'Függő feladat megadása kötelező'
      });
    }

    if (id === depends_on_task_id) {
      return res.status(400).json({
        success: false,
        message: 'Feladat nem függhet önmagától'
      });
    }

    // Verify both tasks exist
    const task = await query('SELECT id, project_id FROM tasks WHERE id = $1', [id]);
    const dependsOn = await query('SELECT id, project_id FROM tasks WHERE id = $1', [depends_on_task_id]);

    if (task.rows.length === 0 || dependsOn.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feladat nem található'
      });
    }

    // Check for circular dependency (simple check)
    const reverseCheck = await query(
      'SELECT id FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2',
      [depends_on_task_id, id]
    );
    if (reverseCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Körkörös függőség nem engedélyezett'
      });
    }

    const result = await query(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (task_id, depends_on_task_id) DO NOTHING
       RETURNING *`,
      [id, depends_on_task_id, dependency_type || 'finish_to_start']
    );

    res.status(201).json({
      success: true,
      message: 'Függőség hozzáadva',
      data: { dependency: result.rows[0] }
    });
  } catch (error) {
    logger.error('Függőség hozzáadási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Függőség hozzáadási hiba'
    });
  }
};

/**
 * GET /api/v1/tasks/my
 * Az aktuális felhasználóhoz rendelt feladatok az összes projektből
 */
const getMyTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, priority, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['t.assigned_to = $1'];
    let params = [userId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      whereConditions.push(`t.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (priority && priority !== 'all') {
      whereConditions.push(`t.priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM tasks t ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT t.*,
        p.name as project_name, p.code as project_code,
        u_creator.first_name as creator_first_name, u_creator.last_name as creator_last_name,
        (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_task_id = t.id) as subtask_count,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) as comment_count
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u_creator ON t.created_by = u_creator.id
       ${whereClause}
       ORDER BY
        CASE t.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.due_date NULLS LAST,
        t.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        tasks: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Saját feladatok lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Saját feladatok lekérdezési hiba'
    });
  }
};

/**
 * Helper: Update project completion percentage based on task statuses
 */
async function updateProjectCompletion(projectId) {
  try {
    const result = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'done') as done
       FROM tasks
       WHERE project_id = $1`,
      [projectId]
    );

    const { total, done } = result.rows[0];
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

    await query(
      'UPDATE projects SET completion_percentage = $1 WHERE id = $2',
      [percentage, projectId]
    );
  } catch (error) {
    logger.error('Projekt completion frissítési hiba:', error);
  }
}

/**
 * GET /api/v1/tasks/my/stats
 * Saját feladatok és hibajegyek statisztikái
 */
const getMyTasksStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE type = 'ticket') as tickets,
        COUNT(*) FILTER (WHERE type = 'task') as tasks,
        COUNT(*) FILTER (WHERE priority IN ('urgent', 'critical')) as urgent,
        COUNT(*) FILTER (WHERE due_date < NOW()) as overdue,
        COUNT(*) FILTER (WHERE status IN ('new', 'todo')) as new
      FROM (
        SELECT 'ticket' as type, p.slug as priority, NULL as due_date, ts.slug as status
        FROM tickets t
        JOIN ticket_statuses ts ON t.status_id = ts.id
        LEFT JOIN priorities p ON t.priority_id = p.id
        WHERE t.assigned_to = $1 AND ts.slug NOT IN ('closed', 'resolved', 'completed')

        UNION ALL

        SELECT 'task' as type, priority, due_date, status
        FROM tasks
        WHERE assigned_to = $1 AND status NOT IN ('done', 'cancelled')
      ) combined
    `, [userId]);

    const stats = result.rows[0];
    res.json({
      success: true,
      data: {
        total: parseInt(stats.total),
        tickets: parseInt(stats.tickets),
        tasks: parseInt(stats.tasks),
        urgent: parseInt(stats.urgent),
        overdue: parseInt(stats.overdue),
        new: parseInt(stats.new),
      }
    });
  } catch (error) {
    logger.error('Saját feladatok statisztika hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Saját feladatok statisztika hiba'
    });
  }
};

/**
 * POST /api/v1/tasks
 * Project-less task creation (e.g. from the employee timeline).
 * tasks.project_id is nullable; contractor_id defaults to the caller's.
 * Also writes an in-app notification to the assignee.
 */
const createStandalone = async (req, res) => {
  try {
    const {
      title, description, priority, assigned_to,
      start_date, due_date, estimated_hours, tags,
      contractor_id, related_employee_id,
    } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Feladat cím megadása kötelező' });
    }

    const effectiveContractorId = contractor_id || req.user?.contractorId || null;

    const result = await query(
      `INSERT INTO tasks
         (project_id, parent_task_id, title, description, status, priority,
          assigned_to, start_date, due_date, estimated_hours, tags,
          contractor_id, created_by, related_employee_id)
       VALUES (NULL, NULL, $1, $2, 'todo', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        title.trim(), description || null, priority || 'medium',
        assigned_to || null, start_date || null, due_date || null,
        estimated_hours || null, tags || null,
        effectiveContractorId, req.user.id, related_employee_id || null,
      ]
    );
    const task = result.rows[0];

    await logActivity({
      userId: req.user.id,
      entityType: 'task',
      entityId: task.id,
      action: 'create',
      metadata: { title: task.title, source: 'standalone', related_employee_id: related_employee_id || null },
    });

    // Notify the assignee (best-effort — failures don't fail the request).
    if (task.assigned_to && task.assigned_to !== req.user.id) {
      await inApp.notify({
        userId: task.assigned_to,
        contractorId: effectiveContractorId,
        type: 'task_assigned',
        title: 'Új feladatot kaptál',
        message: task.title,
        link: `/tasks/${task.id}`,
        data: { task_id: task.id, due_date: task.due_date, priority: task.priority },
      });
    }

    res.status(201).json({ success: true, message: 'Feladat létrehozva', data: { task } });
  } catch (error) {
    logger.error('Standalone feladat létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Feladat létrehozási hiba' });
  }
};

/**
 * GET /api/v1/admin/tasks/all
 * Superadmin-only cross-cutting task view with filters and a stats block.
 * Query: status, priority, assigned_to, created_by, category, overdue=true,
 *        due_from, due_to, search, page, limit, sort_by, sort_dir
 */
const getAllTasksAdmin = async (req, res) => {
  try {
    if (!req.user.roles.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Csak superadmin számára elérhető' });
    }

    const {
      status, priority, assigned_to, created_by, category,
      overdue, due_from, due_to, search,
      page = 1, limit = 50,
      sort_by = 'created_at', sort_dir = 'desc',
    } = req.query;

    const where = [];
    const params = [];
    let i = 1;

    if (status && status !== 'all') { where.push(`t.status = $${i++}`); params.push(status); }
    if (priority && priority !== 'all') { where.push(`t.priority = $${i++}`); params.push(priority); }
    if (assigned_to && assigned_to !== 'all') { where.push(`t.assigned_to = $${i++}`); params.push(assigned_to); }
    if (created_by && created_by !== 'all') { where.push(`t.created_by = $${i++}`); params.push(created_by); }
    if (category && category !== 'all') { where.push(`$${i++} = ANY(t.tags)`); params.push(category); }
    if (overdue === 'true') { where.push(`t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE AND t.status <> 'done'`); }
    if (due_from) { where.push(`t.due_date >= $${i++}`); params.push(due_from); }
    if (due_to)   { where.push(`t.due_date <= $${i++}`); params.push(due_to); }
    if (search) {
      where.push(`(t.title ILIKE $${i} OR t.description ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const safeSortCols = new Set(['created_at', 'due_date', 'priority', 'status', 'title']);
    const sortCol = safeSortCols.has(sort_by) ? sort_by : 'created_at';
    const sortDir = String(sort_dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // Totals + stats (independent of pagination)
    const statsSql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'todo')::int        AS count_todo,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS count_in_progress,
        COUNT(*) FILTER (WHERE status = 'review')::int      AS count_review,
        COUNT(*) FILTER (WHERE status = 'done')::int        AS count_done,
        COUNT(*) FILTER (WHERE status = 'blocked')::int     AS count_blocked,
        COUNT(*) FILTER (
          WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE AND status <> 'done'
        )::int AS count_overdue
      FROM tasks t
      ${whereSql}
    `;
    const statsResult = await query(statsSql, params);

    const rowsSql = `
      SELECT
        t.*,
        ua.first_name  AS assignee_first_name,
        ua.last_name   AS assignee_last_name,
        uc.first_name  AS creator_first_name,
        uc.last_name   AS creator_last_name,
        p.name         AS project_name,
        e.first_name   AS related_employee_first_name,
        e.last_name    AS related_employee_last_name
      FROM tasks t
      LEFT JOIN users ua ON t.assigned_to = ua.id
      LEFT JOIN users uc ON t.created_by  = uc.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN employees e ON t.related_employee_id = e.id
      ${whereSql}
      ORDER BY t.${sortCol} ${sortDir} NULLS LAST
      LIMIT $${i++} OFFSET $${i++}
    `;
    const rowsResult = await query(rowsSql, [...params, parseInt(limit, 10), offset]);

    res.json({
      success: true,
      data: {
        tasks: rowsResult.rows,
        stats: statsResult.rows[0],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: statsResult.rows[0].total,
        },
      },
    });
  } catch (error) {
    logger.error('Admin összes feladat lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Admin feladat lista hiba' });
  }
};

module.exports = {
  getAll,
  getById,
  getMyTasks,
  getMyTasksStats,
  getAllTasksAdmin,
  create,
  createStandalone,
  update,
  remove,
  updateStatus,
  addComment,
  addAttachment,
  getSubtasks,
  addDependency
};
