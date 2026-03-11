const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const archiver = require('archiver');
const { isValidUUID, sanitizeString, sanitizeSearch } = require('../utils/validation');

// ============================================
// TREE HELPERS
// ============================================

/**
 * Build tree structure from flat list
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
 * Recursively update paths for all descendants after a parent move
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

// ============================================
// COST CENTER CRUD
// ============================================

/**
 * GET /cost-centers - Flat list with optional filters
 */
const getAll = async (req, res) => {
  try {
    const { search, is_active, parent_id, page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT cc.*, p.name AS parent_name, p.code AS parent_code,
      cc.total_invoices, cc.total_net_amount, cc.total_vat_amount, cc.total_gross_amount,
      cc.first_invoice_date, cc.last_invoice_date
      FROM cost_centers cc LEFT JOIN cost_centers p ON cc.parent_id = p.id WHERE 1=1`;
    const params = [];
    let paramIdx = 0;

    if (search) {
      paramIdx++;
      sql += ` AND (cc.name ILIKE $${paramIdx} OR cc.code ILIKE $${paramIdx} OR cc.description ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
    }

    if (is_active !== undefined) {
      paramIdx++;
      sql += ` AND cc.is_active = $${paramIdx}`;
      params.push(is_active === 'true');
    }

    if (parent_id) {
      paramIdx++;
      if (parent_id === 'null' || parent_id === 'root') {
        sql += ' AND cc.parent_id IS NULL';
      } else {
        sql += ` AND cc.parent_id = $${paramIdx}`;
        params.push(parent_id);
      }
    }

    // Count total
    const countSql = sql.replace(/SELECT cc\.\*[\s\S]*?FROM cost_centers cc/, 'SELECT COUNT(*) FROM cost_centers cc');
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].count);

    // Fetch page
    paramIdx++;
    sql += ` ORDER BY cc.path, cc.name LIMIT $${paramIdx}`;
    params.push(parseInt(limit));
    paramIdx++;
    sql += ` OFFSET $${paramIdx}`;
    params.push(parseInt(offset));

    const result = await query(sql, params);

    // Format summary data into nested object
    const data = result.rows.map(row => ({
      ...row,
      summary: {
        totalInvoices: parseInt(row.total_invoices) || 0,
        totalNetAmount: parseFloat(row.total_net_amount) || 0,
        totalVatAmount: parseFloat(row.total_vat_amount) || 0,
        totalGrossAmount: parseFloat(row.total_gross_amount) || 0,
        firstInvoiceDate: row.first_invoice_date || null,
        lastInvoiceDate: row.last_invoice_date || null,
        currency: 'HUF',
      },
    }));

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Cost center lista hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a költséghelyek lekérésekor' });
  }
};

/**
 * GET /cost-centers/tree - Full hierarchical tree
 */
const getTree = async (req, res) => {
  try {
    const { is_active } = req.query;

    let sql = `SELECT *, total_invoices, total_net_amount, total_vat_amount, total_gross_amount,
      first_invoice_date, last_invoice_date FROM cost_centers WHERE 1=1`;
    const params = [];

    if (is_active !== undefined) {
      sql += ' AND is_active = $1';
      params.push(is_active === 'true');
    }

    sql += ' ORDER BY path, name';

    const result = await query(sql, params);

    // Add summary object to each row before building tree
    const rowsWithSummary = result.rows.map(row => ({
      ...row,
      summary: {
        totalInvoices: parseInt(row.total_invoices) || 0,
        totalNetAmount: parseFloat(row.total_net_amount) || 0,
        totalVatAmount: parseFloat(row.total_vat_amount) || 0,
        totalGrossAmount: parseFloat(row.total_gross_amount) || 0,
        firstInvoiceDate: row.first_invoice_date || null,
        lastInvoiceDate: row.last_invoice_date || null,
        currency: 'HUF',
      },
    }));

    const tree = buildTree(rowsWithSummary);

    res.json({
      success: true,
      data: tree,
      total: result.rows.length
    });
  } catch (error) {
    logger.error('Cost center tree hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a fa struktúra lekérésekor' });
  }
};

/**
 * GET /cost-centers/:id - Single with ancestors and direct children
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

    const result = await query(
      `SELECT cc.*, p.name AS parent_name, p.code AS parent_code
       FROM cost_centers cc
       LEFT JOIN cost_centers p ON cc.parent_id = p.id
       WHERE cc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Költséghely nem található' });
    }

    const costCenter = result.rows[0];

    // Get ancestors (breadcrumb)
    const ancestors = await query(
      `WITH RECURSIVE ancestors AS (
        SELECT id, name, code, parent_id, level, path
        FROM cost_centers WHERE id = $1
        UNION ALL
        SELECT cc.id, cc.name, cc.code, cc.parent_id, cc.level, cc.path
        FROM cost_centers cc
        JOIN ancestors a ON cc.id = a.parent_id
      )
      SELECT id, name, code, level FROM ancestors
      WHERE id != $1
      ORDER BY level`,
      [id]
    );

    // Get direct children
    const children = await query(
      'SELECT id, name, code, icon, color, is_active, level FROM cost_centers WHERE parent_id = $1 ORDER BY name',
      [id]
    );

    // Get invoice count and total for this cost center
    const invoiceStats = await query(
      `SELECT COUNT(*) as invoice_count, COALESCE(SUM(total_amount), 0) as total_spent
       FROM invoices WHERE cost_center_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...costCenter,
        ancestors: ancestors.rows,
        children: children.rows,
        invoice_count: parseInt(invoiceStats.rows[0].invoice_count),
        total_spent: parseFloat(invoiceStats.rows[0].total_spent),
        summary: {
          totalInvoices: parseInt(costCenter.total_invoices) || 0,
          totalNetAmount: parseFloat(costCenter.total_net_amount) || 0,
          totalVatAmount: parseFloat(costCenter.total_vat_amount) || 0,
          totalGrossAmount: parseFloat(costCenter.total_gross_amount) || 0,
          firstInvoiceDate: costCenter.first_invoice_date || null,
          lastInvoiceDate: costCenter.last_invoice_date || null,
          currency: 'HUF',
        },
      }
    });
  } catch (error) {
    logger.error('Cost center lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a költséghely lekérésekor' });
  }
};

/**
 * POST /cost-centers - Create new
 */
const create = async (req, res) => {
  try {
    const { name, code, parent_id, description, budget, color, icon, contractor_id } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'A név megadása kötelező' });
    }

    // Validate parent exists
    if (parent_id) {
      const parentCheck = await query('SELECT id FROM cost_centers WHERE id = $1', [parent_id]);
      if (parentCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'A szülő költséghely nem található' });
      }
    }

    // Check code uniqueness
    if (code) {
      const codeCheck = await query('SELECT id FROM cost_centers WHERE code = $1', [code]);
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Ez a kód már foglalt' });
      }
    }

    const result = await query(
      `INSERT INTO cost_centers (name, code, parent_id, description, budget, color, icon, contractor_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name, code || null, parent_id || null, description || null, budget || null, color || null, icon || null, contractor_id || null, req.user?.id || null]
    );

    logger.info('Költséghely létrehozva:', { id: result.rows[0].id, name, code });

    res.status(201).json({
      success: true,
      message: 'Költséghely sikeresen létrehozva',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Cost center létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a költséghely létrehozásakor' });
  }
};

/**
 * PUT /cost-centers/:id - Update
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }
    const { name, code, parent_id, description, budget, color, icon, is_active, contractor_id } = req.body;

    // Check exists
    const existing = await query('SELECT * FROM cost_centers WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Költséghely nem található' });
    }

    // Prevent self-parenting
    if (parent_id === id) {
      return res.status(400).json({ success: false, message: 'Egy költséghely nem lehet saját magának szülője' });
    }

    // Prevent circular reference
    if (parent_id) {
      const descendants = await query(
        `WITH RECURSIVE subtree AS (
          SELECT id FROM cost_centers WHERE parent_id = $1
          UNION ALL
          SELECT cc.id FROM cost_centers cc JOIN subtree st ON cc.parent_id = st.id
        )
        SELECT id FROM subtree WHERE id = $2`,
        [id, parent_id]
      );
      if (descendants.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Körkörös hivatkozás nem engedélyezett' });
      }
    }

    // Check code uniqueness if changed
    if (code && code !== existing.rows[0].code) {
      const codeCheck = await query('SELECT id FROM cost_centers WHERE code = $1 AND id != $2', [code, id]);
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Ez a kód már foglalt' });
      }
    }

    const parentChanged = (parent_id !== undefined) && (parent_id !== existing.rows[0].parent_id);

    // Build dynamic update
    const fields = [];
    const params = [];
    let paramIdx = 0;

    const addField = (fieldName, value) => {
      if (value !== undefined) {
        paramIdx++;
        fields.push(`${fieldName} = $${paramIdx}`);
        params.push(value);
      }
    };

    addField('name', name);
    addField('code', code);
    addField('parent_id', parent_id);
    addField('description', description);
    addField('budget', budget);
    addField('color', color);
    addField('icon', icon);
    addField('is_active', is_active);
    addField('contractor_id', contractor_id);

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs frissítendő mező' });
    }

    paramIdx++;
    params.push(id);

    const result = await query(
      `UPDATE cost_centers SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    // If parent changed, recalculate descendant paths
    if (parentChanged) {
      const updated = result.rows[0];
      await transaction(async (client) => {
        await recalculateDescendantPaths(client, updated.id, updated.path, updated.level);
      });
    }

    logger.info('Költséghely frissítve:', { id, name });

    res.json({
      success: true,
      message: 'Költséghely sikeresen frissítve',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Cost center frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a költséghely frissítésekor' });
  }
};

/**
 * DELETE /cost-centers/:id - Soft delete
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

    // Check has children
    const childrenCheck = await query(
      'SELECT COUNT(*) FROM cost_centers WHERE parent_id = $1 AND is_active = true',
      [id]
    );
    if (parseInt(childrenCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Nem törölhető, mert aktív al-költséghelyei vannak. Először töröld vagy mozgasd az al-költséghelyeket.'
      });
    }

    // Check has invoices
    const invoiceCheck = await query(
      'SELECT COUNT(*) FROM invoices WHERE cost_center_id = $1',
      [id]
    );
    if (parseInt(invoiceCheck.rows[0].count) > 0) {
      // Soft delete only
      await query('UPDATE cost_centers SET is_active = false WHERE id = $1', [id]);
      return res.json({
        success: true,
        message: 'Költséghely inaktiválva (számlák vannak hozzárendelve)'
      });
    }

    await query('UPDATE cost_centers SET is_active = false WHERE id = $1', [id]);

    logger.info('Költséghely törölve:', { id });

    res.json({
      success: true,
      message: 'Költséghely sikeresen törölve'
    });
  } catch (error) {
    logger.error('Cost center törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a költséghely törlésekor' });
  }
};

/**
 * GET /cost-centers/:id/ancestors - Breadcrumb path
 */
const getAncestors = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `WITH RECURSIVE ancestors AS (
        SELECT id, name, code, parent_id, level, icon, color
        FROM cost_centers WHERE id = $1
        UNION ALL
        SELECT cc.id, cc.name, cc.code, cc.parent_id, cc.level, cc.icon, cc.color
        FROM cost_centers cc
        JOIN ancestors a ON cc.id = a.parent_id
      )
      SELECT * FROM ancestors ORDER BY level`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Ancestor lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba az ősök lekérésekor' });
  }
};

/**
 * GET /cost-centers/:id/descendants - All children recursively
 */
const getDescendants = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `WITH RECURSIVE descendants AS (
        SELECT id, name, code, parent_id, level, icon, color, is_active, budget
        FROM cost_centers WHERE parent_id = $1
        UNION ALL
        SELECT cc.id, cc.name, cc.code, cc.parent_id, cc.level, cc.icon, cc.color, cc.is_active, cc.budget
        FROM cost_centers cc
        JOIN descendants d ON cc.parent_id = d.id
      )
      SELECT * FROM descendants ORDER BY level, name`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    logger.error('Descendant lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a leszármazottak lekérésekor' });
  }
};

/**
 * GET /cost-centers/:id/budget-summary - Budget vs spent including descendants
 */
const getBudgetSummary = async (req, res) => {
  try {
    const { id } = req.params;

    // Get this cost center
    const ccResult = await query('SELECT * FROM cost_centers WHERE id = $1', [id]);
    if (ccResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Költséghely nem található' });
    }

    // Get all descendant IDs including self
    const descendantIds = await query(
      `WITH RECURSIVE descendants AS (
        SELECT id FROM cost_centers WHERE id = $1
        UNION ALL
        SELECT cc.id FROM cost_centers cc
        JOIN descendants d ON cc.parent_id = d.id
      )
      SELECT id FROM descendants`,
      [id]
    );

    const ids = descendantIds.rows.map(r => r.id);

    // Calculate totals per status
    const invoiceStats = await query(
      `SELECT
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
       FROM invoices
       WHERE cost_center_id = ANY($1)
       GROUP BY payment_status`,
      [ids]
    );

    // Total budget across this and descendants
    const budgetResult = await query(
      `WITH RECURSIVE descendants AS (
        SELECT id, budget FROM cost_centers WHERE id = $1
        UNION ALL
        SELECT cc.id, cc.budget FROM cost_centers cc
        JOIN descendants d ON cc.parent_id = d.id
      )
      SELECT COALESCE(SUM(budget), 0) as total_budget FROM descendants`,
      [id]
    );

    const totalBudget = parseFloat(budgetResult.rows[0].total_budget);
    const statusBreakdown = {};
    let totalSpent = 0;
    let totalInvoices = 0;

    invoiceStats.rows.forEach(row => {
      statusBreakdown[row.payment_status] = {
        count: parseInt(row.count),
        total: parseFloat(row.total)
      };
      totalSpent += parseFloat(row.total);
      totalInvoices += parseInt(row.count);
    });

    res.json({
      success: true,
      data: {
        cost_center: ccResult.rows[0],
        budget: totalBudget,
        total_spent: totalSpent,
        remaining: totalBudget - totalSpent,
        utilization_percent: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : null,
        total_invoices: totalInvoices,
        by_status: statusBreakdown,
        descendant_count: ids.length - 1
      }
    });
  } catch (error) {
    logger.error('Budget summary hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a költségvetés összefoglaló lekérésekor' });
  }
};

/**
 * POST /cost-centers/:id/move - Move to new parent
 */
const move = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_parent_id } = req.body;

    const existing = await query('SELECT * FROM cost_centers WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Költséghely nem található' });
    }

    // Prevent self-parenting
    if (new_parent_id === id) {
      return res.status(400).json({ success: false, message: 'Egy költséghely nem lehet saját magának szülője' });
    }

    // Validate new parent exists (if not moving to root)
    if (new_parent_id) {
      const parentCheck = await query('SELECT id FROM cost_centers WHERE id = $1', [new_parent_id]);
      if (parentCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Az új szülő költséghely nem található' });
      }

      // Prevent circular: new parent can't be a descendant
      const circularCheck = await query(
        `WITH RECURSIVE subtree AS (
          SELECT id FROM cost_centers WHERE parent_id = $1
          UNION ALL
          SELECT cc.id FROM cost_centers cc JOIN subtree st ON cc.parent_id = st.id
        )
        SELECT id FROM subtree WHERE id = $2`,
        [id, new_parent_id]
      );
      if (circularCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Körkörös hivatkozás nem engedélyezett' });
      }
    }

    await transaction(async (client) => {
      // Update parent (trigger will handle path/level)
      const updateResult = await client.query(
        'UPDATE cost_centers SET parent_id = $1 WHERE id = $2 RETURNING *',
        [new_parent_id || null, id]
      );

      const updated = updateResult.rows[0];

      // Recalculate all descendant paths
      await recalculateDescendantPaths(client, updated.id, updated.path, updated.level);
    });

    const result = await query('SELECT * FROM cost_centers WHERE id = $1', [id]);

    logger.info('Költséghely áthelyezve:', { id, new_parent_id });

    res.json({
      success: true,
      message: 'Költséghely sikeresen áthelyezve',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Cost center move hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a költséghely áthelyezésekor' });
  }
};

// ============================================
// INVOICE CATEGORIES
// ============================================

const getInvoiceCategories = async (req, res) => {
  try {
    const result = await query('SELECT * FROM invoice_categories WHERE is_active = true ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Invoice category lista hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a számla kategóriák lekérésekor' });
  }
};

const createInvoiceCategory = async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'A név megadása kötelező' });
    }

    const result = await query(
      'INSERT INTO invoice_categories (name, icon, color) VALUES ($1, $2, $3) RETURNING *',
      [name, icon || null, color || null]
    );

    res.status(201).json({ success: true, message: 'Kategória létrehozva', data: result.rows[0] });
  } catch (error) {
    logger.error('Invoice category create hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a kategória létrehozásakor' });
  }
};

const updateInvoiceCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, color, is_active } = req.body;

    const result = await query(
      `UPDATE invoice_categories SET
        name = COALESCE($1, name),
        icon = COALESCE($2, icon),
        color = COALESCE($3, color),
        is_active = COALESCE($4, is_active)
       WHERE id = $5 RETURNING *`,
      [name, icon, color, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategória nem található' });
    }

    res.json({ success: true, message: 'Kategória frissítve', data: result.rows[0] });
  } catch (error) {
    logger.error('Invoice category update hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a kategória frissítésekor' });
  }
};

const deleteInvoiceCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const invoiceCheck = await query('SELECT COUNT(*) FROM invoices WHERE category_id = $1', [id]);
    if (parseInt(invoiceCheck.rows[0].count) > 0) {
      await query('UPDATE invoice_categories SET is_active = false WHERE id = $1', [id]);
      return res.json({ success: true, message: 'Kategória inaktiválva (számlák tartoznak hozzá)' });
    }

    await query('DELETE FROM invoice_categories WHERE id = $1', [id]);
    res.json({ success: true, message: 'Kategória törölve' });
  } catch (error) {
    logger.error('Invoice category delete hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a kategória törlésekor' });
  }
};

// ============================================
// INVOICES
// ============================================

const getInvoices = async (req, res) => {
  try {
    const {
      search, cost_center_id, category_id, payment_status,
      date_from, date_to, page = 1, limit = 50
    } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT i.*,
        cc.name AS cost_center_name, cc.code AS cost_center_code, cc.icon AS cost_center_icon,
        ic.name AS category_name, ic.icon AS category_icon
      FROM invoices i
      LEFT JOIN cost_centers cc ON i.cost_center_id = cc.id
      LEFT JOIN invoice_categories ic ON i.category_id = ic.id
      WHERE 1=1`;
    const params = [];
    let paramIdx = 0;

    if (search) {
      paramIdx++;
      sql += ` AND (i.invoice_number ILIKE $${paramIdx} OR i.vendor_name ILIKE $${paramIdx} OR i.description ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
    }

    if (cost_center_id) {
      // Include all descendants of the cost center
      paramIdx++;
      sql += ` AND i.cost_center_id IN (
        WITH RECURSIVE subtree AS (
          SELECT id FROM cost_centers WHERE id = $${paramIdx}
          UNION ALL
          SELECT cc.id FROM cost_centers cc JOIN subtree st ON cc.parent_id = st.id
        )
        SELECT id FROM subtree
      )`;
      params.push(cost_center_id);
    }

    if (category_id) {
      paramIdx++;
      sql += ` AND i.category_id = $${paramIdx}`;
      params.push(category_id);
    }

    if (payment_status) {
      paramIdx++;
      sql += ` AND i.payment_status = $${paramIdx}`;
      params.push(payment_status);
    }

    if (date_from) {
      paramIdx++;
      sql += ` AND i.invoice_date >= $${paramIdx}`;
      params.push(date_from);
    }

    if (date_to) {
      paramIdx++;
      sql += ` AND i.invoice_date <= $${paramIdx}`;
      params.push(date_to);
    }

    // Count
    const countSql = sql.replace(/SELECT i\.\*,[\s\S]*?FROM invoices i/, 'SELECT COUNT(*) FROM invoices i');
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].count);

    // Fetch
    paramIdx++;
    sql += ` ORDER BY i.invoice_date DESC LIMIT $${paramIdx}`;
    params.push(parseInt(limit));
    paramIdx++;
    sql += ` OFFSET $${paramIdx}`;
    params.push(parseInt(offset));

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Invoice lista hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a számlák lekérésekor' });
  }
};

const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT i.*,
        cc.name AS cost_center_name, cc.code AS cost_center_code, cc.path AS cost_center_path,
        ic.name AS category_name, ic.icon AS category_icon
       FROM invoices i
       LEFT JOIN cost_centers cc ON i.cost_center_id = cc.id
       LEFT JOIN invoice_categories ic ON i.category_id = ic.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Számla nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Invoice lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a számla lekérésekor' });
  }
};

const createInvoice = async (req, res) => {
  try {
    const {
      invoice_number, vendor_name, vendor_tax_number, amount, currency,
      vat_amount, total_amount, invoice_date, due_date, payment_date,
      payment_status, cost_center_id, category_id, description, notes,
      file_path, ocr_data, contractor_id
    } = req.body;

    if (!cost_center_id) {
      return res.status(400).json({ success: false, message: 'A költséghely megadása kötelező' });
    }
    if (!amount) {
      return res.status(400).json({ success: false, message: 'Az összeg megadása kötelező' });
    }
    if (!invoice_date) {
      return res.status(400).json({ success: false, message: 'A számla dátum megadása kötelező' });
    }

    // Validate cost center exists
    const ccCheck = await query('SELECT id FROM cost_centers WHERE id = $1 AND is_active = true', [cost_center_id]);
    if (ccCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Az aktív költséghely nem található' });
    }

    const result = await query(
      `INSERT INTO invoices (
        invoice_number, vendor_name, vendor_tax_number, amount, currency,
        vat_amount, total_amount, invoice_date, due_date, payment_date,
        payment_status, cost_center_id, category_id, description, notes,
        file_path, ocr_data, contractor_id, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [
        invoice_number || null, vendor_name || null, vendor_tax_number || null,
        amount, currency || 'HUF', vat_amount || null,
        total_amount || amount, invoice_date, due_date || null, payment_date || null,
        payment_status || 'pending', cost_center_id, category_id || null,
        description || null, notes || null, file_path || null,
        ocr_data || null, contractor_id || null, req.user?.id || null
      ]
    );

    logger.info('Számla létrehozva:', { id: result.rows[0].id, invoice_number });

    res.status(201).json({
      success: true,
      message: 'Számla sikeresen létrehozva',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Invoice létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a számla létrehozásakor' });
  }
};

const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      invoice_number, vendor_name, vendor_tax_number, amount, currency,
      vat_amount, total_amount, invoice_date, due_date, payment_date,
      payment_status, cost_center_id, category_id, description, notes,
      file_path, ocr_data
    } = req.body;

    const existing = await query('SELECT id FROM invoices WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Számla nem található' });
    }

    const fields = [];
    const params = [];
    let paramIdx = 0;

    const addField = (fieldName, value) => {
      if (value !== undefined) {
        paramIdx++;
        fields.push(`${fieldName} = $${paramIdx}`);
        params.push(value);
      }
    };

    addField('invoice_number', invoice_number);
    addField('vendor_name', vendor_name);
    addField('vendor_tax_number', vendor_tax_number);
    addField('amount', amount);
    addField('currency', currency);
    addField('vat_amount', vat_amount);
    addField('total_amount', total_amount);
    addField('invoice_date', invoice_date);
    addField('due_date', due_date);
    addField('payment_date', payment_date);
    addField('payment_status', payment_status);
    addField('cost_center_id', cost_center_id);
    addField('category_id', category_id);
    addField('description', description);
    addField('notes', notes);
    addField('file_path', file_path);
    addField('ocr_data', ocr_data);

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs frissítendő mező' });
    }

    paramIdx++;
    params.push(id);

    const result = await query(
      `UPDATE invoices SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    res.json({ success: true, message: 'Számla frissítve', data: result.rows[0] });
  } catch (error) {
    logger.error('Invoice frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a számla frissítésekor' });
  }
};

const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM invoices WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Számla nem található' });
    }

    logger.info('Számla törölve:', { id });
    res.json({ success: true, message: 'Számla sikeresen törölve' });
  } catch (error) {
    logger.error('Invoice törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a számla törlésekor' });
  }
};

// ============================================
// INVOICE STATS
// ============================================

const getInvoiceStats = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE payment_status = 'pending') AS pending_count,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'pending'), 0) AS pending_sum,
        COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_count,
        COUNT(*) FILTER (WHERE payment_status = 'overdue') AS overdue_count,
        COALESCE(SUM(total_amount), 0) AS total_sum,
        COALESCE(SUM(total_amount) FILTER (WHERE invoice_date >= date_trunc('month', CURRENT_DATE)), 0) AS monthly_sum,
        COUNT(*) FILTER (WHERE invoice_date >= date_trunc('month', CURRENT_DATE)) AS monthly_count
      FROM invoices
    `);

    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        total_count: parseInt(row.total_count),
        pending_count: parseInt(row.pending_count),
        pending_sum: parseFloat(row.pending_sum),
        paid_count: parseInt(row.paid_count),
        overdue_count: parseInt(row.overdue_count),
        total_sum: parseFloat(row.total_sum),
        monthly_sum: parseFloat(row.monthly_sum),
        monthly_count: parseInt(row.monthly_count),
      },
    });
  } catch (error) {
    logger.error('Invoice stats hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a számla statisztikák lekérésekor' });
  }
};

// ============================================
// BULK INVOICE ACTION
// ============================================

const bulkInvoiceAction = async (req, res) => {
  try {
    const { action, ids } = req.body;

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Akció és azonosítók megadása kötelező' });
    }

    let affectedCount = 0;

    if (action === 'mark_paid') {
      const result = await query(
        `UPDATE invoices SET payment_status = 'paid', payment_date = CURRENT_DATE
         WHERE id = ANY($1) AND payment_status != 'paid'`,
        [ids]
      );
      affectedCount = result.rowCount;
    } else if (action === 'delete') {
      // Delete associated files first
      const filesToDelete = await query(
        'SELECT id, file_path FROM invoices WHERE id = ANY($1) AND file_path IS NOT NULL',
        [ids]
      );
      for (const row of filesToDelete.rows) {
        const fullPath = path.join(__dirname, '..', '..', row.file_path);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }

      const result = await query('DELETE FROM invoices WHERE id = ANY($1)', [ids]);
      affectedCount = result.rowCount;
    } else {
      return res.status(400).json({ success: false, message: 'Ismeretlen akció: ' + action });
    }

    logger.info('Bulk invoice action:', { action, ids, affectedCount });

    res.json({
      success: true,
      message: `${affectedCount} számla sikeresen ${action === 'mark_paid' ? 'fizetettre állítva' : 'törölve'}`,
      affected_count: affectedCount,
    });
  } catch (error) {
    logger.error('Bulk invoice action hiba:', error);
    res.status(500).json({ success: false, message: 'Hiba a tömeges művelet során' });
  }
};

// ============================================
// UPLOAD INVOICE FILE
// ============================================

const uploadInvoiceFile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Nincs feltöltött fájl' });
    }

    // Verify invoice exists
    const existing = await query('SELECT id, file_path FROM invoices WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Számla nem található' });
    }

    // Delete old file if replacing
    const oldFilePath = existing.rows[0].file_path;
    if (oldFilePath) {
      const oldFullPath = path.join(__dirname, '..', '..', oldFilePath);
      if (fs.existsSync(oldFullPath)) {
        fs.unlinkSync(oldFullPath);
      }
    }

    // Move file to invoice-specific directory
    const invoiceDir = path.join(__dirname, '..', '..', 'uploads', 'invoices', id.toString());
    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    const newFileName = req.file.filename;
    const newPath = path.join(invoiceDir, newFileName);
    fs.renameSync(req.file.path, newPath);

    const relativePath = `uploads/invoices/${id}/${newFileName}`;

    // Update invoice record
    const result = await query(
      'UPDATE invoices SET file_path = $1 WHERE id = $2 RETURNING *',
      [relativePath, id]
    );

    logger.info('Invoice file uploaded:', { invoiceId: id, filePath: relativePath });

    res.json({
      success: true,
      message: 'Fájl sikeresen feltöltve',
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Invoice file upload hiba:', error);
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, message: 'Hiba a fájl feltöltésekor' });
  }
};

// ============================================
// EXPORT TO FOLDER (ZIP)
// ============================================

const PAYMENT_STATUS_LABELS = {
  pending: 'Függőben',
  paid: 'Fizetve',
  overdue: 'Lejárt',
  cancelled: 'Sztornó',
};

const MONTHS_HU = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

function sanitizeFileName(name) {
  return (name || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 60)
    .trim();
}

function fmtDate(val) {
  if (!val) return '';
  return new Date(val).toLocaleDateString('hu-HU');
}

function generateInvoiceFileName(invoice, index, format) {
  const num = String(index + 1).padStart(3, '0');
  const ext = invoice.file_path ? path.extname(invoice.file_path) : '.pdf';
  const invoiceNum = sanitizeFileName(invoice.invoice_number || 'N-A');
  const vendor = sanitizeFileName(invoice.vendor_name || 'ismeretlen');
  const ccName = sanitizeFileName(invoice.cost_center_name || 'egyeb');
  const date = invoice.invoice_date
    ? new Date(invoice.invoice_date).toISOString().substring(0, 10).replace(/-/g, '')
    : 'nodate';

  switch (format) {
    case 'vendor':
      return `${invoiceNum}_${vendor}${ext}`;
    case 'date':
      return `${date}_${invoiceNum}${ext}`;
    case 'detailed':
    default:
      return `${num}_${ccName}_${invoiceNum}${ext}`;
  }
}

const exportToFolder = async (req, res) => {
  try {
    const {
      mode, year, month,
      costCenterId, dateFrom, dateTo,
      includeFiles = true, includeSummary = true,
      fileNamingFormat = 'detailed',
    } = req.body;

    if (!mode) {
      return res.status(400).json({ success: false, message: 'Export mód megadása kötelező' });
    }

    // Build filter query
    let sql = `
      SELECT i.*,
        cc.name AS cost_center_name, cc.code AS cost_center_code, cc.icon AS cost_center_icon,
        ic.name AS category_name, ic.icon AS category_icon
      FROM invoices i
      LEFT JOIN cost_centers cc ON i.cost_center_id = cc.id
      LEFT JOIN invoice_categories ic ON i.category_id = ic.id
      WHERE 1=1`;
    const params = [];
    let paramIdx = 0;

    if (mode === 'monthly') {
      if (!year || !month) {
        return res.status(400).json({ success: false, message: 'Év és hónap megadása kötelező' });
      }
      paramIdx++;
      sql += ` AND EXTRACT(YEAR FROM i.invoice_date) = $${paramIdx}`;
      params.push(year);
      paramIdx++;
      sql += ` AND EXTRACT(MONTH FROM i.invoice_date) = $${paramIdx}`;
      params.push(month);
    } else if (mode === 'cost_center') {
      if (!costCenterId) {
        return res.status(400).json({ success: false, message: 'Költséghely megadása kötelező' });
      }
      // Include descendants
      paramIdx++;
      sql += ` AND i.cost_center_id IN (
        WITH RECURSIVE subtree AS (
          SELECT id FROM cost_centers WHERE id = $${paramIdx}
          UNION ALL
          SELECT cc2.id FROM cost_centers cc2 JOIN subtree st ON cc2.parent_id = st.id
        )
        SELECT id FROM subtree
      )`;
      params.push(costCenterId);
      if (year) {
        paramIdx++;
        sql += ` AND EXTRACT(YEAR FROM i.invoice_date) = $${paramIdx}`;
        params.push(year);
      }
    } else if (mode === 'custom') {
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ success: false, message: 'Dátum tartomány megadása kötelező' });
      }
      paramIdx++;
      sql += ` AND i.invoice_date >= $${paramIdx}`;
      params.push(dateFrom);
      paramIdx++;
      sql += ` AND i.invoice_date <= $${paramIdx}`;
      params.push(dateTo);
    }

    sql += ' ORDER BY i.invoice_date ASC, i.invoice_number ASC';

    const result = await query(sql, params);
    const invoices = result.rows;

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nincs számla a megadott szűrőknek megfelelően',
      });
    }

    // Generate folder name
    let folderName;
    if (mode === 'monthly') {
      const monthStr = String(month).padStart(2, '0');
      const monthName = MONTHS_HU[month - 1] || '';
      folderName = `Szamlak_${year}_${monthStr}_${monthName.toLowerCase()}`;
    } else if (mode === 'cost_center') {
      const ccName = sanitizeFileName(invoices[0]?.cost_center_name || 'Koltsegyhely');
      folderName = `${ccName}_${year || new Date().getFullYear()}`;
    } else {
      folderName = `Szamlak_export_${dateFrom}_${dateTo}`;
    }

    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', (err) => {
      logger.error('Archiver hiba:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Hiba az archívum létrehozásakor' });
      }
    });

    archive.pipe(res);

    // Add invoice files to ZIP
    if (includeFiles) {
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        if (!inv.file_path) continue;

        const fullPath = path.join(__dirname, '..', '..', inv.file_path);
        if (fs.existsSync(fullPath)) {
          const zipFileName = generateInvoiceFileName(inv, i, fileNamingFormat);
          archive.file(fullPath, { name: `${folderName}/${zipFileName}` });
        }
      }
    }

    // Generate and add Excel summary
    if (includeSummary) {
      const excelData = invoices.map((inv, idx) => ({
        'Sorszám': idx + 1,
        'Számlaszám': inv.invoice_number || '',
        'Szállító': inv.vendor_name || '',
        'Szállító adószám': inv.vendor_tax_number || '',
        'Számla dátum': fmtDate(inv.invoice_date),
        'Fizetési határidő': fmtDate(inv.due_date),
        'Fizetés dátuma': fmtDate(inv.payment_date),
        'Nettó összeg': inv.amount ? parseFloat(inv.amount) : 0,
        'ÁFA összeg': inv.vat_amount ? parseFloat(inv.vat_amount) : 0,
        'Bruttó összeg': inv.total_amount ? parseFloat(inv.total_amount) : 0,
        'Pénznem': inv.currency || 'HUF',
        'Fizetési státusz': PAYMENT_STATUS_LABELS[inv.payment_status] || inv.payment_status,
        'Költséghely': inv.cost_center_name || '',
        'Költséghely kód': inv.cost_center_code || '',
        'Kategória': inv.category_name || '',
        'Leírás': inv.description || '',
        'Megjegyzés': inv.notes || '',
      }));

      // Add summary row
      const totalNet = invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      const totalVat = invoices.reduce((sum, inv) => sum + (parseFloat(inv.vat_amount) || 0), 0);
      const totalGross = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total_amount) || 0), 0);

      excelData.push({
        'Sorszám': '',
        'Számlaszám': '',
        'Szállító': 'ÖSSZESEN:',
        'Szállító adószám': '',
        'Számla dátum': '',
        'Fizetési határidő': '',
        'Fizetés dátuma': '',
        'Nettó összeg': totalNet,
        'ÁFA összeg': totalVat,
        'Bruttó összeg': totalGross,
        'Pénznem': '',
        'Fizetési státusz': '',
        'Költséghely': '',
        'Költséghely kód': '',
        'Kategória': '',
        'Leírás': `${invoices.length} db számla`,
        'Megjegyzés': '',
      });

      const ws = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      ws['!cols'] = [
        { wch: 8 }, { wch: 18 }, { wch: 25 }, { wch: 18 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 8 }, { wch: 14 }, { wch: 22 }, { wch: 12 },
        { wch: 16 }, { wch: 30 }, { wch: 20 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Számlák');
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      archive.append(excelBuffer, { name: `${folderName}/${folderName}_osszesito.xlsx` });
    }

    // Finalize ZIP
    await archive.finalize();

    logger.info('Invoice export to folder:', {
      mode, invoiceCount: invoices.length, folderName,
      userId: req.user?.id,
    });
  } catch (error) {
    logger.error('Export to folder hiba:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Hiba az export során' });
    }
  }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Cost Centers
  getAll,
  getTree,
  getById,
  create,
  update,
  remove,
  getAncestors,
  getDescendants,
  getBudgetSummary,
  move,
  // Invoice Categories
  getInvoiceCategories,
  createInvoiceCategory,
  updateInvoiceCategory,
  deleteInvoiceCategory,
  // Invoices
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getInvoiceStats,
  bulkInvoiceAction,
  uploadInvoiceFile,
  exportToFolder,
};
