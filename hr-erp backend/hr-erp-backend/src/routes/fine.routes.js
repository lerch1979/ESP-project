// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fine.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Mounted at /api/v1/fines. Types live under /api/v1/fine-types (see server.js).
router.use(authenticateToken);

// Create fine / damage
router.post('/',        checkPermission('finance.edit'), ctrl.createFine);
router.post('/damages', checkPermission('finance.edit'), ctrl.createDamage);

// Resident-level operations
router.post('/residents/:residentId/on-site-payment',      checkPermission('finance.edit'), ctrl.recordOnSite);
router.post('/residents/:residentId/payments',             checkPermission('finance.edit'), ctrl.recordPayment);
router.post('/residents/:residentId/convert-to-deduction', checkPermission('finance.edit'), ctrl.convertToDeduction);

// Reads — staff-only (settings.edit) + contractor-scoped (DEEP_AUDIT finding 2).
router.get('/compensations/:id/residents', checkPermission('finance.edit'), ctrl.listResidentsForCompensation);
router.get('/salary-deductions',           checkPermission('finance.edit'), ctrl.listDeductions);

// Payroll
router.post('/payroll/run', checkPermission('finance.edit'), ctrl.runPayroll);

module.exports = router;
