/**
 * Expiry monitor — admin API (config toggle, threshold rules CRUD, summary, manual run).
 * All routes are admin-gated (see routes file). Reads/writes the migration-120 tables
 * and delegates evaluation to expiryMonitor.service.
 */
const { query } = require('../database/connection');
const svc = require('../services/expiryMonitor.service');
const { logger } = require('../utils/logger');

const VALID_FIELDS = ['visa', 'contract', 'document', '*'];

// thresholds must be positive, distinct, strictly descending integers.
function validateRule(body) {
  const errors = [];
  const field = body.field || '*';
  if (!VALID_FIELDS.includes(field)) errors.push('Érvénytelen mező (field).');

  const thresholds = body.thresholds;
  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    errors.push('Legalább egy küszöbérték szükséges.');
  } else {
    if (!thresholds.every((t) => Number.isInteger(t) && t > 0)) {
      errors.push('A küszöbértékek pozitív egész számok legyenek.');
    } else {
      if (new Set(thresholds).size !== thresholds.length) errors.push('A küszöbértékek nem ismétlődhetnek.');
      const desc = [...thresholds].sort((a, b) => b - a);
      if (thresholds.some((t, i) => t !== desc[i])) errors.push('A küszöbértékek csökkenő sorrendben legyenek.');
    }
  }

  let nationality = body.nationality;
  if (nationality === '' || nationality === undefined) nationality = null;
  if (nationality != null && !/^[A-Za-z]{2}$/.test(nationality)) errors.push('A nemzetiség 2 betűs ISO kód legyen (pl. PH, UA).');

  let documentType = body.document_type;
  if (documentType === '' || documentType === undefined) documentType = null;

  let contractorId = body.contractor_id;
  if (contractorId === '' || contractorId === undefined) contractorId = null;

  return {
    errors,
    value: {
      field,
      nationality: nationality ? nationality.toUpperCase() : null,
      document_type: documentType,
      contractor_id: contractorId,
      thresholds,
      include_overdue: body.include_overdue !== false,
    },
  };
}

// GET /expiry-monitor/config
const getConfig = async (req, res) => {
  try {
    const c = await svc.getConfig();
    res.json({ success: true, data: { enabled: c.enabled, digest_enabled: c.digest_enabled, updated_at: c.updated_at } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a konfiguráció lekérésekor' });
  }
};

// PUT /expiry-monitor/config  { enabled?, digest_enabled? }
const updateConfig = async (req, res) => {
  try {
    const { enabled, digest_enabled } = req.body || {};
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'enabled boolean legyen' });
    }
    if (digest_enabled !== undefined && typeof digest_enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'digest_enabled boolean legyen' });
    }
    const c = await svc.setConfig({ enabled, digest_enabled, updatedBy: req.user?.id });
    res.json({ success: true, data: { enabled: c.enabled, digest_enabled: c.digest_enabled, updated_at: c.updated_at } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a konfiguráció mentésekor' });
  }
};

// GET /expiry-monitor/rules
const listRules = async (req, res) => {
  try {
    const r = await query(
      `SELECT id, field, nationality, document_type, contractor_id, thresholds,
              include_overdue, is_active, created_at, updated_at
         FROM expiry_threshold_rules
        ORDER BY (nationality IS NOT NULL) DESC, (document_type IS NOT NULL) DESC, created_at ASC`
    );
    res.json({ success: true, data: { rules: r.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a szabályok lekérésekor' });
  }
};

// POST /expiry-monitor/rules
const createRule = async (req, res) => {
  try {
    const { errors, value } = validateRule(req.body || {});
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });
    const r = await query(
      `INSERT INTO expiry_threshold_rules (field, nationality, document_type, contractor_id, thresholds, include_overdue, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [value.field, value.nationality, value.document_type, value.contractor_id, value.thresholds, value.include_overdue, req.user?.id || null]
    );
    res.status(201).json({ success: true, data: { rule: r.rows[0] } });
  } catch (err) {
    logger.error('[expiryMonitor.createRule]', err.message);
    res.status(500).json({ success: false, message: 'Hiba a szabály létrehozásakor' });
  }
};

// PUT /expiry-monitor/rules/:id
const updateRule = async (req, res) => {
  try {
    const { errors, value } = validateRule(req.body || {});
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });
    const r = await query(
      `UPDATE expiry_threshold_rules
          SET field = $1, nationality = $2, document_type = $3, contractor_id = $4,
              thresholds = $5, include_overdue = $6,
              is_active = COALESCE($7, is_active), updated_at = NOW()
        WHERE id = $8 RETURNING *`,
      [value.field, value.nationality, value.document_type, value.contractor_id, value.thresholds, value.include_overdue,
       typeof req.body.is_active === 'boolean' ? req.body.is_active : null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Szabály nem található' });
    res.json({ success: true, data: { rule: r.rows[0] } });
  } catch (err) {
    logger.error('[expiryMonitor.updateRule]', err.message);
    res.status(500).json({ success: false, message: 'Hiba a szabály módosításakor' });
  }
};

// DELETE /expiry-monitor/rules/:id
const deleteRule = async (req, res) => {
  try {
    const r = await query('DELETE FROM expiry_threshold_rules WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Szabály nem található' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a szabály törlésekor' });
  }
};

// GET /expiry-monitor/summary  (dashboard widget; { enabled:false } when toggled off)
const getSummary = async (req, res) => {
  try {
    const data = await svc.getSummary();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba az összesítő lekérésekor' });
  }
};

// POST /expiry-monitor/run  (manual trigger; force runs even if toggled off, for testing)
const runNow = async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await svc.runDaily({ force });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a futtatáskor' });
  }
};

module.exports = { getConfig, updateConfig, listRules, createRule, updateRule, deleteRule, getSummary, runNow };
