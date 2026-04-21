/**
 * Fine / Damage Controller — thin HTTP wrapper around fine.service.
 * Mounted at /api/v1/fines for fine-specific ops and /api/v1/fine-types for
 * the catalog. Compensation reads/writes remain on /api/v1/compensations.
 */
const svc = require('../services/fine.service');
const { logger } = require('../utils/logger');

// ─── fine_types catalog ─────────────────────────────────────────────

const listTypes = async (req, res) => {
  try {
    const activeOnly = req.query.active !== 'false';
    res.json({ success: true, data: await svc.listFineTypes({ activeOnly }) });
  } catch (err) {
    logger.error('[fine.listTypes]', err);
    res.status(500).json({ success: false, message: 'Bírság típusok lekérési hiba' });
  }
};

const createType = async (req, res) => {
  try {
    const row = await svc.createFineType(req.body);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (/^(code|amount_per_person)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A bírság kód már létezik' });
    }
    logger.error('[fine.createType]', err);
    res.status(500).json({ success: false, message: 'Bírság típus létrehozási hiba' });
  }
};

const updateType = async (req, res) => {
  try {
    const row = await svc.updateFineType(req.params.id, req.body);
    if (!row) return res.status(404).json({ success: false, message: 'Bírság típus nem található' });
    res.json({ success: true, data: row });
  } catch (err) {
    logger.error('[fine.updateType]', err);
    res.status(500).json({ success: false, message: 'Bírság típus frissítési hiba' });
  }
};

const deleteType = async (req, res) => {
  try {
    await svc.deleteFineType(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[fine.deleteType]', err);
    res.status(500).json({ success: false, message: 'Bírság típus törlési hiba' });
  }
};

// ─── Fine creation + damage creation ────────────────────────────────

const createFine = async (req, res) => {
  try {
    const { inspection_id, fine_type_id, room_inspection_id, residents, notes } = req.body || {};
    const result = await svc.createFine(inspection_id, fine_type_id, residents || [], {
      userId: req.user?.id,
      roomInspectionId: room_inspection_id,
      notes,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'FINE_TYPE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Bírság típus nem található' });
    }
    if (/^(fineTypeId|at least one|each resident)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('[fine.createFine]', err);
    res.status(500).json({ success: false, message: 'Bírság létrehozási hiba' });
  }
};

const createDamage = async (req, res) => {
  try {
    const { inspection_id, room_inspection_id, details, residents, due_days } = req.body || {};
    const result = await svc.createDamageCompensation(inspection_id, details || {}, residents || [], {
      userId: req.user?.id,
      roomInspectionId: room_inspection_id,
      dueDays: due_days,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (/^(details|at least one|allocation sum)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('[fine.createDamage]', err);
    res.status(500).json({ success: false, message: 'Kártérítés létrehozási hiba' });
  }
};

// ─── Resident-level payments ────────────────────────────────────────

const recordOnSite = async (req, res) => {
  try {
    const result = await svc.recordOnSitePayment(req.params.residentId, {
      method: req.body.method,
      signatureData: req.body.signature_data,
      receiptNumber: req.body.receipt_number,
      notes: req.body.notes,
      userId: req.user?.id,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'RESIDENT_NOT_FOUND') return res.status(404).json({ success: false, message: 'Lakó nem található' });
    if (/^(method|signatureData|Nothing|Resident already)/.test(err.message)) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('[fine.recordOnSite]', err);
    res.status(500).json({ success: false, message: 'Helyszíni fizetés rögzítési hiba' });
  }
};

const recordPayment = async (req, res) => {
  try {
    const pay = await svc.recordResidentPayment(req.params.residentId, {
      amount: req.body.amount,
      method: req.body.method,
      reference: req.body.reference,
      notes: req.body.notes,
      paidAt: req.body.paid_at,
      userId: req.user?.id,
    });
    res.status(201).json({ success: true, data: pay });
  } catch (err) {
    if (err.message === 'RESIDENT_NOT_FOUND') return res.status(404).json({ success: false, message: 'Lakó nem található' });
    if (/^(amount)/.test(err.message)) return res.status(400).json({ success: false, message: err.message });
    logger.error('[fine.recordPayment]', err);
    res.status(500).json({ success: false, message: 'Fizetés rögzítési hiba' });
  }
};

const convertToDeduction = async (req, res) => {
  try {
    const result = await svc.convertToSalaryDeduction(req.params.residentId, {
      months: req.body.months,
      userId: req.user?.id,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'RESIDENT_NOT_FOUND') return res.status(404).json({ success: false, message: 'Lakó nem található' });
    if (/^(months|Nothing|Cannot convert)/.test(err.message)) {
      return res.status(err.message.startsWith('Cannot') ? 409 : 400)
                .json({ success: false, message: err.message });
    }
    logger.error('[fine.convertToDeduction]', err);
    res.status(500).json({ success: false, message: 'Bérlevonás konverzió hiba' });
  }
};

// ─── Reads ──────────────────────────────────────────────────────────

const listResidentsForCompensation = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.listResidentsFor(req.params.id) });
  } catch (err) {
    logger.error('[fine.listResidents]', err);
    res.status(500).json({ success: false, message: 'Lakók lekérési hiba' });
  }
};

const listDeductions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.listSalaryDeductions({
        employeeId: req.query.employee_id || null,
        status: req.query.status || null,
        limit: parseInt(req.query.limit, 10) || 100,
      }),
    });
  } catch (err) {
    logger.error('[fine.listDeductions]', err);
    res.status(500).json({ success: false, message: 'Bérlevonások lekérési hiba' });
  }
};

// ─── Payroll-side operations ────────────────────────────────────────

const runPayroll = async (req, res) => {
  try {
    const month = req.body.month || req.query.month;
    if (!/^\d{4}-\d{2}$/.test(month || '')) {
      return res.status(400).json({ success: false, message: 'month must be YYYY-MM' });
    }
    res.json({ success: true, data: await svc.processMonthlyDeductions(month, { userId: req.user?.id }) });
  } catch (err) {
    logger.error('[fine.runPayroll]', err);
    res.status(500).json({ success: false, message: 'Bérszámfejtés hiba' });
  }
};

module.exports = {
  listTypes, createType, updateType, deleteType,
  createFine, createDamage,
  recordOnSite, recordPayment, convertToDeduction,
  listResidentsForCompensation, listDeductions,
  runPayroll,
};
