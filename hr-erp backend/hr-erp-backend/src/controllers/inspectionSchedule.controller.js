/**
 * Inspection Schedule Controller
 *
 * Per-accommodation recurring inspection plan. The automation cron reads
 * schedules where `next_due_date <= CURRENT_DATE` and auto-creates draft
 * inspections assigned to the default inspector.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const VALID_FREQ = ['weekly', 'monthly', 'quarterly', 'yearly'];

/** Compute next due date from last completed + frequency (PostgreSQL-side is cleaner). */
const FREQ_INTERVAL = {
  weekly: "INTERVAL '7 days'",
  monthly: "INTERVAL '1 month'",
  quarterly: "INTERVAL '3 months'",
  yearly: "INTERVAL '1 year'",
};

const list = async (req, res) => {
  try {
    const { accommodation_id, active } = req.query;
    const clauses = [];
    const params = [];
    if (accommodation_id) { params.push(accommodation_id); clauses.push(`s.accommodation_id = $${params.length}`); }
    if (active !== undefined) { params.push(active !== 'false'); clauses.push(`s.is_active = $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const r = await query(
      `SELECT s.*,
              a.name AS accommodation_name,
              u.first_name || ' ' || u.last_name AS inspector_name
       FROM inspection_schedules s
       LEFT JOIN accommodations a ON s.accommodation_id = a.id
       LEFT JOIN users u ON s.default_inspector_id = u.id
       ${where}
       ORDER BY s.next_due_date NULLS LAST, s.created_at DESC`,
      params
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    logger.error('[schedule.list]', err);
    res.status(500).json({ success: false, message: 'Ütemezések lekérési hiba' });
  }
};

/** GET /api/v1/inspection-schedules/upcoming — next 30 days */
const upcoming = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 180);
    const r = await query(
      `SELECT s.*,
              a.name AS accommodation_name,
              u.first_name || ' ' || u.last_name AS inspector_name
       FROM inspection_schedules s
       LEFT JOIN accommodations a ON s.accommodation_id = a.id
       LEFT JOIN users u ON s.default_inspector_id = u.id
       WHERE s.is_active = true
         AND s.next_due_date IS NOT NULL
         AND s.next_due_date <= CURRENT_DATE + $1::INTEGER
       ORDER BY s.next_due_date ASC`,
      [days]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    logger.error('[schedule.upcoming]', err);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
};

const create = async (req, res) => {
  try {
    const { accommodation_id, frequency, next_due_date, default_inspector_id } = req.body;
    if (!accommodation_id || !frequency) {
      return res.status(400).json({ success: false, message: 'accommodation_id és frequency kötelező' });
    }
    if (!VALID_FREQ.includes(frequency)) {
      return res.status(400).json({ success: false, message: `frequency egyike: ${VALID_FREQ.join(', ')}` });
    }
    const r = await query(
      `INSERT INTO inspection_schedules
         (accommodation_id, frequency, next_due_date, default_inspector_id, created_by)
       VALUES ($1, $2, COALESCE($3::DATE, CURRENT_DATE), $4, $5)
       RETURNING *`,
      [accommodation_id, frequency, next_due_date || null, default_inspector_id || null, req.user?.id || null]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    logger.error('[schedule.create]', err);
    res.status(500).json({ success: false, message: 'Ütemezés létrehozási hiba' });
  }
};

const update = async (req, res) => {
  try {
    const { frequency, next_due_date, default_inspector_id, is_active } = req.body;
    if (frequency && !VALID_FREQ.includes(frequency)) {
      return res.status(400).json({ success: false, message: `frequency egyike: ${VALID_FREQ.join(', ')}` });
    }
    const r = await query(
      `UPDATE inspection_schedules SET
         frequency = COALESCE($1, frequency),
         next_due_date = COALESCE($2::DATE, next_due_date),
         default_inspector_id = COALESCE($3, default_inspector_id),
         is_active = COALESCE($4, is_active),
         updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [frequency, next_due_date, default_inspector_id, is_active, req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ütemezés nem található' });
    }
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    logger.error('[schedule.update]', err);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
};

const remove = async (req, res) => {
  try {
    // soft-delete via is_active (preserves history + FK integrity with inspections)
    const r = await query(
      `UPDATE inspection_schedules SET is_active = false WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ütemezés nem található' });
    }
    res.json({ success: true, message: 'Ütemezés inaktiválva' });
  } catch (err) {
    logger.error('[schedule.remove]', err);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
};

module.exports = { list, upcoming, create, update, remove, FREQ_INTERVAL, VALID_FREQ };
