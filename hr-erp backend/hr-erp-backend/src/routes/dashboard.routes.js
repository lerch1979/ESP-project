const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/v1/dashboard/stats
 * Dashboard összesített statisztikák
 */
router.get('/stats', checkPermission('dashboard.view'), dashboardController.getDashboardStats);

module.exports = router;
