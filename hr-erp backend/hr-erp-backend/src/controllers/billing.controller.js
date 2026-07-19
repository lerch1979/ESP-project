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
    const {
      contractor_id, accommodation_id, billing_basis = 'per_person',
      rate_per_night, flat_amount, vat_rate = 0.27, vat_exempt = false, currency, valid_from, valid_to, notes,
    } = req.body || {};
    if (!UUID_RE.test(contractor_id || '')) return res.status(400).json({ success: false, message: 'Ügyfél kötelező' });
    if (!['per_person', 'flat'].includes(billing_basis)) return res.status(400).json({ success: false, message: 'Érvénytelen számlázási alap' });
    if (billing_basis === 'per_person' && !(Number(rate_per_night) >= 0)) return res.status(400).json({ success: false, message: 'Érvénytelen díj/fő/éj' });
    if (billing_basis === 'flat') {
      if (!UUID_RE.test(accommodation_id || '')) return res.status(400).json({ success: false, message: 'Átalánydíjhoz szállás kötelező' });
      if (!(Number(flat_amount) >= 0)) return res.status(400).json({ success: false, message: 'Érvénytelen átalánydíj' });
    }
    const exempt = vat_exempt === true || vat_exempt === 'true';
    const vr = exempt ? 0 : Number(vat_rate);
    if (!exempt && !(vr >= 0 && vr <= 1)) return res.status(400).json({ success: false, message: 'ÁFA 0 és 1 közötti tört (pl. 0.27)' });
    if (!valid_from) return res.status(400).json({ success: false, message: 'Érvényesség kezdete kötelező' });
    if (valid_to && valid_to < valid_from) return res.status(400).json({ success: false, message: 'Érvényesség vége nem lehet a kezdet előtt' });
    const r = await query(
      `INSERT INTO client_night_rates
         (contractor_id, accommodation_id, billing_basis, rate_per_night, flat_amount, vat_rate, vat_exempt, currency, valid_from, valid_to, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'HUF'),$9,$10,$11,$12) RETURNING id`,
      [contractor_id, accommodation_id || null, billing_basis,
       billing_basis === 'per_person' ? rate_per_night : null,
       billing_basis === 'flat' ? flat_amount : null,
       vr, exempt, currency || null, valid_from, valid_to || null, notes || null, req.user.id]
    );
    res.status(201).json({ success: true, data: { id: r.rows[0].id } });
  } catch (e) { logger.error('[billing.createRate]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

const updateRate = async (req, res) => {
  try {
    const { rate_per_night, flat_amount, vat_rate, currency, valid_from, valid_to, notes } = req.body || {};
    if (vat_rate != null && !(Number(vat_rate) >= 0 && Number(vat_rate) <= 1)) {
      return res.status(400).json({ success: false, message: 'ÁFA 0 és 1 közötti tört' });
    }
    const r = await query(
      `UPDATE client_night_rates SET
         rate_per_night = COALESCE($2, rate_per_night),
         flat_amount    = COALESCE($3, flat_amount),
         vat_rate       = COALESCE($4, vat_rate),
         currency       = COALESCE($5, currency),
         valid_from     = COALESCE($6, valid_from),
         valid_to       = $7,
         notes          = $8,
         updated_at     = now()
       WHERE id = $1 RETURNING id`,
      [req.params.id, rate_per_night ?? null, flat_amount ?? null, vat_rate ?? null,
       currency || null, valid_from || null, valid_to || null, notes || null]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true });
  } catch (e) { logger.error('[billing.updateRate]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

// ── per-CLIENT billing profile (invoicing on/off · legal type · VAT-exempt reason) ──
const listProfiles = async (req, res) => {
  try {
    const r = await query(
      `SELECT c.id AS contractor_id, c.name AS contractor_name,
              p.invoicing_enabled, p.legal_type, p.vat_exemption_reason, p.notes,
              (p.contractor_id IS NOT NULL) AS profile_set
         FROM contractors c
         LEFT JOIN client_billing_profiles p ON p.contractor_id = c.id
        WHERE c.is_active = true
        ORDER BY c.name`
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { logger.error('[billing.listProfiles]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};
const upsertProfile = async (req, res) => {
  try {
    const contractorId = req.params.contractorId;
    if (!UUID_RE.test(contractorId || '')) return res.status(400).json({ success: false, message: 'Ügyfél kötelező' });
    const { invoicing_enabled = true, legal_type = 'company', vat_exemption_reason, notes } = req.body || {};
    if (!['company', 'private'].includes(legal_type)) return res.status(400).json({ success: false, message: 'Érvénytelen jogi típus' });
    if (vat_exemption_reason && !['alanyi', 'targyi'].includes(vat_exemption_reason)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen adómentesség-jogcím' });
    }
    await query(
      `INSERT INTO client_billing_profiles (contractor_id, invoicing_enabled, legal_type, vat_exemption_reason, notes, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (contractor_id) DO UPDATE SET
         invoicing_enabled = EXCLUDED.invoicing_enabled,
         legal_type        = EXCLUDED.legal_type,
         vat_exemption_reason = EXCLUDED.vat_exemption_reason,
         notes             = EXCLUDED.notes,
         updated_by        = EXCLUDED.updated_by,
         updated_at        = now()`,
      [contractorId, invoicing_enabled === true || invoicing_enabled === 'true', legal_type, vat_exemption_reason || null, notes || null, req.user.id]
    );
    res.json({ success: true });
  } catch (e) { logger.error('[billing.upsertProfile]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

// ── coverage: which client×accommodation combos would bill $0 / mis-bill ──
const RATE_MONTH_RE = /^\d{4}-\d{2}$/;
const rateCoverage = async (req, res) => {
  try {
    const month = req.query.month;
    if (!RATE_MONTH_RE.test(month || '')) return res.status(400).json({ success: false, message: 'month: YYYY-MM' });
    const groups = (await query(
      `SELECT DISTINCT os.accommodation_id, e.billing_client_id,
              a.name AS accommodation_name, c.name AS client_name
         FROM occupancy_snapshots os
         JOIN employees e ON e.id = os.employee_id
         JOIN accommodations a ON a.id = os.accommodation_id
         LEFT JOIN contractors c ON c.id = e.billing_client_id
        WHERE TO_CHAR(os.snapshot_date, 'YYYY-MM') = $1`, [month])).rows;
    const rates = (await query(
      `SELECT contractor_id, accommodation_id, billing_basis, rate_per_night, flat_amount, vat_rate, vat_exempt,
              TO_CHAR(valid_from,'YYYY-MM-DD') AS valid_from, TO_CHAR(valid_to,'YYYY-MM-DD') AS valid_to
         FROM client_night_rates`)).rows;
    const resolve = billingEngine.makeRateResolver(rates);
    const profiles = new Map();
    for (const p of (await query(`SELECT contractor_id, invoicing_enabled, legal_type FROM client_billing_profiles`)).rows) profiles.set(p.contractor_id, p);
    const midMonth = `${month}-15`;

    const issues = [];      // per client×accommodation gaps that WOULD mis-bill
    const skipped = [];     // clients intentionally not invoiced (informational, not a gap)
    const seenClient = new Set();
    for (const g of groups) {
      if (!g.billing_client_id) { issues.push({ type: 'no_billing_client', accommodation_name: g.accommodation_name }); continue; }
      const prof = profiles.get(g.billing_client_id);
      // Client-level flags — once per client.
      if (!seenClient.has(g.billing_client_id)) {
        seenClient.add(g.billing_client_id);
        if (!prof) issues.push({ type: 'no_profile', client_name: g.client_name });
        else if (prof.invoicing_enabled === false) skipped.push({ client_name: g.client_name, label: 'kihagyva (szándékos)' });
      }
      // Rate gap only matters for clients we DO invoice.
      if (!(prof && prof.invoicing_enabled === false)) {
        if (!resolve(g.billing_client_id, g.accommodation_id, midMonth)) {
          issues.push({ type: 'no_rate', accommodation_name: g.accommodation_name, client_name: g.client_name });
        }
      }
    }
    res.json({ success: true, data: { month, issues, skipped } });
  } catch (e) { logger.error('[billing.rateCoverage]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};

// ── per-accommodation utilities-billing flag ──
const listAccommodationsUtil = async (req, res) => {
  try {
    const r = await query(`SELECT id, name, utilities_billing FROM accommodations WHERE is_active = true ORDER BY name`);
    res.json({ success: true, data: r.rows });
  } catch (e) { logger.error('[billing.listAccUtil]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
};
const setUtilities = async (req, res) => {
  try {
    const { utilities_billing } = req.body || {};
    if (!['we_pay', 'included', 'billed_separately'].includes(utilities_billing)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen rezsi-kezelés' });
    }
    const r = await query(`UPDATE accommodations SET utilities_billing = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [req.params.id, utilities_billing]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true });
  } catch (e) { logger.error('[billing.setUtilities]', e.message); res.status(500).json({ success: false, message: 'Hiba' }); }
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
              ab.total_amount AS revenue, ab.vat_amount, ab.gross_amount,
              ab.cost_amount, ab.margin_amount,
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
  listProfiles, upsertProfile,
  rateCoverage, listAccommodationsUtil, setUtilities,
  setEmployeeClient, bulkSetEmployeeClient,
  runDraft, listRuns, getRunBillings,
};
