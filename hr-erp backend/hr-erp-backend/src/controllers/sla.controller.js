const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

/**
 * GET /api/v1/sla-policies
 * SLA szabályzatok listázása
 */
const getAll = async (req, res) => {
  try {
    const { is_active } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Contractor szűrés
    if (!req.user.roles.includes('superadmin')) {
      whereConditions.push(`(sp.contractor_id = $${paramIndex} OR sp.contractor_id IS NULL)`);
      params.push(req.user.contractorId);
      paramIndex++;
    }

    if (is_active !== undefined) {
      whereConditions.push(`sp.is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query(`
      SELECT sp.*,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        c.name as contractor_name
      FROM sla_policies sp
      LEFT JOIN users creator ON sp.created_by = creator.id
      LEFT JOIN contractors c ON sp.contractor_id = c.id
      ${whereClause}
      ORDER BY sp.created_at DESC
    `, params);

    res.json({
      success: true,
      data: { policies: result.rows }
    });

  } catch (error) {
    logger.error('SLA szabályzatok lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'SLA szabályzatok lekérdezési hiba'
    });
  }
};

/**
 * GET /api/v1/sla-policies/:id
 * Egy SLA szabályzat részletei
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT sp.*,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        c.name as contractor_name
      FROM sla_policies sp
      LEFT JOIN users creator ON sp.created_by = creator.id
      LEFT JOIN contractors c ON sp.contractor_id = c.id
      WHERE sp.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SLA szabályzat nem található'
      });
    }

    res.json({
      success: true,
      data: { policy: result.rows[0] }
    });

  } catch (error) {
    logger.error('SLA szabályzat lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'SLA szabályzat lekérdezési hiba'
    });
  }
};

/**
 * POST /api/v1/sla-policies
 * Új SLA szabályzat létrehozása
 */
const create = async (req, res) => {
  try {
    const {
      name, description, rules,
      business_hours_only, business_hours_start, business_hours_end,
      escalation_enabled, escalation_after_percentage, escalation_to_role,
      is_active, apply_to_categories
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Név megadása kötelező'
      });
    }

    const result = await query(`
      INSERT INTO sla_policies (
        name, description, rules,
        business_hours_only, business_hours_start, business_hours_end,
        escalation_enabled, escalation_after_percentage, escalation_to_role,
        is_active, apply_to_categories, contractor_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      name,
      description || null,
      JSON.stringify(rules || {}),
      business_hours_only !== false,
      business_hours_start || '08:00',
      business_hours_end || '17:00',
      escalation_enabled || false,
      escalation_after_percentage || 80,
      escalation_to_role || null,
      is_active !== false,
      apply_to_categories || null,
      req.user.contractorId,
      req.user.id
    ]);

    await logActivity({
      userId: req.user.id,
      entityType: 'sla_policy',
      entityId: result.rows[0].id,
      action: 'create',
      metadata: { name }
    });

    logger.info('SLA szabályzat létrehozva', {
      policyId: result.rows[0].id,
      name,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'SLA szabályzat sikeresen létrehozva',
      data: { policy: result.rows[0] }
    });

  } catch (error) {
    logger.error('SLA szabályzat létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'SLA szabályzat létrehozási hiba'
    });
  }
};

/**
 * PUT /api/v1/sla-policies/:id
 * SLA szabályzat módosítása
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, rules,
      business_hours_only, business_hours_start, business_hours_end,
      escalation_enabled, escalation_after_percentage, escalation_to_role,
      is_active, apply_to_categories
    } = req.body;

    const current = await query('SELECT * FROM sla_policies WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SLA szabályzat nem található'
      });
    }

    const result = await query(`
      UPDATE sla_policies SET
        name = COALESCE($1, name),
        description = $2,
        rules = COALESCE($3, rules),
        business_hours_only = COALESCE($4, business_hours_only),
        business_hours_start = COALESCE($5, business_hours_start),
        business_hours_end = COALESCE($6, business_hours_end),
        escalation_enabled = COALESCE($7, escalation_enabled),
        escalation_after_percentage = COALESCE($8, escalation_after_percentage),
        escalation_to_role = $9,
        is_active = COALESCE($10, is_active),
        apply_to_categories = $11,
        updated_at = NOW()
      WHERE id = $12
      RETURNING *
    `, [
      name,
      description !== undefined ? description : current.rows[0].description,
      rules ? JSON.stringify(rules) : null,
      business_hours_only,
      business_hours_start,
      business_hours_end,
      escalation_enabled,
      escalation_after_percentage,
      escalation_to_role !== undefined ? escalation_to_role : current.rows[0].escalation_to_role,
      is_active,
      apply_to_categories !== undefined ? apply_to_categories : current.rows[0].apply_to_categories,
      id
    ]);

    await logActivity({
      userId: req.user.id,
      entityType: 'sla_policy',
      entityId: id,
      action: 'update',
      metadata: { name: result.rows[0].name }
    });

    res.json({
      success: true,
      message: 'SLA szabályzat frissítve',
      data: { policy: result.rows[0] }
    });

  } catch (error) {
    logger.error('SLA szabályzat frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'SLA szabályzat frissítési hiba'
    });
  }
};

/**
 * DELETE /api/v1/sla-policies/:id
 * SLA szabályzat törlése
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const current = await query('SELECT * FROM sla_policies WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SLA szabályzat nem található'
      });
    }

    await query('DELETE FROM sla_policies WHERE id = $1', [id]);

    await logActivity({
      userId: req.user.id,
      entityType: 'sla_policy',
      entityId: id,
      action: 'delete',
      metadata: { name: current.rows[0].name }
    });

    logger.info('SLA szabályzat törölve', {
      policyId: id,
      name: current.rows[0].name,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'SLA szabályzat törölve'
    });

  } catch (error) {
    logger.error('SLA szabályzat törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'SLA szabályzat törlési hiba'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
