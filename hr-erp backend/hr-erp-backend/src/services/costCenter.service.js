const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Build tree structure from flat list of cost centers
 */
function buildTree(flatList) {
  const map = {};
  const roots = [];

  flatList.forEach(item => {
    map[item.id] = { ...item, children: [] };
  });

  flatList.forEach(item => {
    if (item.parent_id && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id]);
    } else {
      roots.push(map[item.id]);
    }
  });

  return roots;
}

/**
 * Recursively recalculate paths for descendants
 */
async function recalculateDescendantPaths(client, parentId, parentPath, parentLevel) {
  const children = await client.query(
    'SELECT id FROM cost_centers WHERE parent_id = $1',
    [parentId]
  );

  for (const child of children.rows) {
    const childPath = parentPath + '.' + child.id;
    const childLevel = parentLevel + 1;

    await client.query(
      'UPDATE cost_centers SET path = $1, level = $2 WHERE id = $3',
      [childPath, childLevel, child.id]
    );

    await recalculateDescendantPaths(client, child.id, childPath, childLevel);
  }
}

class CostCenterService {
  /**
   * Get all cost centers (flat list with optional filters)
   */
  async getAll(filters = {}) {
    const { search, parent_id, is_active, format } = filters;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(cc.name ILIKE $${paramIndex} OR cc.code ILIKE $${paramIndex} OR cc.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (parent_id === 'null' || parent_id === 'root') {
      whereConditions.push('cc.parent_id IS NULL');
    } else if (parent_id) {
      whereConditions.push(`cc.parent_id = $${paramIndex}`);
      params.push(parent_id);
      paramIndex++;
    }

    if (is_active !== undefined) {
      whereConditions.push(`cc.is_active = $${paramIndex}`);
      params.push(is_active === 'true' || is_active === true);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query(
      `SELECT cc.*,
        p.name as parent_name, p.code as parent_code,
        (SELECT COUNT(*) FROM cost_centers child WHERE child.parent_id = cc.id) as children_count,
        (SELECT COALESCE(SUM(i.amount), 0) FROM invoices i WHERE i.cost_center_id = cc.id) as total_spent
       FROM cost_centers cc
       LEFT JOIN cost_centers p ON cc.parent_id = p.id
       ${whereClause}
       ORDER BY cc.path NULLS FIRST, cc.name`,
      params
    );

    if (format === 'tree') {
      return buildTree(result.rows);
    }

    return result.rows;
  }

  /**
   * Get cost center tree structure
   */
  async getTree() {
    const result = await query(
      `SELECT cc.*,
        (SELECT COALESCE(SUM(i.amount), 0) FROM invoices i WHERE i.cost_center_id = cc.id) as total_spent
       FROM cost_centers cc
       WHERE cc.is_active = true
       ORDER BY cc.level, cc.name`
    );

    return buildTree(result.rows);
  }

  /**
   * Get cost center by ID with related data
   */
  async getById(id) {
    const result = await query(
      `SELECT cc.*,
        p.name as parent_name, p.code as parent_code,
        (SELECT COUNT(*) FROM cost_centers child WHERE child.parent_id = cc.id) as children_count,
        (SELECT COALESCE(SUM(i.amount), 0) FROM invoices i WHERE i.cost_center_id = cc.id) as total_spent
       FROM cost_centers cc
       LEFT JOIN cost_centers p ON cc.parent_id = p.id
       WHERE cc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const costCenter = result.rows[0];

    // Get children
    const children = await query(
      `SELECT id, name, code, level, is_active, budget
       FROM cost_centers
       WHERE parent_id = $1
       ORDER BY name`,
      [id]
    );
    costCenter.children = children.rows;

    return costCenter;
  }

  /**
   * Create a new cost center
   */
  async create(data) {
    // Check for duplicate code
    const existing = await query(
      'SELECT id FROM cost_centers WHERE code = $1',
      [data.code.trim().toUpperCase()]
    );
    if (existing.rows.length > 0) {
      return { error: 'Ez a kód már létezik', status: 409 };
    }

    // Verify parent exists if provided
    if (data.parent_id) {
      const parent = await query(
        'SELECT id FROM cost_centers WHERE id = $1',
        [data.parent_id]
      );
      if (parent.rows.length === 0) {
        return { error: 'Szülő költségközpont nem található', status: 404 };
      }
    }

    const result = await query(
      `INSERT INTO cost_centers (name, code, description, budget, parent_id, color, icon)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.name.trim(),
        data.code.trim().toUpperCase(),
        data.description || null,
        data.budget || null,
        data.parent_id || null,
        data.color || null,
        data.icon || null,
      ]
    );

    return { data: result.rows[0] };
  }

  /**
   * Update a cost center
   */
  async update(id, data) {
    const current = await query(
      'SELECT * FROM cost_centers WHERE id = $1',
      [id]
    );
    if (current.rows.length === 0) {
      return { error: 'Költségközpont nem található', status: 404 };
    }

    // Check for duplicate code if code is being changed
    if (data.code && data.code.trim().toUpperCase() !== current.rows[0].code) {
      const existing = await query(
        'SELECT id FROM cost_centers WHERE code = $1 AND id != $2',
        [data.code.trim().toUpperCase(), id]
      );
      if (existing.rows.length > 0) {
        return { error: 'Ez a kód már létezik', status: 409 };
      }
    }

    // Prevent setting parent to self
    if (data.parent_id === id) {
      return { error: 'Költségközpont nem lehet saját szülője', status: 400 };
    }

    const result = await query(
      `UPDATE cost_centers SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        description = COALESCE($3, description),
        budget = COALESCE($4, budget),
        parent_id = $5,
        color = COALESCE($6, color),
        icon = COALESCE($7, icon),
        is_active = COALESCE($8, is_active)
       WHERE id = $9
       RETURNING *`,
      [
        data.name ? data.name.trim() : null,
        data.code ? data.code.trim().toUpperCase() : null,
        data.description,
        data.budget,
        data.parent_id !== undefined ? data.parent_id : current.rows[0].parent_id,
        data.color,
        data.icon,
        data.is_active,
        id,
      ]
    );

    return { data: result.rows[0], previous: current.rows[0] };
  }

  /**
   * Soft delete a cost center (set is_active = false)
   */
  async softDelete(id) {
    const current = await query(
      'SELECT * FROM cost_centers WHERE id = $1',
      [id]
    );
    if (current.rows.length === 0) {
      return { error: 'Költségközpont nem található', status: 404 };
    }

    // Check for children
    const children = await query(
      'SELECT COUNT(*) as count FROM cost_centers WHERE parent_id = $1 AND is_active = true',
      [id]
    );
    if (parseInt(children.rows[0].count) > 0) {
      return { error: 'Költségközpont nem törölhető, amíg aktív al-költségközpontjai vannak', status: 400 };
    }

    // Check for linked invoices
    const invoices = await query(
      'SELECT COUNT(*) as count FROM invoices WHERE cost_center_id = $1',
      [id]
    );
    if (parseInt(invoices.rows[0].count) > 0) {
      // Soft delete - just deactivate
      await query(
        'UPDATE cost_centers SET is_active = false WHERE id = $1',
        [id]
      );
      return { data: current.rows[0], softDeleted: true };
    }

    // Hard delete if no invoices
    await query('DELETE FROM cost_centers WHERE id = $1', [id]);
    return { data: current.rows[0], hardDeleted: true };
  }

  /**
   * Get ancestors (breadcrumb path)
   */
  async getAncestors(id) {
    const result = await query(
      `WITH RECURSIVE ancestors AS (
        SELECT id, name, code, parent_id, level, 0 as depth
        FROM cost_centers WHERE id = $1
        UNION ALL
        SELECT cc.id, cc.name, cc.code, cc.parent_id, cc.level, a.depth + 1
        FROM cost_centers cc
        JOIN ancestors a ON cc.id = a.parent_id
      )
      SELECT * FROM ancestors ORDER BY depth DESC`,
      [id]
    );

    return result.rows;
  }

  /**
   * Get descendants (all children recursively)
   */
  async getDescendants(id) {
    const result = await query(
      `WITH RECURSIVE descendants AS (
        SELECT id, name, code, parent_id, level
        FROM cost_centers WHERE parent_id = $1
        UNION ALL
        SELECT cc.id, cc.name, cc.code, cc.parent_id, cc.level
        FROM cost_centers cc
        JOIN descendants d ON cc.parent_id = d.id
      )
      SELECT * FROM descendants ORDER BY level, name`,
      [id]
    );

    return result.rows;
  }
}

module.exports = new CostCenterService();
