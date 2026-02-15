const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All report routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/v1/reports/filter-options
 * Szűrő opciók lekérése minden riport típushoz
 */
router.get('/filter-options', reportController.getReportFilterOptions);

/**
 * POST /api/v1/reports/employees-summary
 * Munkavállalók riport összesítés (szűrőkkel)
 */
router.post('/employees-summary', reportController.getEmployeesSummary);

/**
 * POST /api/v1/reports/accommodations-summary
 * Szálláshelyek riport összesítés (szűrőkkel)
 */
router.post('/accommodations-summary', reportController.getAccommodationsSummary);

/**
 * POST /api/v1/reports/tickets-summary
 * Hibajegyek riport összesítés (szűrőkkel)
 */
router.post('/tickets-summary', reportController.getTicketsSummary);

/**
 * POST /api/v1/reports/contractors-summary
 * Alvállalkozók riport összesítés (szűrőkkel)
 */
router.post('/contractors-summary', reportController.getContractorsSummary);

module.exports = router;
