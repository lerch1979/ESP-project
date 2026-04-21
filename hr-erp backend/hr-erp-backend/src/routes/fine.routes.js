const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fine.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Mounted at /api/v1/fines. Types live under /api/v1/fine-types (see server.js).
router.use(authenticateToken);

// Create fine / damage
router.post('/',        checkPermission('settings.edit'), ctrl.createFine);
router.post('/damages', checkPermission('settings.edit'), ctrl.createDamage);

// Resident-level operations
router.post('/residents/:residentId/on-site-payment',      checkPermission('settings.edit'), ctrl.recordOnSite);
router.post('/residents/:residentId/payments',             checkPermission('settings.edit'), ctrl.recordPayment);
router.post('/residents/:residentId/convert-to-deduction', checkPermission('settings.edit'), ctrl.convertToDeduction);

// Reads
router.get('/compensations/:id/residents', ctrl.listResidentsForCompensation);
router.get('/salary-deductions',           ctrl.listDeductions);

// Payroll
router.post('/payroll/run', checkPermission('settings.edit'), ctrl.runPayroll);

module.exports = router;
