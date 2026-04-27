/**
 * Admin CRUD for worker_specializations.
 *
 * Each row links a user to a specialization slug ("plumbing", "gas", ...)
 * which the workerAssignment service uses to auto-assign new tickets.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { SPECIALIZATIONS, SPEC_SLUGS } = require('../services/workerAssignment.service');

// GET /api/v1/worker-specializations/types — canonical list for the admin UI
async function listTypes(req, res) {
  res.json({ success: true, data: { types: SPECIALIZATIONS } });
}

// GET /api/v1/worker-specializations
//   query: specialization, user_id, is_active
async function list(req, res) {
  try {
    const { specialization, user_id, is_active } = req.query;
    const params = [];
    const where = [];

    if (specialization) {
      params.push(specialization);
      where.push(`ws.specialization = $${params.length}`);
    }
    if (user_id) {
      params.push(user_id);
      where.push(`ws.user_id = $${params.length}`);
    }
    if (is_active === 'true' || is_active === 'false') {
      params.push(is_active === 'true');
      where.push(`ws.is_active = $${params.length}`);
    }
    // Scope to caller's contractor (admin can see all if contractorId is null)
    if (req.user?.contractorId) {
      params.push(req.user.contractorId);
      where.push(`u.contractor_id = $${params.length}`);
    }

    const sql = `
      SELECT ws.id, ws.user_id, ws.specialization, ws.is_active, ws.is_primary,
             ws.certification_expiry, ws.notes, ws.created_at, ws.updated_at,
             u.first_name, u.last_name, u.email, u.contractor_id
      FROM worker_specializations ws
      JOIN users u ON u.id = ws.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST, ws.specialization
    `;
    const r = await query(sql, params);
    res.json({ success: true, data: { specializations: r.rows } });
  } catch (err) {
    logger.error('[workerSpec.list]', err.message);
    res.status(500).json({ success: false, message: 'Lekérési hiba' });
  }
}

// POST /api/v1/worker-specializations
//   body: { user_id, specialization, is_primary?, certification_expiry?, notes? }
async function create(req, res) {
  try {
    const { user_id, specialization, is_primary, certification_expiry, notes } = req.body || {};
    if (!user_id || !specialization) {
      return res.status(400).json({ success: false, message: 'user_id és specialization kötelező' });
    }
    if (!SPEC_SLUGS.has(specialization)) {
      return res.status(400).json({ success: false, message: 'Ismeretlen specialization' });
    }
    const r = await query(
      `INSERT INTO worker_specializations
         (user_id, specialization, is_active, is_primary, certification_expiry, notes)
       VALUES ($1, $2, TRUE, $3, $4, $5)
       ON CONFLICT (user_id, specialization)
         DO UPDATE SET is_active = TRUE,
                       is_primary = EXCLUDED.is_primary,
                       certification_expiry = EXCLUDED.certification_expiry,
                       notes = EXCLUDED.notes,
                       updated_at = NOW()
       RETURNING *`,
      [user_id, specialization, !!is_primary, certification_expiry || null, notes || null]
    );
    res.status(201).json({ success: true, data: { specialization: r.rows[0] } });
  } catch (err) {
    logger.error('[workerSpec.create]', err.message);
    res.status(500).json({ success: false, message: 'Létrehozási hiba' });
  }
}

// PATCH /api/v1/worker-specializations/:id
async function update(req, res) {
  try {
    const { id } = req.params;
    const { is_active, is_primary, certification_expiry, notes, specialization } = req.body || {};
    const sets = [];
    const params = [];

    if (typeof is_active === 'boolean')                       { params.push(is_active);             sets.push(`is_active = $${params.length}`); }
    if (typeof is_primary === 'boolean')                      { params.push(is_primary);            sets.push(`is_primary = $${params.length}`); }
    if (certification_expiry !== undefined)                   { params.push(certification_expiry); sets.push(`certification_expiry = $${params.length}`); }
    if (notes !== undefined)                                  { params.push(notes);                 sets.push(`notes = $${params.length}`); }
    if (specialization !== undefined) {
      if (!SPEC_SLUGS.has(specialization)) {
        return res.status(400).json({ success: false, message: 'Ismeretlen specialization' });
      }
      params.push(specialization); sets.push(`specialization = $${params.length}`);
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs frissítendő mező' });
    }
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const r = await query(
      `UPDATE worker_specializations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true, data: { specialization: r.rows[0] } });
  } catch (err) {
    logger.error('[workerSpec.update]', err.message);
    res.status(500).json({ success: false, message: 'Frissítési hiba' });
  }
}

// DELETE /api/v1/worker-specializations/:id
async function remove(req, res) {
  try {
    const { id } = req.params;
    const r = await query(`DELETE FROM worker_specializations WHERE id = $1`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true });
  } catch (err) {
    logger.error('[workerSpec.remove]', err.message);
    res.status(500).json({ success: false, message: 'Törlési hiba' });
  }
}

module.exports = { listTypes, list, create, update, remove };
