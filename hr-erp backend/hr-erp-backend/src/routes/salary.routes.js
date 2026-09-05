// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salary.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// ============================================
// STATISTICS & HELPERS
// ============================================

router.get('/stats', checkPermission('finance.view'), salaryController.getStats);
router.get('/departments', checkPermission('finance.view'), salaryController.getDepartments);

// ============================================
// SALARY BANDS
// ============================================

router.get('/bands', checkPermission('finance.view'), salaryController.getBands);
router.get('/bands/:id', checkPermission('finance.view'), salaryController.getBandById);
router.post('/bands', checkPermission('finance.edit'), salaryController.createBand);
router.put('/bands/:id', checkPermission('finance.edit'), salaryController.updateBand);
router.delete('/bands/:id', checkPermission('finance.edit'), salaryController.deleteBand);

// ============================================
// EMPLOYEE SALARIES
// ============================================

router.get('/employees', checkPermission('finance.view'), salaryController.getEmployeeSalaries);
router.get('/employees/:id', checkPermission('finance.view'), salaryController.getEmployeeSalaryById);
router.post('/employees', checkPermission('finance.edit'), salaryController.createEmployeeSalary);
router.put('/employees/:id', checkPermission('finance.edit'), salaryController.updateEmployeeSalary);
router.delete('/employees/:id', checkPermission('finance.edit'), salaryController.deleteEmployeeSalary);

// Employee salary history
router.get('/employees/:employeeId/history', checkPermission('finance.view'), salaryController.getEmployeeSalaryHistory);

module.exports = router;
