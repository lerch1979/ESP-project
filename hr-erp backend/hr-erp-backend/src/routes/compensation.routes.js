const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/compensation.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Reads are staff-only (settings.edit) + contractor-scoped in the controller.
// Residents hold no permissions → 403 (GAP_AUDIT / DEEP_AUDIT finding 1).
router.get('/',        checkPermission('settings.edit'), ctrl.list);
router.get('/:id',     checkPermission('settings.edit'), ctrl.getById);
router.get('/:id/pdf', checkPermission('settings.edit'), ctrl.pdfNotice);

// Write — settings.edit as proxy permission (matches existing inspection routes)
router.post('/',                    checkPermission('settings.edit'), ctrl.create);
router.post('/:id/issue',              checkPermission('settings.edit'), ctrl.issue);
router.post('/:id/payments',           checkPermission('settings.edit'), ctrl.recordPayment);
router.post('/:id/waive',              checkPermission('settings.edit'), ctrl.waive);
router.post('/:id/escalate',           checkPermission('settings.edit'), ctrl.escalate);
router.post('/:id/responsibilities',   checkPermission('settings.edit'), ctrl.allocate);
router.post('/:id/dispute',            checkPermission('settings.edit'), ctrl.dispute);
router.post('/:id/resolve-dispute',    checkPermission('settings.edit'), ctrl.resolveDispute);
router.post('/:id/salary-deduction',   checkPermission('settings.edit'), ctrl.scheduleDeduction);
router.post('/:id/send-notice',        checkPermission('settings.edit'), ctrl.sendEmail);

module.exports = router;
