const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * GET /api/v1/user-workload
 * Felhasználók munkaterhelése
 */
const getAll = async (req, res) => {
  try {
    let whereConditions = ['u.is_active = TRUE'];
    let params = [];
    let paramIndex = 1;

    // Contractor szűrés
    if (!req.user.roles.includes('superadmin')) {
      whereConditions.push(`u.contractor_id = $${paramIndex}`);
      params.push(req.user.contractorId);
      paramIndex++;
    }

    const result = await query(`
      SELECT
        u.id as user_id,
        u.first_name || ' ' || u.last_name as user_name,
        u.email,
        COALESCE(uw.active_tickets, 0) as active_tickets,
        COALESCE(uw.active_tasks, 0) as active_tasks,
        COALESCE(uw.total_pending_items, 0) as total_pending_items,
        uw.last_assignment_at,
        uw.updated_at,
        ARRAY(
          SELECT us.skill || ' (' || us.proficiency || ')'
          FROM user_skills us
          WHERE us.user_id = u.id
          ORDER BY us.proficiency DESC
        ) as skills
      FROM users u
      LEFT JOIN user_workload uw ON u.id = uw.user_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY COALESCE(uw.total_pending_items, 0) DESC
    `, params);

    res.json({
      success: true,
      data: { workloads: result.rows }
    });

  } catch (error) {
    logger.error('Munkaterhelés lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkaterhelés lekérdezési hiba'
    });
  }
};

/**
 * GET /api/v1/user-workload/:userId
 * Egy felhasználó munkaterhelése részletesen
 */
const getByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    const workload = await query(`
      SELECT
        u.id as user_id,
        u.first_name || ' ' || u.last_name as user_name,
        u.email,
        COALESCE(uw.active_tickets, 0) as active_tickets,
        COALESCE(uw.active_tasks, 0) as active_tasks,
        COALESCE(uw.total_pending_items, 0) as total_pending_items,
        uw.last_assignment_at
      FROM users u
      LEFT JOIN user_workload uw ON u.id = uw.user_id
      WHERE u.id = $1
    `, [userId]);

    if (workload.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Felhasználó nem található'
      });
    }

    // Get skills
    const skills = await query(`
      SELECT skill, proficiency, created_at
      FROM user_skills
      WHERE user_id = $1
      ORDER BY proficiency DESC
    `, [userId]);

    // Get recent assignments
    const recentTickets = await query(`
      SELECT id, ticket_number, title, created_at
      FROM tickets
      WHERE assigned_to = $1
        AND status_id NOT IN (SELECT id FROM ticket_statuses WHERE slug IN ('closed', 'resolved'))
      ORDER BY created_at DESC
      LIMIT 5
    `, [userId]);

    const recentTasks = await query(`
      SELECT t.id, t.title, t.status, t.priority, t.created_at, p.name as project_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.assigned_to = $1 AND t.status NOT IN ('done', 'cancelled')
      ORDER BY t.created_at DESC
      LIMIT 5
    `, [userId]);

    res.json({
      success: true,
      data: {
        workload: workload.rows[0],
        skills: skills.rows,
        recent_tickets: recentTickets.rows,
        recent_tasks: recentTasks.rows
      }
    });

  } catch (error) {
    logger.error('Felhasználó munkaterhelés lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Felhasználó munkaterhelés lekérdezési hiba'
    });
  }
};

/**
 * POST /api/v1/user-workload/recalculate
 * Munkaterhelés újraszámítása (admin műveletteh)
 */
const recalculate = async (req, res) => {
  try {
    // Recalculate all ticket workloads
    await query(`
      UPDATE user_workload uw
      SET
        active_tickets = COALESCE((
          SELECT COUNT(*)
          FROM tickets t
          WHERE t.assigned_to = uw.user_id
            AND t.status_id NOT IN (SELECT id FROM ticket_statuses WHERE slug IN ('closed', 'resolved'))
        ), 0),
        active_tasks = COALESCE((
          SELECT COUNT(*)
          FROM tasks t
          WHERE t.assigned_to = uw.user_id
            AND t.status NOT IN ('done', 'cancelled')
        ), 0),
        updated_at = NOW()
    `);

    // Recalculate totals
    await query(`
      UPDATE user_workload
      SET total_pending_items = active_tickets + active_tasks
    `);

    // Initialize any missing users
    await query(`
      INSERT INTO user_workload (user_id)
      SELECT id FROM users WHERE is_active = TRUE
      ON CONFLICT (user_id) DO NOTHING
    `);

    logger.info('Munkaterhelés újraszámítva', { userId: req.user.id });

    res.json({
      success: true,
      message: 'Munkaterhelés sikeresen újraszámítva'
    });

  } catch (error) {
    logger.error('Munkaterhelés újraszámítási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Munkaterhelés újraszámítási hiba'
    });
  }
};

/**
 * GET /api/v1/user-skills
 * Felhasználói képességek listázása
 */
const getSkills = async (req, res) => {
  try {
    const { userId } = req.query;

    let whereClause = '';
    let params = [];

    if (userId) {
      whereClause = 'WHERE us.user_id = $1';
      params = [userId];
    }

    const result = await query(`
      SELECT us.*,
        u.first_name || ' ' || u.last_name as user_name,
        u.email
      FROM user_skills us
      JOIN users u ON us.user_id = u.id
      ${whereClause}
      ORDER BY u.last_name, us.proficiency DESC
    `, params);

    res.json({
      success: true,
      data: { skills: result.rows }
    });

  } catch (error) {
    logger.error('Képességek lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Képességek lekérdezési hiba'
    });
  }
};

/**
 * POST /api/v1/user-skills
 * Képesség hozzáadása felhasználóhoz
 */
const addSkill = async (req, res) => {
  try {
    const { user_id, skill, proficiency } = req.body;

    if (!user_id || !skill) {
      return res.status(400).json({
        success: false,
        message: 'Felhasználó ID és képesség megadása kötelező'
      });
    }

    if (proficiency && (proficiency < 1 || proficiency > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Jártasság 1-5 között kell legyen'
      });
    }

    const result = await query(`
      INSERT INTO user_skills (user_id, skill, proficiency)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, skill) DO UPDATE SET proficiency = $3
      RETURNING *
    `, [user_id, skill.toLowerCase().trim(), proficiency || 1]);

    res.status(201).json({
      success: true,
      message: 'Képesség hozzáadva',
      data: { skill: result.rows[0] }
    });

  } catch (error) {
    logger.error('Képesség hozzáadási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Képesség hozzáadási hiba'
    });
  }
};

/**
 * DELETE /api/v1/user-skills/:id
 * Képesség törlése
 */
const removeSkill = async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM user_skills WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Képesség nem található'
      });
    }

    await query('DELETE FROM user_skills WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Képesség törölve'
    });

  } catch (error) {
    logger.error('Képesség törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Képesség törlési hiba'
    });
  }
};

module.exports = {
  getAll,
  getByUserId,
  recalculate,
  getSkills,
  addSkill,
  removeSkill
};
