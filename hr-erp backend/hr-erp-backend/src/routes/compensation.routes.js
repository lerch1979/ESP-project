// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/compensation.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Reads are staff-only (settings.edit) + contractor-scoped in the controller.
// Residents hold no permissions → 403 (GAP_AUDIT / DEEP_AUDIT finding 1).
router.get('/',        checkPermission('finance.edit'), ctrl.list);
router.get('/:id',     checkPermission('finance.edit'), ctrl.getById);
router.get('/:id/pdf', checkPermission('finance.edit'), ctrl.pdfNotice);

// Write — settings.edit as proxy permission (matches existing inspection routes)
router.post('/',                    checkPermission('finance.edit'), ctrl.create);
router.post('/:id/issue',              checkPermission('finance.edit'), ctrl.issue);
router.post('/:id/payments',           checkPermission('finance.edit'), ctrl.recordPayment);
router.post('/:id/waive',              checkPermission('finance.edit'), ctrl.waive);
router.post('/:id/escalate',           checkPermission('finance.edit'), ctrl.escalate);
router.post('/:id/responsibilities',   checkPermission('finance.edit'), ctrl.allocate);
router.post('/:id/dispute',            checkPermission('finance.edit'), ctrl.dispute);
router.post('/:id/resolve-dispute',    checkPermission('finance.edit'), ctrl.resolveDispute);
router.post('/:id/salary-deduction',   checkPermission('finance.edit'), ctrl.scheduleDeduction);
router.post('/:id/send-notice',        checkPermission('finance.edit'), ctrl.sendEmail);

module.exports = router;
