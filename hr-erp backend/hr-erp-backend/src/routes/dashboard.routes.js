const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication (any role can view dashboard)
router.use(authenticateToken);

/**
 * GET /api/v1/dashboard/stats
 * Dashboard összesített statisztikák
 */
router.get('/stats', dashboardController.getDashboardStats);

module.exports = router;
