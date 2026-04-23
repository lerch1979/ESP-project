/**
 * Workplace controller — CRUD over the canonical workplaces list used by
 * the employee filter dropdown and the admin manager page.
 *
 * employees.workplace remains a free-text column; this table is just the
 * source of truth for dropdown choices and active/inactive toggling.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const list = async (req, res) => {
  try {
    const activeOnly = req.query.active !== 'false' && req.query.active !== undefined
      ? req.query.active === 'true'
      : false; // default: return everything for admin UI
    const sql = activeOnly
      ? `SELECT id, name, is_active, created_at, updated_at FROM workplaces WHERE is_active = TRUE ORDER BY name`
      : `SELECT id, name, is_active, created_at, updated_at FROM workplaces ORDER BY name`;
    const result = await query(sql);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[workplace.list]', err);
    res.status(500).json({ success: false, message: 'Munkahely lista lekérési hiba' });
  }
};

const create = async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'A név kötelező' });
    const isActive = req.body?.is_active !== false;
    const result = await query(
      `INSERT INTO workplaces (name, is_active) VALUES ($1, $2) RETURNING *`,
      [name, isActive]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ilyen nevű munkahely már létezik' });
    }
    logger.error('[workplace.create]', err);
    res.status(500).json({ success: false, message: 'Munkahely létrehozási hiba' });
  }
};

const update = async (req, res) => {
  try {
    const fields = [];
    const values = [];
    let i = 1;
    if (req.body?.name !== undefined) {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ success: false, message: 'A név nem lehet üres' });
      fields.push(`name = $${i++}`); values.push(name);
    }
    if (req.body?.is_active !== undefined) {
      fields.push(`is_active = $${i++}`); values.push(!!req.body.is_active);
    }
    if (fields.length === 0) return res.status(400).json({ success: false, message: 'Nincs módosítandó mező' });
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    const result = await query(
      `UPDATE workplaces SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Munkahely nem található' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ilyen nevű munkahely már létezik' });
    }
    logger.error('[workplace.update]', err);
    res.status(500).json({ success: false, message: 'Munkahely frissítési hiba' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await query(`DELETE FROM workplaces WHERE id = $1`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Munkahely nem található' });
    res.json({ success: true });
  } catch (err) {
    logger.error('[workplace.remove]', err);
    res.status(500).json({ success: false, message: 'Munkahely törlési hiba' });
  }
};

module.exports = { list, create, update, remove };
