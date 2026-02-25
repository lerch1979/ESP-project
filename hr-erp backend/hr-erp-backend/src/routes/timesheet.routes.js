const express = require('express');
const router = express.Router();
const timesheetController = require('../controllers/timesheet.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkAnyPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// ============================================
// Timesheet Routes
// ============================================

/**
 * POST /api/v1/timesheets
 * Munkaidő rögzítése
 */
router.post('/', checkPermission('timesheets.log'), timesheetController.logHours);

/**
 * GET /api/v1/timesheets/task/:taskId
 * Feladathoz tartozó munkaidő bejegyzések
 */
router.get('/task/:taskId', checkAnyPermission(['timesheets.view_own', 'timesheets.view_all']), timesheetController.getByTask);

/**
 * GET /api/v1/timesheets/user/:userId
 * Felhasználóhoz tartozó munkaidő bejegyzések
 */
router.get('/user/:userId', checkAnyPermission(['timesheets.view_own', 'timesheets.view_all']), timesheetController.getByUser);

/**
 * GET /api/v1/timesheets/project/:projectId
 * Projekthez tartozó munkaidő bejegyzések
 */
router.get('/project/:projectId', checkAnyPermission(['timesheets.view_own', 'timesheets.view_all']), timesheetController.getByProject);

module.exports = router;
