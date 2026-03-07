const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice.controller');
const paymentController = require('../controllers/payment.controller');
const { generateInvoicePDF } = require('../services/pdfGenerator.service');
const { sendInvoiceEmail } = require('../services/email.service');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/v1/invoices
 * Számlák listája szűrőkkel
 */
router.get('/', checkPermission('settings.view'), invoiceController.getAll);

/**
 * GET /api/v1/invoices/:id
 * Számla részletek
 */
router.get('/:id', checkPermission('settings.view'), invoiceController.getById);

/**
 * POST /api/v1/invoices
 * Új számla létrehozása
 */
router.post('/', checkPermission('settings.edit'), invoiceController.create);

/**
 * PUT /api/v1/invoices/:id
 * Számla szerkesztése
 */
router.put('/:id', checkPermission('settings.edit'), invoiceController.update);

/**
 * DELETE /api/v1/invoices/:id
 * Számla törlése (soft delete)
 */
router.delete('/:id', checkPermission('settings.edit'), invoiceController.remove);

/**
 * GET /api/v1/invoices/:invoiceId/payments
 * Számla fizetéseinek listája
 */
router.get('/:invoiceId/payments', checkPermission('settings.view'), paymentController.getByInvoiceId);

/**
 * GET /api/v1/invoices/:id/pdf
 * Számla PDF exportálás
 */
router.get('/:id/pdf', checkPermission('settings.view'), async (req, res) => {
  try {
    const result = await generateInvoicePDF(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Számla nem található' });
    }

    const { doc, invoice } = result;
    const filename = `${invoice.invoice_number || 'szamla'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);
  } catch (error) {
    logger.error('PDF generálási hiba:', error);
    res.status(500).json({ success: false, message: 'PDF generálási hiba' });
  }
});

/**
 * POST /api/v1/invoices/:id/send-email
 * Számla küldése emailben PDF melléklettel
 */
router.post('/:id/send-email', checkPermission('settings.edit'), async (req, res) => {
  try {
    const { to, cc, subject, body } = req.body;
    const result = await sendInvoiceEmail(req.params.id, { to, cc, subject, body });

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    await logActivity({
      userId: req.user.id,
      entityType: 'invoice',
      entityId: req.params.id,
      action: 'send_email',
      metadata: { to, invoice_number: result.data.invoice_number },
    });

    res.json({
      success: true,
      message: 'Számla elküldve emailben',
      data: result.data,
    });
  } catch (error) {
    logger.error('Email küldési hiba:', error);
    res.status(500).json({ success: false, message: 'Email küldési hiba' });
  }
});

module.exports = router;
