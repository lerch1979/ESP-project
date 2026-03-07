const paymentService = require('../services/payment.service');
const { validateCreate, validateUpdate } = require('../models/payment.model');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

/**
 * GET /api/v1/payments
 */
const getAll = async (req, res) => {
  try {
    const result = await paymentService.getAll(req.query);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Fizetések lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Fizetések lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/payments/:id
 */
const getById = async (req, res) => {
  try {
    const payment = await paymentService.getById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Fizetés nem található' });
    }
    res.json({ success: true, data: { payment } });
  } catch (error) {
    logger.error('Fizetés lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Fizetés lekérdezési hiba' });
  }
};

/**
 * GET /api/v1/invoices/:invoiceId/payments
 */
const getByInvoiceId = async (req, res) => {
  try {
    const result = await paymentService.getByInvoiceId(req.params.invoiceId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Számla fizetéseinek lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Számla fizetéseinek lekérdezési hiba' });
  }
};

/**
 * POST /api/v1/payments
 */
const create = async (req, res) => {
  try {
    const validation = validateCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors.join('. '),
        errors: validation.errors,
      });
    }

    const result = await paymentService.create(req.body, req.user.id);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'payment',
      entityId: result.data.id,
      action: 'create',
      metadata: { invoice_id: req.body.invoice_id, amount: req.body.amount },
    });

    res.status(201).json({
      success: true,
      message: 'Fizetés rögzítve',
      data: { payment: result.data },
    });
  } catch (error) {
    logger.error('Fizetés rögzítési hiba:', error);
    res.status(500).json({ success: false, message: 'Fizetés rögzítési hiba' });
  }
};

/**
 * PUT /api/v1/payments/:id
 */
const update = async (req, res) => {
  try {
    const validation = validateUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors.join('. '),
        errors: validation.errors,
      });
    }

    const result = await paymentService.update(req.params.id, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'payment',
      entityId: req.params.id,
      action: 'update',
      metadata: { invoice_id: result.data.invoice_id },
    });

    res.json({
      success: true,
      message: 'Fizetés frissítve',
      data: { payment: result.data },
    });
  } catch (error) {
    logger.error('Fizetés frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Fizetés frissítési hiba' });
  }
};

/**
 * DELETE /api/v1/payments/:id
 */
const remove = async (req, res) => {
  try {
    const result = await paymentService.delete(req.params.id);

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'payment',
      entityId: req.params.id,
      action: 'delete',
      metadata: { invoice_id: result.data.invoice_id, amount: result.data.amount },
    });

    res.json({ success: true, message: 'Fizetés törölve' });
  } catch (error) {
    logger.error('Fizetés törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Fizetés törlési hiba' });
  }
};

module.exports = { getAll, getById, getByInvoiceId, create, update, remove };
