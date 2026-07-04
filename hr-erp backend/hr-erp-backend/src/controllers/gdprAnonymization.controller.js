/**
 * GDPR anonymization — admin API. Anonymize actions are SUPERADMIN-only and
 * require an explicit confirm flag (the UI adds a typed double-confirm on top).
 */
const svc = require('../services/gdprAnonymization.service');
const { logger } = require('../utils/logger');

const REASONS = ['gdpr_request', 'retention_expiry'];

const getConfig = async (req, res) => {
  try { res.json({ success: true, data: await svc.getConfig() }); }
  catch { res.status(500).json({ success: false, message: 'Hiba a konfiguráció lekérésekor' }); }
};

const updateConfig = async (req, res) => {
  try {
    const { retention_grace_months, backup_retention_days, statutory_document_types, reminder_enabled } = req.body || {};
    if (retention_grace_months !== undefined && (!Number.isInteger(retention_grace_months) || retention_grace_months < 0)) {
      return res.status(400).json({ success: false, message: 'A türelmi idő nemnegatív egész szám legyen.' });
    }
    if (statutory_document_types !== undefined && !Array.isArray(statutory_document_types)) {
      return res.status(400).json({ success: false, message: 'A megőrzendő dokumentumtípusok lista legyen.' });
    }
    const cfg = await svc.setConfig({ retention_grace_months, backup_retention_days, statutory_document_types, reminder_enabled, updatedBy: req.user?.id });
    res.json({ success: true, data: cfg });
  } catch { res.status(500).json({ success: false, message: 'Hiba a konfiguráció mentésekor' }); }
};

const listProposals = async (req, res) => {
  try { res.json({ success: true, data: await svc.listProposals() }); }
  catch { res.status(500).json({ success: false, message: 'Hiba a javaslatok lekérésekor' }); }
};

// POST /preview { employeeIds: [...] } — dry-run for one or many (no mutation).
const preview = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : [];
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'Legalább egy munkavállaló szükséges.' });
    const reason = REASONS.includes(req.body?.reason) ? req.body.reason : 'gdpr_request';
    const plans = [];
    for (const id of ids) {
      const r = await svc.anonymizeEmployee(id, { dryRun: true, requestedBy: req.user?.id, reason });
      plans.push({ employeeId: id, ...r });
    }
    res.json({ success: true, data: { plans } });
  } catch (err) {
    logger.error('[gdpr.preview]', err.message);
    res.status(500).json({ success: false, message: 'Hiba az előnézet készítésekor' });
  }
};

// POST /execute { employeeIds, reason, confirm:true } — irreversible. Superadmin-only.
const execute = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : [];
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'Legalább egy munkavállaló szükséges.' });
    if (req.body?.confirm !== true) return res.status(400).json({ success: false, message: 'Megerősítés szükséges (confirm).' });
    const reason = REASONS.includes(req.body?.reason) ? req.body.reason : 'gdpr_request';
    const results = [];
    for (const id of ids) {
      const r = await svc.anonymizeEmployee(id, { dryRun: false, requestedBy: req.user?.id, reason });
      results.push({ employeeId: id, ...r });
    }
    // Loud errors: success is TRUE only if EVERY erasure fully completed (DB +
    // all files). Any ok:false (e.g. a file that failed to unlink, or a
    // skipped table) is surfaced with a 207-style partial flag so the SPA can
    // stop showing a green "done" over an incomplete erasure.
    const failed = results.filter((r) => r.ok !== true);
    if (failed.length > 0) {
      return res.status(207).json({
        success: false,
        partial: true,
        message: `${failed.length}/${results.length} anonimizálás NEM fejeződött be maradéktalanul (fájl vagy tábla kimaradt). Nézze meg a részleteket.`,
        data: { results, failed },
      });
    }
    res.json({ success: true, data: { results } });
  } catch (err) {
    logger.error('[gdpr.execute]', err.message);
    res.status(500).json({ success: false, message: 'Hiba az anonimizálás során' });
  }
};

const getLogs = async (req, res) => {
  try { res.json({ success: true, data: { logs: await svc.getLogs() } }); }
  catch { res.status(500).json({ success: false, message: 'Hiba a napló lekérésekor' }); }
};

// POST /consent { employeeId } — record data-processing consent (HR admins).
const recordConsent = async (req, res) => {
  try {
    const employeeId = req.body?.employeeId;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId szükséges.' });
    const r = await svc.recordConsent(employeeId, req.user?.id);
    if (!r) return res.status(404).json({ success: false, message: 'Munkavállaló nem található vagy már anonimizált.' });
    res.json({ success: true, data: { data_consent_at: r.data_consent_at } });
  } catch { res.status(500).json({ success: false, message: 'Hiba a hozzájárulás rögzítésekor' }); }
};

module.exports = { getConfig, updateConfig, listProposals, preview, execute, getLogs, recordConsent };
