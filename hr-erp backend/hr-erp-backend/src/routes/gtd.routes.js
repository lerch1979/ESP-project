const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

router.use(authenticateToken);

// ─── INBOX ──────────────────────────────────────────────────────────

// GET /inbox - unprocessed items
router.get('/inbox', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM gtd_inbox
       WHERE user_id = $1 AND processed = false
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: { items: result.rows, count: result.rows.length } });
  } catch (error) {
    logger.error('GTD inbox fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inbox' });
  }
});

// POST /inbox - quick capture
router.post('/inbox', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content required' });
    }
    const result = await query(
      `INSERT INTO gtd_inbox (user_id, content) VALUES ($1, $2) RETURNING *`,
      [req.user.id, content.trim()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD inbox capture error:', error);
    res.status(500).json({ success: false, message: 'Failed to capture' });
  }
});

// PATCH /inbox/:id - mark processed
router.patch('/inbox/:id', async (req, res) => {
  try {
    const result = await query(
      `UPDATE gtd_inbox SET processed = true
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD inbox process error:', error);
    res.status(500).json({ success: false, message: 'Failed to process' });
  }
});

// POST /inbox/:id/convert - convert inbox item to ticket or task
router.post('/inbox/:id/convert', async (req, res) => {
  try {
    const { type } = req.body; // 'task' or 'ticket'
    const inbox = await query(
      `SELECT * FROM gtd_inbox WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (inbox.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    if (type === 'task') {
      const task = await query(
        `INSERT INTO gtd_tasks (user_id, title) VALUES ($1, $2) RETURNING *`,
        [req.user.id, inbox.rows[0].content]
      );
      await query(
        `UPDATE gtd_inbox SET processed = true WHERE id = $1`,
        [req.params.id]
      );
      return res.json({ success: true, data: { type: 'task', item: task.rows[0] } });
    }

    // For ticket conversion, just mark processed — ticket creation uses existing ticket API
    await query(
      `UPDATE gtd_inbox SET processed = true WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true, data: { type: 'processed', content: inbox.rows[0].content } });
  } catch (error) {
    logger.error('GTD inbox convert error:', error);
    res.status(500).json({ success: false, message: 'Failed to convert' });
  }
});

// DELETE /inbox/:id
router.delete('/inbox/:id', async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM gtd_inbox WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('GTD inbox delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete' });
  }
});

// ─── TASKS (personal) ──────────────────────────────────────────────

// GET /tasks - smart filtering
router.get('/tasks', async (req, res) => {
  try {
    const { status = 'next_action', context, energy_level, time_max, project_id } = req.query;

    let sql = `
      SELECT t.*, p.name AS project_title
      FROM gtd_tasks t
      LEFT JOIN projects p ON p.id = t.related_project_id
      WHERE t.user_id = $1 AND t.status = $2`;
    const params = [req.user.id, status];

    if (context) {
      params.push(context);
      sql += ` AND t.context = $${params.length}`;
    }
    if (energy_level) {
      params.push(energy_level);
      sql += ` AND t.energy_level = $${params.length}`;
    }
    if (time_max) {
      params.push(parseInt(time_max));
      sql += ` AND t.time_estimate <= $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      sql += ` AND t.related_project_id = $${params.length}`;
    }

    sql += ` ORDER BY
      CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      t.due_date NULLS LAST,
      t.sort_order,
      t.created_at`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('GTD tasks fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
  }
});

// POST /tasks
router.post('/tasks', async (req, res) => {
  try {
    const { title, description, context, energy_level, time_estimate, priority, status, due_date, scheduled_date, waiting_for, related_project_id, related_ticket_id, tags } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title required' });
    }
    const result = await query(
      `INSERT INTO gtd_tasks (user_id, title, description, context, energy_level, time_estimate, priority, status, due_date, scheduled_date, waiting_for, related_project_id, related_ticket_id, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [req.user.id, title.trim(), description, context, energy_level, time_estimate, priority || 'normal', status || 'next_action', due_date, scheduled_date, waiting_for, related_project_id, related_ticket_id, tags]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD task create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create task' });
  }
});

// PATCH /tasks/:id
router.patch('/tasks/:id', async (req, res) => {
  try {
    const allowed = ['title', 'description', 'context', 'energy_level', 'time_estimate', 'priority', 'status', 'due_date', 'scheduled_date', 'waiting_for', 'related_project_id', 'related_ticket_id', 'tags', 'sort_order'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.status === 'completed') updates.completed_at = new Date().toISOString();
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`);
    const values = Object.values(updates);

    const result = await query(
      `UPDATE gtd_tasks SET ${setClauses.join(', ')}
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, ...values]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD task update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update task' });
  }
});

// DELETE /tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM gtd_tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('GTD task delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete task' });
  }
});

// ─── TICKET GTD FIELDS ─────────────────────────────────────────────

// PATCH /tickets/:id/gtd - update GTD metadata on a ticket
router.patch('/tickets/:id/gtd', async (req, res) => {
  try {
    const { gtd_context, gtd_energy_level, gtd_time_estimate, gtd_waiting_for, gtd_is_actionable } = req.body;

    const result = await query(
      `UPDATE tickets SET
        gtd_context = COALESCE($2, gtd_context),
        gtd_energy_level = COALESCE($3, gtd_energy_level),
        gtd_time_estimate = COALESCE($4, gtd_time_estimate),
        gtd_waiting_for = $5,
        gtd_is_actionable = COALESCE($6, gtd_is_actionable)
       WHERE id = $1 RETURNING id, gtd_context, gtd_energy_level, gtd_time_estimate, gtd_waiting_for, gtd_is_actionable`,
      [req.params.id, gtd_context, gtd_energy_level, gtd_time_estimate, gtd_waiting_for, gtd_is_actionable]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD ticket update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update ticket GTD fields' });
  }
});

// GET /next-actions - unified view across tickets + personal tasks
router.get('/next-actions', async (req, res) => {
  try {
    const { context, energy_level, time_max } = req.query;

    // Personal tasks
    let taskSql = `
      SELECT 'task' as source, t.id, t.title, t.context, t.energy_level, t.time_estimate,
             t.priority, t.due_date, t.created_at, p.name as project_title
      FROM gtd_tasks t
      LEFT JOIN projects p ON p.id = t.related_project_id
      WHERE t.user_id = $1 AND t.status = 'next_action'`;
    const taskParams = [req.user.id];

    if (context) { taskParams.push(context); taskSql += ` AND t.context = $${taskParams.length}`; }
    if (energy_level) { taskParams.push(energy_level); taskSql += ` AND t.energy_level = $${taskParams.length}`; }
    if (time_max) { taskParams.push(parseInt(time_max)); taskSql += ` AND t.time_estimate <= $${taskParams.length}`; }

    // Assigned tickets
    let ticketSql = `
      SELECT 'ticket' as source, t.id, t.title, t.gtd_context as context,
             t.gtd_energy_level as energy_level, t.gtd_time_estimate as time_estimate,
             'normal' as priority, NULL::date as due_date, t.created_at, NULL as project_title
      FROM tickets t
      WHERE t.assigned_to = $1 AND t.status IN ('open', 'in_progress')
        AND t.gtd_is_actionable = true AND t.gtd_waiting_for IS NULL`;
    const ticketParams = [req.user.id];

    if (context) { ticketParams.push(context); ticketSql += ` AND t.gtd_context = $${ticketParams.length}`; }
    if (energy_level) { ticketParams.push(energy_level); ticketSql += ` AND t.gtd_energy_level = $${ticketParams.length}`; }
    if (time_max) { ticketParams.push(parseInt(time_max)); ticketSql += ` AND t.gtd_time_estimate <= $${ticketParams.length}`; }

    const [tasksRes, ticketsRes] = await Promise.all([
      query(taskSql, taskParams),
      query(ticketSql, ticketParams),
    ]);

    const all = [...tasksRes.rows, ...ticketsRes.rows].sort((a, b) => {
      const pOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2);
    });

    res.json({ success: true, data: all });
  } catch (error) {
    logger.error('GTD next-actions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch next actions' });
  }
});

// ─── PROJECTS GTD FIELDS ───────────────────────────────────────────

// GET /projects - projects with GTD status
router.get('/projects', async (req, res) => {
  try {
    const { status = 'active' } = req.query;
    const result = await query(
      `SELECT p.id, p.name, p.description, p.status, p.gtd_outcome, p.gtd_status,
              p.gtd_last_reviewed_at, p.completion_percentage,
              COUNT(t.id) FILTER (WHERE t.status IN ('open', 'in_progress')) AS active_tickets,
              COUNT(t.id) AS total_tickets
       FROM projects p
       LEFT JOIN tickets t ON t.project_id = p.id
       WHERE p.gtd_status = $1
         AND (p.contractor_id = $2 OR $2 IS NULL)
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
      [status, req.user.contractorId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('GTD projects fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch projects' });
  }
});

// PATCH /projects/:id/gtd - update GTD metadata on a project
router.patch('/projects/:id/gtd', async (req, res) => {
  try {
    const { gtd_outcome, gtd_status, gtd_last_reviewed_at } = req.body;
    const result = await query(
      `UPDATE projects SET
        gtd_outcome = COALESCE($2, gtd_outcome),
        gtd_status = COALESCE($3, gtd_status),
        gtd_last_reviewed_at = COALESCE($4, gtd_last_reviewed_at),
        updated_at = NOW()
       WHERE id = $1 RETURNING id, name, gtd_outcome, gtd_status, gtd_last_reviewed_at`,
      [req.params.id, gtd_outcome, gtd_status, gtd_last_reviewed_at]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD project update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update project GTD fields' });
  }
});

// ─── CONTEXTS ───────────────────────────────────────────────────────

router.get('/contexts', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM gtd_contexts
       WHERE user_id = $1 OR is_system = true
       ORDER BY is_system DESC, name`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('GTD contexts fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contexts' });
  }
});

router.post('/contexts', async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name required' });
    }
    const result = await query(
      `INSERT INTO gtd_contexts (user_id, name, icon, color) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, name.trim(), icon, color]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD context create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create context' });
  }
});

// PATCH /contexts/:id — edit name/icon/color. System contexts and other
// users' contexts are read-only (except superadmin).
router.patch('/contexts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const current = await query(`SELECT user_id, is_system FROM gtd_contexts WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Context not found' });
    }
    const row = current.rows[0];
    const isAdmin = req.user.roles.includes('superadmin');
    if (row.is_system && !isAdmin) {
      return res.status(403).json({ success: false, message: 'System context is read-only' });
    }
    if (row.user_id && row.user_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not your context' });
    }
    const allowed = ['name', 'icon', 'color'];
    const fields = [];
    const values = [];
    let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        fields.push(`${k} = $${i++}`);
        values.push(k === 'name' ? String(req.body[k]).trim() : (req.body[k] || null));
      }
    }
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    values.push(id);
    const result = await query(
      `UPDATE gtd_contexts SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD context update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update context' });
  }
});

// DELETE /contexts/:id — user-owned contexts only. System contexts cannot
// be deleted. FK on tasks.gtd_context_id is ON DELETE SET NULL.
router.delete('/contexts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const current = await query(`SELECT user_id, is_system FROM gtd_contexts WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Context not found' });
    }
    if (current.rows[0].is_system) {
      return res.status(403).json({ success: false, message: 'System context cannot be deleted' });
    }
    if (current.rows[0].user_id !== req.user.id && !req.user.roles.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Not your context' });
    }
    await query(`DELETE FROM gtd_contexts WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('GTD context delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete context' });
  }
});

// ─── WEEKLY REVIEW ──────────────────────────────────────────────────

// GET /review/current - get or create this week's review
router.get('/review/current', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let result = await query(
      `SELECT * FROM gtd_weekly_reviews
       WHERE user_id = $1 AND review_date = $2`,
      [req.user.id, today]
    );
    if (result.rows.length === 0) {
      result = await query(
        `INSERT INTO gtd_weekly_reviews (user_id, review_date) VALUES ($1, $2) RETURNING *`,
        [req.user.id, today]
      );
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD review fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch review' });
  }
});

// PATCH /review/:id
router.patch('/review/:id', async (req, res) => {
  try {
    const allowed = ['inbox_cleared', 'tickets_reviewed', 'projects_reviewed', 'tasks_completed', 'notes', 'completed_at'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`);
    const values = Object.values(updates);

    const result = await query(
      `UPDATE gtd_weekly_reviews SET ${setClauses.join(', ')}
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, ...values]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('GTD review update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update review' });
  }
});

// ─── DASHBOARD STATS ────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const [inbox, nextActions, waiting, overdue] = await Promise.all([
      query(`SELECT COUNT(*) FROM gtd_inbox WHERE user_id = $1 AND processed = false`, [req.user.id]),
      query(`SELECT COUNT(*) FROM gtd_tasks WHERE user_id = $1 AND status = 'next_action'`, [req.user.id]),
      query(`SELECT COUNT(*) FROM gtd_tasks WHERE user_id = $1 AND status = 'waiting_for'`, [req.user.id]),
      query(`SELECT COUNT(*) FROM gtd_tasks WHERE user_id = $1 AND status = 'next_action' AND due_date < CURRENT_DATE`, [req.user.id]),
    ]);

    res.json({
      success: true,
      data: {
        inbox_count: parseInt(inbox.rows[0].count),
        next_actions_count: parseInt(nextActions.rows[0].count),
        waiting_count: parseInt(waiting.rows[0].count),
        overdue_count: parseInt(overdue.rows[0].count),
      },
    });
  } catch (error) {
    logger.error('GTD stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

module.exports = router;
