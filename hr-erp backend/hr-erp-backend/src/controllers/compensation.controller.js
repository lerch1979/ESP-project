/**
 * Compensation Controller — thin HTTP wrapper around compensation.service.
 */
const svc = require('../services/compensation.service');
const pdfSvc = require('../services/inspectionPDF.service');
const { logger } = require('../utils/logger');
const { isDeductionExecutionEnabled, DEDUCTION_DISABLED_MESSAGE } = require('../config/deductionExecution');

// Contractor scope: superadmin sees all; everyone else only their own contractor's
// (owning contractor = the accommodation's current_contractor_id). DEEP_AUDIT finding 1.
const scopeOf = (req) => ({ all: !!req.user.roles?.includes('superadmin'), contractorId: req.user.contractorId });

const list = async (req, res) => {
  try {
    const result = await svc.listCompensations(req.query, scopeOf(req));
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[compensation.list]', err);
    res.status(500).json({ success: false, message: 'Kártérítések lekérési hiba' });
  }
};

const getById = async (req, res) => {
  try {
    const data = await svc.getCompensation(req.params.id, scopeOf(req));
    if (!data) return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[compensation.getById]', err);
    res.status(500).json({ success: false, message: 'Kártérítés lekérési hiba' });
  }
};

const create = async (req, res) => {
  try {
    const issue = req.query.issue === 'true' || req.body.issue === true;
    const row = await svc.createCompensation(req.body, { userId: req.user?.id, issue });
    res.status(201).json({ success: true, data: svc.format(row) });
  } catch (err) {
    if (/^(compensation_type|amount_gross|description|Either responsible)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('[compensation.create]', err);
    res.status(500).json({ success: false, message: 'Kártérítés létrehozási hiba' });
  }
};

const issue = async (req, res) => {
  try {
    const row = await svc.issueCompensation(req.params.id, { userId: req.user?.id });
    res.json({ success: true, data: svc.format(row) });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    }
    if (/^Cannot issue/.test(err.message)) {
      return res.status(409).json({ success: false, message: err.message });
    }
    logger.error('[compensation.issue]', err);
    res.status(500).json({ success: false, message: 'Kártérítés kiállítási hiba' });
  }
};

const recordPayment = async (req, res) => {
  try {
    const result = await svc.recordPayment(req.params.id, req.body, { userId: req.user?.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    }
    if (/^(amount|Payment|Cannot)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('[compensation.recordPayment]', err);
    res.status(500).json({ success: false, message: 'Fizetés rögzítési hiba' });
  }
};

const waive = async (req, res) => {
  try {
    const row = await svc.waiveCompensation(req.params.id, {
      reason: req.body.reason,
      userId: req.user?.id,
    });
    res.json({ success: true, data: svc.format(row) });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    }
    if (/^(reason|Cannot)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('[compensation.waive]', err);
    res.status(500).json({ success: false, message: 'Elengedési hiba' });
  }
};

const escalate = async (req, res) => {
  try {
    const row = await svc.escalateCompensation(req.params.id, {
      reminderType: req.body.reminder_type,
      reason: req.body.reason,
      userId: req.user?.id,
    });
    res.json({ success: true, data: svc.format(row) });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    }
    if (/^Cannot escalate/.test(err.message)) {
      return res.status(409).json({ success: false, message: err.message });
    }
    logger.error('[compensation.escalate]', err);
    res.status(500).json({ success: false, message: 'Eszkalációs hiba' });
  }
};

/** GET /compensations/:id/pdf — compensation notice */
const pdfNotice = async (req, res) => {
  try {
    // Ownership gate: the scoped fetch returns null if this compensation isn't the
    // caller's tenant → 404 before we generate/stream the PDF.
    const owned = await svc.getCompensation(req.params.id, scopeOf(req));
    if (!owned) return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    const doc = await pdfSvc.generateCompensationNotice(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="karteriteses-ertesitó-${req.params.id}.pdf"`);
    doc.pipe(res);
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    }
    logger.error('[compensation.pdfNotice]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'PDF generálási hiba' });
    }
  }
};

const allocate = async (req, res) => {
  try {
    const parties = req.body?.parties || [];
    const rows = await svc.allocateResponsibilities(req.params.id, parties, { userId: req.user?.id });
    res.json({ success: true, data: rows });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    if (/^(At least|Percentages|Each)/.test(err.message)) return res.status(400).json({ success: false, message: err.message });
    logger.error('[compensation.allocate]', err);
    res.status(500).json({ success: false, message: 'Allokációs hiba' });
  }
};

const dispute = async (req, res) => {
  try {
    const row = await svc.submitDispute(req.params.id, { reason: req.body.reason, userId: req.user?.id });
    res.json({ success: true, data: svc.format(row) });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    if (/^(reason|Cannot)/.test(err.message)) {
      return res.status(err.message.startsWith('Cannot') ? 409 : 400)
                .json({ success: false, message: err.message });
    }
    logger.error('[compensation.dispute]', err);
    res.status(500).json({ success: false, message: 'Vitatás hiba' });
  }
};

const resolveDispute = async (req, res) => {
  try {
    const row = await svc.resolveDispute(req.params.id, {
      outcome: req.body.outcome,
      notes: req.body.notes,
      newAmount: req.body.new_amount,
      userId: req.user?.id,
    });
    res.json({ success: true, data: svc.format(row) });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    if (/^(outcome|newAmount|Cannot)/.test(err.message)) {
      return res.status(err.message.startsWith('Cannot') ? 409 : 400)
                .json({ success: false, message: err.message });
    }
    logger.error('[compensation.resolveDispute]', err);
    res.status(500).json({ success: false, message: 'Vitatás lezárási hiba' });
  }
};

const scheduleDeduction = async (req, res) => {
  // Deduction execution is mothballed — no new salary-deduction schedules.
  if (!isDeductionExecutionEnabled()) {
    return res.status(403).json({ success: false, error: 'deduction_execution_disabled', message: DEDUCTION_DISABLED_MESSAGE });
  }
  try {
    const row = await svc.scheduleSalaryDeduction(req.params.id, req.body, { userId: req.user?.id });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    if (/^(employee_name|amount_per_period|periods_total|start_date)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('[compensation.scheduleDeduction]', err);
    res.status(500).json({ success: false, message: 'Bérlevonás ütemezési hiba' });
  }
};

const sendEmail = async (req, res) => {
  try {
    const result = await svc.sendNoticeEmail(req.params.id, { userId: req.user?.id });
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'COMPENSATION_NOT_FOUND') return res.status(404).json({ success: false, message: 'Kártérítés nem található' });
    logger.error('[compensation.sendEmail]', err);
    res.status(500).json({ success: false, message: 'E-mail küldési hiba' });
  }
};

module.exports = {
  list, getById, create, issue, recordPayment, waive, escalate, pdfNotice,
  allocate, dispute, resolveDispute, scheduleDeduction, sendEmail,
};
