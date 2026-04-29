/**
 * task_assignees CRUD + per-assignee status transitions (migration 107).
 *
 *   GET    /api/v1/tasks/:taskId/assignees
 *   POST   /api/v1/tasks/:taskId/assignees           body { user_id, role? }
 *   DELETE /api/v1/tasks/:taskId/assignees/:userId
 *   PATCH  /api/v1/tasks/:taskId/assignees/:userId/visit
 *   PATCH  /api/v1/tasks/:taskId/assignees/:userId/complete   body { notes? }
 *
 * The main responsible (tasks.assigned_to) is NOT stored as a row here —
 * it has its own column. task_assignees holds ADDITIONAL helpers only.
 *
 * After any state change we evaluate whether the whole task can be marked
 * completed: when every helper is done AND the main assignee has nothing
 * else to do, tasks.completion_status flips to 'completed'.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const inApp = require('../services/inAppNotification.service');

// ── List ───────────────────────────────────────────────────────────────
const list = async (req, res) => {
  try {
    const { taskId } = req.params;
    const r = await query(
      `SELECT ta.id, ta.task_id, ta.user_id, ta.role, ta.status,
              ta.visited_at, ta.completed_at, ta.completion_notes,
              ta.notified_at, ta.created_at,
              u.first_name, u.last_name, u.email
         FROM task_assignees ta
         JOIN users u ON u.id = ta.user_id
        WHERE ta.task_id = $1
        ORDER BY ta.created_at ASC`,
      [taskId]
    );
    res.json({ success: true, data: { assignees: r.rows } });
  } catch (err) {
    logger.error('[taskAssignees.list]', err.message);
    res.status(500).json({ success: false, message: 'Lekérdezési hiba' });
  }
};

// ── Add a helper ──────────────────────────────────────────────────────
const add = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { user_id, role } = req.body || {};
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id kötelező' });

    // Ensure the task exists; needed for the notification fanout below.
    const t = await query(`SELECT id, title, assigned_to, contractor_id, deadline, due_date, priority FROM tasks WHERE id = $1`, [taskId]);
    if (t.rowCount === 0) return res.status(404).json({ success: false, message: 'Feladat nem található' });
    const task = t.rows[0];
    if (user_id === task.assigned_to) {
      return res.status(400).json({ success: false, message: 'A főfelelős már a feladaton van' });
    }

    const r = await query(
      `INSERT INTO task_assignees (task_id, user_id, role, notified_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (task_id, user_id)
         DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [taskId, user_id, role || 'helper']
    );

    // Notify the new helper. Skip if they're the actor.
    if (user_id !== req.user.id) {
      inApp.notify({
        userId: user_id,
        contractorId: task.contractor_id,
        type: 'task_assigned',
        title: 'Új feladatot kaptál',
        message: task.title,
        link: `/tasks/${taskId}`,
        data: { task_id: taskId, deadline: task.deadline, due_date: task.due_date, priority: task.priority },
      }).catch(e => logger.warn('[taskAssignees.add.notify]', e.message));
    }

    res.status(201).json({ success: true, data: { assignee: r.rows[0] } });
  } catch (err) {
    logger.error('[taskAssignees.add]', err.message);
    res.status(500).json({ success: false, message: 'Hozzáadási hiba' });
  }
};

// ── Remove ────────────────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const { taskId, userId } = req.params;
    const r = await query(
      `DELETE FROM task_assignees WHERE task_id = $1 AND user_id = $2 RETURNING id`,
      [taskId, userId]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Hozzárendelés nem található' });
    res.json({ success: true });
  } catch (err) {
    logger.error('[taskAssignees.remove]', err.message);
    res.status(500).json({ success: false, message: 'Törlési hiba' });
  }
};

// ── Auth helper for visit/complete actions ────────────────────────────
// The actor can act on an assignee row if they are:
//   - the assignee themselves
//   - an admin / superadmin
//   - the task's creator (created_by)
//   - the task's main responsible (assigned_to / Felelős)
function _isAdmin(req) { return (req.user.roles || []).some(r => r === 'admin' || r === 'superadmin'); }

async function _canActOnAssignee(req, taskId, targetUserId) {
  if (req.user.id === targetUserId) return true;
  if (_isAdmin(req)) return true;
  const r = await query(
    `SELECT created_by, assigned_to FROM tasks WHERE id = $1`,
    [taskId]
  );
  const t = r.rows[0];
  if (!t) return false;
  return t.created_by === req.user.id || t.assigned_to === req.user.id;
}

const markVisited = async (req, res) => {
  try {
    const { taskId, userId } = req.params;
    if (!(await _canActOnAssignee(req, taskId, userId))) {
      return res.status(403).json({ success: false, message: 'Csak a hozzárendelt, admin, főfelelős vagy létrehozó végezhet ilyen módosítást' });
    }
    const r = await query(
      `UPDATE task_assignees
          SET status = CASE WHEN status = 'completed' THEN status ELSE 'visited' END,
              visited_at = COALESCE(visited_at, NOW())
        WHERE task_id = $1 AND user_id = $2
        RETURNING *`,
      [taskId, userId]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Hozzárendelés nem található' });
    await _maybeCompleteTask(taskId);
    res.json({ success: true, data: { assignee: r.rows[0] } });
  } catch (err) {
    logger.error('[taskAssignees.markVisited]', err.message);
    res.status(500).json({ success: false, message: 'Módosítási hiba' });
  }
};

// ── Mark completed ────────────────────────────────────────────────────
const markCompleted = async (req, res) => {
  try {
    const { taskId, userId } = req.params;
    const { notes } = req.body || {};
    if (!(await _canActOnAssignee(req, taskId, userId))) {
      return res.status(403).json({ success: false, message: 'Csak a hozzárendelt, admin, főfelelős vagy létrehozó végezhet ilyen módosítást' });
    }
    const r = await query(
      `UPDATE task_assignees
          SET status = 'completed',
              completed_at = NOW(),
              visited_at = COALESCE(visited_at, NOW()),
              completion_notes = $3
        WHERE task_id = $1 AND user_id = $2
        RETURNING *`,
      [taskId, userId, notes || null]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Hozzárendelés nem található' });

    // Notify the task creator that this helper finished.
    try {
      const t = await query(`SELECT title, created_by, contractor_id FROM tasks WHERE id = $1`, [taskId]);
      const tk = t.rows[0];
      if (tk?.created_by && tk.created_by !== userId) {
        await inApp.notify({
          userId: tk.created_by,
          contractorId: tk.contractor_id,
          type: 'task_helper_completed',
          title: 'Segítő befejezte a feladatot',
          message: tk.title,
          link: `/tasks/${taskId}`,
          data: { task_id: taskId, helper_id: userId },
        });
      }
    } catch (err) {
      logger.warn('[taskAssignees.markCompleted.notify]', err.message);
    }

    await _maybeCompleteTask(taskId);
    res.json({ success: true, data: { assignee: r.rows[0] } });
  } catch (err) {
    logger.error('[taskAssignees.markCompleted]', err.message);
    res.status(500).json({ success: false, message: 'Befejezési hiba' });
  }
};

// ── Aggregate: when ALL helpers are done, flip task.completion_status ──
// Conservative — we only auto-complete when the task has at least one
// helper and every one of them is 'completed'. Tasks without helpers are
// driven by the existing tasks.status flow and aren't touched here.
async function _maybeCompleteTask(taskId) {
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'completed')::int AS done
         FROM task_assignees
        WHERE task_id = $1`,
      [taskId]
    );
    const { total, done } = r.rows[0];
    if (total > 0 && total === done) {
      await query(
        `UPDATE tasks
            SET completion_status = 'completed',
                completed_at = COALESCE(completed_at, NOW()),
                updated_at = NOW()
          WHERE id = $1 AND completion_status <> 'completed'`,
        [taskId]
      );
    } else if (total > 0 && done > 0) {
      await query(
        `UPDATE tasks
            SET completion_status = 'in_progress',
                updated_at = NOW()
          WHERE id = $1 AND completion_status = 'pending'`,
        [taskId]
      );
    }
  } catch (err) {
    logger.warn('[_maybeCompleteTask]', err.message);
  }
}

module.exports = { list, add, remove, markVisited, markCompleted };
