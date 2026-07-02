const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/damageReport.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Damage reports carry employee salary + signature PII and are an operator-only
// tool (same family as fines/compensations, which gate on settings.edit).
// Gate the WHOLE router so non-operators — residents included — get 403; the
// controller additionally scopes every :id action to the caller's contractor.
router.use(checkPermission('settings.edit'));

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
