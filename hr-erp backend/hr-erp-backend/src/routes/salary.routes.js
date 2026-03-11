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

router.get('/stats', checkPermission('settings.view'), salaryController.getStats);
router.get('/departments', checkPermission('settings.view'), salaryController.getDepartments);

// ============================================
// SALARY BANDS
// ============================================

router.get('/bands', checkPermission('settings.view'), salaryController.getBands);
router.get('/bands/:id', checkPermission('settings.view'), salaryController.getBandById);
router.post('/bands', checkPermission('settings.edit'), salaryController.createBand);
router.put('/bands/:id', checkPermission('settings.edit'), salaryController.updateBand);
router.delete('/bands/:id', checkPermission('settings.edit'), salaryController.deleteBand);

// ============================================
// EMPLOYEE SALARIES
// ============================================

router.get('/employees', checkPermission('settings.view'), salaryController.getEmployeeSalaries);
router.get('/employees/:id', checkPermission('settings.view'), salaryController.getEmployeeSalaryById);
router.post('/employees', checkPermission('settings.edit'), salaryController.createEmployeeSalary);
router.put('/employees/:id', checkPermission('settings.edit'), salaryController.updateEmployeeSalary);
router.delete('/employees/:id', checkPermission('settings.edit'), salaryController.deleteEmployeeSalary);

// Employee salary history
router.get('/employees/:employeeId/history', checkPermission('settings.view'), salaryController.getEmployeeSalaryHistory);

module.exports = router;
