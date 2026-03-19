const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/damageReport.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// CRUD
router.post('/create-from-ticket', ctrl.createFromTicket);
router.post('/create-manual', ctrl.createManual);
router.get('/', ctrl.listReports);
router.get('/:id', ctrl.getReport);
router.put('/:id', ctrl.updateReport);
router.delete('/:id', ctrl.deleteReport);

// Damage items
router.post('/:id/damage-items', ctrl.addDamageItem);
router.delete('/:id/damage-items/:itemId', ctrl.removeDamageItem);

// Export
router.get('/:id/pdf', ctrl.downloadPDF);

// Acknowledge (employee signature)
router.post('/:id/acknowledge', ctrl.acknowledgeReport);

// Payment
router.get('/:id/payment-status', ctrl.getPaymentStatus);
router.post('/calculate-payment-plan', ctrl.calculatePaymentPlan);

module.exports = router;
