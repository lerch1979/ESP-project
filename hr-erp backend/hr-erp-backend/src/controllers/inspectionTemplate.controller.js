/**
 * Inspection Template Controller
 *
 * Admin-only CRUD for the inspection checklist structure:
 *   - inspection_categories (Technical/Hygiene/Aesthetic)
 *   - inspection_checklist_items (per-category line items)
 *
 * These are lookup tables — small, rarely changing. The `_active_` filter
 * defaults to true so the inspector mobile app only sees live items.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// ─── Categories ─────────────────────────────────────────────────────

const listCategories = async (req, res) => {
  try {
    const onlyActive = req.query.active !== 'false';
    const r = await query(
      `SELECT * FROM inspection_categories
       ${onlyActive ? 'WHERE is_active = true' : ''}
       ORDER BY sort_order, name`
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    logger.error('[tpl.listCategories]', err);
    res.status(500).json({ success: false, message: 'Kategória lekérési hiba' });
  }
};

const createCategory = async (req, res) => {
  try {
    const { code, name, max_points, weight, icon, sort_order } = req.body;
    if (!code || !name || !max_points) {
      return res.status(400).json({ success: false, message: 'code, name, max_points kötelező' });
    }
    const r = await query(
      `INSERT INTO inspection_categories (code, name, max_points, weight, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [code, name, max_points, weight || 1.0, icon || null, sort_order || 0]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ez a kód már létezik' });
    }
    logger.error('[tpl.createCategory]', err);
    res.status(500).json({ success: false, message: 'Kategória létrehozási hiba' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { name, max_points, weight, icon, sort_order, is_active } = req.body;
    const r = await query(
      `UPDATE inspection_categories SET
         name = COALESCE($1, name),
         max_points = COALESCE($2, max_points),
         weight = COALESCE($3, weight),
         icon = COALESCE($4, icon),
         sort_order = COALESCE($5, sort_order),
         is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING *`,
      [name, max_points, weight, icon, sort_order, is_active, req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategória nem található' });
    }
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    logger.error('[tpl.updateCategory]', err);
    res.status(500).json({ success: false, message: 'Kategória frissítési hiba' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const r = await query(
      `UPDATE inspection_categories SET is_active = false WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategória nem található' });
    }
    res.json({ success: true, message: 'Kategória inaktiválva' });
  } catch (err) {
    logger.error('[tpl.deleteCategory]', err);
    res.status(500).json({ success: false, message: 'Inaktiválási hiba' });
  }
};

// ─── Checklist items ────────────────────────────────────────────────

const listItems = async (req, res) => {
  try {
    const { category_id, active } = req.query;
    const onlyActive = active !== 'false';
    const clauses = [];
    const params = [];
    if (onlyActive) clauses.push('ci.is_active = true');
    if (category_id) {
      params.push(category_id);
      clauses.push(`ci.category_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const r = await query(
      `SELECT ci.*, c.code AS category_code, c.name AS category_name
       FROM inspection_checklist_items ci
       LEFT JOIN inspection_categories c ON ci.category_id = c.id
       ${where}
       ORDER BY c.sort_order, ci.sort_order`,
      params
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    logger.error('[tpl.listItems]', err);
    res.status(500).json({ success: false, message: 'Ellenőrzési tételek lekérési hiba' });
  }
};

const createItem = async (req, res) => {
  try {
    const { category_id, code, name, description, max_points, required_photo, sort_order } = req.body;
    if (!category_id || !code || !name || !max_points) {
      return res.status(400).json({ success: false, message: 'category_id, code, name, max_points kötelező' });
    }
    const r = await query(
      `INSERT INTO inspection_checklist_items
         (category_id, code, name, description, max_points, required_photo, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [category_id, code, name, description || null, max_points, required_photo || false, sort_order || 0]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ez a kód már létezik' });
    }
    logger.error('[tpl.createItem]', err);
    res.status(500).json({ success: false, message: 'Tétel létrehozási hiba' });
  }
};

const updateItem = async (req, res) => {
  try {
    const { category_id, name, description, max_points, required_photo, sort_order, is_active } = req.body;
    const r = await query(
      `UPDATE inspection_checklist_items SET
         category_id = COALESCE($1, category_id),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         max_points = COALESCE($4, max_points),
         required_photo = COALESCE($5, required_photo),
         sort_order = COALESCE($6, sort_order),
         is_active = COALESCE($7, is_active)
       WHERE id = $8
       RETURNING *`,
      [category_id, name, description, max_points, required_photo, sort_order, is_active, req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tétel nem található' });
    }
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    logger.error('[tpl.updateItem]', err);
    res.status(500).json({ success: false, message: 'Tétel frissítési hiba' });
  }
};

const deleteItem = async (req, res) => {
  try {
    const r = await query(
      `UPDATE inspection_checklist_items SET is_active = false WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tétel nem található' });
    }
    res.json({ success: true, message: 'Tétel inaktiválva' });
  } catch (err) {
    logger.error('[tpl.deleteItem]', err);
    res.status(500).json({ success: false, message: 'Inaktiválási hiba' });
  }
};

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listItems, createItem, updateItem, deleteItem,
};
