// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
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
router.get('/', checkPermission('finance.view'), invoiceController.getAll);
// A controllerben a `create` és az `update` megvolt, de route NEM tartozott hozzájuk —
// a felület POST /invoices-t és PUT /invoices/:id-t hív, és élesben 405-öt kapott.
// Ezért nem lehetett a felületről számlát rögzíteni, és ezért van 13 számla, mind más
// úton (OCR-draft konverzió) bekerülve.
// A tömeges átsorolás a '/:id' mintájú útvonalak ELŐTT áll: fix útvonal, de a sorrend
// itt szándékos — a /employees/completeness eset pont attól lett 500-as élesben, hogy egy
// fix útvonal egy paraméteres mögé került.
router.post('/bulk-reallocate', checkPermission('finance.edit'), invoiceController.bulkReallocate);
router.post('/', checkPermission('finance.edit'), invoiceController.create);
router.put('/:id', checkPermission('finance.edit'), invoiceController.update);

/**
 * GET /api/v1/invoices/:id
 * Számla részletek
 */
// A literal útvonal a '/:id' ELŐTT — különben a param elnyeli (a completeness-tanulság).
router.get('/summary', checkPermission('finance.view'), invoiceController.summary);
router.get('/:id', checkPermission('finance.view'), invoiceController.getById);

// EGY FORRÁS — de a másik irányban, mint korábban.
//
// A kettősség (két számla-implementáció) egyszer már feltűnt, és akkor EZEK a kezelők
// lettek nyugdíjazva, mert a felület a costCenter.controller-t hívta. A döntés azóta
// megfordult: a fejlesztés itt folytatódott — a besorolás (hova könyveljük), a teljesítés
// dátuma, a devizás átváltás és a bérlő-szűrés mind itt van —, a másik példány pedig
// elavult és réseket hordozott (nem szűrt bérlőre, véglegesen törölt).
//
// Ezért most a `/cost-centers/invoices/*` útvonalak mutatnak IDE (lásd
// routes/costCenter.routes.js), a másik controller számla-CRUD-ja pedig törölve lett.
// A felület útvonalai nem változtak, csak a mögöttük lévő logika egységesült.

/**
 * DELETE /api/v1/invoices/:id
 * Számla törlése (soft delete)
 */
router.delete('/:id', checkPermission('finance.edit'), invoiceController.remove);

/**
 * GET /api/v1/invoices/:invoiceId/payments
 * Számla fizetéseinek listája
 */
router.get('/:invoiceId/payments', checkPermission('finance.view'), paymentController.getByInvoiceId);

/**
 * GET /api/v1/invoices/:id/pdf
 * Számla PDF exportálás
 */
router.get('/:id/pdf', checkPermission('finance.view'), async (req, res) => {
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
router.post('/:id/send-email', checkPermission('finance.edit'), async (req, res) => {
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
