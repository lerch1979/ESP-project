/**
 * Compensation Controller — thin HTTP wrapper around compensation.service.
 */
const svc = require('../services/compensation.service');
const pdfSvc = require('../services/inspectionPDF.service');
const { logger } = require('../utils/logger');

const list = async (req, res) => {
  try {
    const result = await svc.listCompensations(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[compensation.list]', err);
    res.status(500).json({ success: false, message: 'Kártérítések lekérési hiba' });
  }
};

const getById = async (req, res) => {
  try {
    const data = await svc.getCompensation(req.params.id);
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

module.exports = { list, getById, create, issue, recordPayment, waive, escalate, pdfNotice };
