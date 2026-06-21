/**
 * Billing config + runs (option C — per-client night rates).
 *   client_night_rates CRUD · per-worker billing_client (single + bulk) ·
 *   draft billing-run trigger · run/billings listing.
 * All admin-gated (settings.edit). The L1 ceiling is unchanged: this triggers
 * DRAFT runs only; finalize/invoice stays a separate human action.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const billingEngine = require('../services/billingEngine.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── client_night_rates CRUD ──────────────────────────────────────────────
const listRates = async (req, res) => {
  try {
    const r = await query(
      `SELECT cnr.*, c.name AS contractor_name, a.name AS accommodation_name
         FROM client_night_rates cnr
         JOIN contractors c ON c.id = cnr.contractor_id
         LEFT JOIN accommodations a ON a.id = cnr.accommodation_id
        ORDER BY c.name, a.name NULLS FIRST, cnr.valid_from DESC`
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { logger.error('[billing.listRates]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

const createRate = async (req, res) => {
  try {
    const { contractor_id, accommodation_id, rate_per_night, currency, valid_from, valid_to, notes } = req.body || {};
    if (!UUID_RE.test(contractor_id || '')) return res.status(400).json({ success: false, message: 'Ügyfél kötelező' });
    if (!(Number(rate_per_night) >= 0)) return res.status(400).json({ success: false, message: 'Érvénytelen díj' });
    if (!valid_from) return res.status(400).json({ success: false, message: 'Érvényesség kezdete kötelező' });
    const r = await query(
      `INSERT INTO client_night_rates (contractor_id, accommodation_id, rate_per_night, currency, valid_from, valid_to, notes, created_by)
       VALUES ($1,$2,$3,COALESCE($4,'HUF'),$5,$6,$7,$8) RETURNING id`,
      [contractor_id, accommodation_id || null, rate_per_night, currency || null, valid_from, valid_to || null, notes || null, req.user.id]
    );
    res.status(201).json({ success: true, data: { id: r.rows[0].id } });
  } catch (e) { logger.error('[billing.createRate]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

const updateRate = async (req, res) => {
  try {
    const { rate_per_night, currency, valid_from, valid_to, notes } = req.body || {};
    const r = await query(
      `UPDATE client_night_rates SET
         rate_per_night = COALESCE($2, rate_per_night),
         currency       = COALESCE($3, currency),
         valid_from     = COALESCE($4, valid_from),
         valid_to       = $5,
         notes          = $6,
         updated_at     = now()
       WHERE id = $1 RETURNING id`,
      [req.params.id, rate_per_night, currency || null, valid_from || null, valid_to || null, notes || null]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true });
  } catch (e) { logger.error('[billing.updateRate]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

const deleteRate = async (req, res) => {
  try {
    await query('DELETE FROM client_night_rates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { logger.error('[billing.deleteRate]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

// ── per-worker billing_client (who pays for housing) ─────────────────────
const setEmployeeClient = async (req, res) => {
  try {
    const { billing_client_id } = req.body || {};
    const r = await query(
      'UPDATE employees SET billing_client_id = $2, updated_at = NOW() WHERE id = $1 RETURNING id',
      [req.params.id, billing_client_id || null]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Munkavállaló nem található' });
    res.json({ success: true });
  } catch (e) { logger.error('[billing.setEmployeeClient]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

const bulkSetEmployeeClient = async (req, res) => {
  try {
    const { employee_ids, billing_client_id } = req.body || {};
    if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs kiválasztott munkavállaló' });
    }
    const r = await query(
      'UPDATE employees SET billing_client_id = $2, updated_at = NOW() WHERE id = ANY($1::uuid[])',
      [employee_ids, billing_client_id || null]
    );
    res.json({ success: true, data: { updated: r.rowCount } });
  } catch (e) { logger.error('[billing.bulkSetEmployeeClient]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

// ── draft billing run + listing ──────────────────────────────────────────
const runDraft = async (req, res) => {
  try {
    const month = (req.body && req.body.month) || '';
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ success: false, message: 'Hónap formátum: YYYY-MM' });
    const summary = await billingEngine.calculateMonthlyBilling(month, { createdBy: req.user.id, notes: '[manual draft]' });
    res.json({ success: true, data: summary });
  } catch (e) { logger.error('[billing.runDraft]', e.message); res.status(500).json({ success: false, message: e.message }); }
};

const listRuns = async (req, res) => {
  try {
    const r = await query(
      `SELECT id, billing_month, run_type, status, total_amount, partner_count, started_at, completed_at, notes
         FROM billing_runs ORDER BY billing_month DESC, started_at DESC LIMIT 50`
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { logger.error('[billing.listRuns]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

const getRunBillings = async (req, res) => {
  try {
    const r = await query(
      `SELECT ab.id, ab.billing_month, a.name AS accommodation, c.name AS client,
              ab.partner_contractor_id, ab.total_employee_days,
              ab.total_amount AS revenue, ab.cost_amount, ab.margin_amount,
              ab.status, ab.calculation_details
         FROM accommodation_billings ab
         JOIN accommodations a ON a.id = ab.accommodation_id
         LEFT JOIN contractors c ON c.id = ab.partner_contractor_id
        WHERE ab.billing_run_id = $1
        ORDER BY ab.margin_amount DESC NULLS LAST`,
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { logger.error('[billing.getRunBillings]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

module.exports = {
  listRates, createRate, updateRate, deleteRate,
  setEmployeeClient, bulkSetEmployeeClient,
  runDraft, listRuns, getRunBillings,
};
