const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

/**
 * GET /api/v1/assignment-rules
 * Kiosztási szabályok listázása
 */
const getAll = async (req, res) => {
  try {
    const { type, is_active } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Contractor szűrés
    if (!req.user.roles.includes('superadmin')) {
      whereConditions.push(`(ar.contractor_id = $${paramIndex} OR ar.contractor_id IS NULL)`);
      params.push(req.user.contractorId);
      paramIndex++;
    }

    if (type) {
      whereConditions.push(`ar.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (is_active !== undefined) {
      whereConditions.push(`ar.is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query(`
      SELECT ar.*,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        target_user.first_name || ' ' || target_user.last_name as assign_to_user_name,
        c.name as contractor_name
      FROM assignment_rules ar
      LEFT JOIN users creator ON ar.created_by = creator.id
      LEFT JOIN users target_user ON ar.assign_to_user_id = target_user.id
      LEFT JOIN contractors c ON ar.contractor_id = c.id
      ${whereClause}
      ORDER BY ar.priority DESC, ar.created_at DESC
    `, params);

    res.json({
      success: true,
      data: { rules: result.rows }
    });

  } catch (error) {
    logger.error('Kiosztási szabályok lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Kiosztási szabályok lekérdezési hiba'
    });
  }
};

/**
 * GET /api/v1/assignment-rules/:id
 * Egy kiosztási szabály részletei
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT ar.*,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        target_user.first_name || ' ' || target_user.last_name as assign_to_user_name,
        c.name as contractor_name
      FROM assignment_rules ar
      LEFT JOIN users creator ON ar.created_by = creator.id
      LEFT JOIN users target_user ON ar.assign_to_user_id = target_user.id
      LEFT JOIN contractors c ON ar.contractor_id = c.id
      WHERE ar.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kiosztási szabály nem található'
      });
    }

    res.json({
      success: true,
      data: { rule: result.rows[0] }
    });

  } catch (error) {
    logger.error('Kiosztási szabály lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Kiosztási szabály lekérdezési hiba'
    });
  }
};

/**
 * POST /api/v1/assignment-rules
 * Új kiosztási szabály létrehozása
 */
const create = async (req, res) => {
  try {
    const { name, type, conditions, assign_to_role, assign_to_user_id, assign_strategy, priority, is_active } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Név és típus megadása kötelező'
      });
    }

    if (!['ticket', 'task'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Típus csak "ticket" vagy "task" lehet'
      });
    }

    const validStrategies = ['round_robin', 'least_busy', 'skill_match', 'random'];
    if (assign_strategy && !validStrategies.includes(assign_strategy)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen stratégia. Lehetséges értékek: ${validStrategies.join(', ')}`
      });
    }

    const result = await query(`
      INSERT INTO assignment_rules (name, type, conditions, assign_to_role, assign_to_user_id, assign_strategy, priority, is_active, contractor_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      name,
      type,
      JSON.stringify(conditions || {}),
      assign_to_role || null,
      assign_to_user_id || null,
      assign_strategy || 'round_robin',
      priority || 0,
      is_active !== false,
      req.user.contractorId,
      req.user.id
    ]);

    await logActivity({
      userId: req.user.id,
      entityType: 'assignment_rule',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: { name, type, assign_strategy }
    });

    logger.info('Kiosztási szabály létrehozva', {
      ruleId: result.rows[0].id,
      name,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Kiosztási szabály sikeresen létrehozva',
      data: { rule: result.rows[0] }
    });

  } catch (error) {
    logger.error('Kiosztási szabály létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Kiosztási szabály létrehozási hiba'
    });
  }
};

/**
 * PUT /api/v1/assignment-rules/:id
 * Kiosztási szabály módosítása
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, conditions, assign_to_role, assign_to_user_id, assign_strategy, priority, is_active } = req.body;

    const current = await query('SELECT * FROM assignment_rules WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kiosztási szabály nem található'
      });
    }

    if (type && !['ticket', 'task'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Típus csak "ticket" vagy "task" lehet'
      });
    }

    const validStrategies = ['round_robin', 'least_busy', 'skill_match', 'random'];
    if (assign_strategy && !validStrategies.includes(assign_strategy)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen stratégia. Lehetséges értékek: ${validStrategies.join(', ')}`
      });
    }

    const result = await query(`
      UPDATE assignment_rules SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        conditions = COALESCE($3, conditions),
        assign_to_role = $4,
        assign_to_user_id = $5,
        assign_strategy = COALESCE($6, assign_strategy),
        priority = COALESCE($7, priority),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [
      name,
      type,
      conditions ? JSON.stringify(conditions) : null,
      assign_to_role !== undefined ? assign_to_role : current.rows[0].assign_to_role,
      assign_to_user_id !== undefined ? assign_to_user_id : current.rows[0].assign_to_user_id,
      assign_strategy,
      priority,
      is_active,
      id
    ]);

    await logActivity({
      userId: req.user.id,
      entityType: 'assignment_rule',
      entityId: id,
      action: 'update',
      metadata: { name: result.rows[0].name }
    });

    res.json({
      success: true,
      message: 'Kiosztási szabály frissítve',
      data: { rule: result.rows[0] }
    });

  } catch (error) {
    logger.error('Kiosztási szabály frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Kiosztási szabály frissítési hiba'
    });
  }
};

/**
 * DELETE /api/v1/assignment-rules/:id
 * Kiosztási szabály törlése
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM assignment_rules WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kiosztási szabály nem található'
      });
    }

    await query('DELETE FROM assignment_rules WHERE id = $1', [id]);

    await logActivity({
      userId: req.user.id,
      entityType: 'assignment_rule',
      entityId: id,
      action: 'delete',
      metadata: { name: current.rows[0].name }
    });

    logger.info('Kiosztási szabály törölve', {
      ruleId: id,
      name: current.rows[0].name,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Kiosztási szabály törölve'
    });

  } catch (error) {
    logger.error('Kiosztási szabály törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Kiosztási szabály törlési hiba'
    });
  }
};

/**
 * POST /api/v1/assignment-rules/simulate
 * Szimuláció: milyen szabály illeszkedne és ki lenne kijelölve
 * Nem ment semmit az adatbázisba
 */
const simulate = async (req, res) => {
  try {
    const { type, item } = req.body;

    if (!type || !['ticket', 'task'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Típus (ticket/task) megadása kötelező'
      });
    }

    if (!item || typeof item !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Item objektum megadása kötelező'
      });
    }

    const autoAssignService = require('../services/autoAssign.service');

    // Inject contractor_id from user if not provided
    const simulatedItem = {
      ...item,
      contractor_id: item.contractor_id || req.user.contractorId,
    };

    // Step 1: Find matching rule
    const matchedRule = await autoAssignService.findMatchingRule(type, simulatedItem);

    // Step 2: Get all rules to show which were evaluated
    const allRulesResult = await query(`
      SELECT id, name, type, conditions, assign_to_role, assign_to_user_id, assign_strategy, priority, is_active
      FROM assignment_rules
      WHERE type = $1
        AND is_active = TRUE
        AND (contractor_id IS NULL OR contractor_id = $2)
      ORDER BY priority DESC, created_at ASC
    `, [type, simulatedItem.contractor_id]);

    const evaluatedRules = allRulesResult.rows.map(rule => ({
      ...rule,
      matched: autoAssignService.matchesConditions(simulatedItem, rule.conditions),
    }));

    // Step 3: If rule found, get candidates and determine who would be assigned
    let candidates = [];
    let wouldAssignTo = null;
    let strategyUsed = null;
    let fallback = false;

    if (matchedRule) {
      if (matchedRule.assign_to_user_id) {
        // Direct user assignment
        const userResult = await query(
          "SELECT id, first_name, last_name, email FROM users WHERE id = $1",
          [matchedRule.assign_to_user_id]
        );
        if (userResult.rows.length > 0) {
          wouldAssignTo = userResult.rows[0];
          candidates = [userResult.rows[0]];
          strategyUsed = 'direct_user';
        }
      } else {
        candidates = await autoAssignService.getCandidateUsers(matchedRule, simulatedItem.contractor_id);

        if (candidates.length > 0) {
          wouldAssignTo = await autoAssignService.applyStrategy(
            matchedRule.assign_strategy,
            candidates,
            simulatedItem
          );
          strategyUsed = matchedRule.assign_strategy;
        }
      }
    }

    // Step 4: If no match or no candidates, check fallback
    if (!wouldAssignTo) {
      fallback = true;
      const admin = await query(`
        SELECT u.id, u.first_name, u.last_name, u.email
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.slug IN ('admin', 'superadmin')
          AND u.is_active = TRUE
          AND ($1::uuid IS NULL OR u.contractor_id = $1)
        ORDER BY CASE r.slug WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 END
        LIMIT 1
      `, [simulatedItem.contractor_id]);

      if (admin.rows.length > 0) {
        wouldAssignTo = admin.rows[0];
        strategyUsed = 'fallback_admin';
      }
    }

    // Step 5: Get workload info for candidates
    const candidateIds = candidates.map(c => c.id);
    let candidateWorkloads = [];
    if (candidateIds.length > 0) {
      const wlResult = await query(`
        SELECT uw.user_id, uw.active_tickets, uw.active_tasks, uw.total_pending_items, uw.last_assignment_at
        FROM user_workload uw
        WHERE uw.user_id = ANY($1)
      `, [candidateIds]);

      candidateWorkloads = candidates.map(c => {
        const wl = wlResult.rows.find(w => w.user_id === c.id);
        return {
          ...c,
          active_tickets: wl?.active_tickets || 0,
          active_tasks: wl?.active_tasks || 0,
          total_pending_items: wl?.total_pending_items || 0,
          last_assignment_at: wl?.last_assignment_at || null,
        };
      });
    }

    res.json({
      success: true,
      data: {
        simulation: {
          input: { type, item: simulatedItem },
          matched_rule: matchedRule ? {
            id: matchedRule.id,
            name: matchedRule.name,
            conditions: matchedRule.conditions,
            assign_to_role: matchedRule.assign_to_role,
            assign_strategy: matchedRule.assign_strategy,
            priority: matchedRule.priority,
          } : null,
          evaluated_rules: evaluatedRules,
          candidates: candidateWorkloads,
          would_assign_to: wouldAssignTo ? {
            id: wouldAssignTo.id,
            name: `${wouldAssignTo.first_name} ${wouldAssignTo.last_name}`,
            email: wouldAssignTo.email,
          } : null,
          strategy_used: strategyUsed,
          is_fallback: fallback,
        }
      }
    });

  } catch (error) {
    logger.error('Szimuláció hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szimuláció hiba'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  simulate
};
