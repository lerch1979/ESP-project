const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All report routes require authentication
router.use(authenticateToken);

/**
 * GET /api/v1/reports/filter-options
 * Szűrő opciók lekérése minden riport típushoz
 */
router.get('/filter-options', checkPermission('reports.view'), reportController.getReportFilterOptions);

/**
 * POST /api/v1/reports/employees-summary
 * Munkavállalók riport összesítés (szűrőkkel)
 */
router.post('/employees-summary', checkPermission('reports.view'), reportController.getEmployeesSummary);

/**
 * POST /api/v1/reports/accommodations-summary
 * Szálláshelyek riport összesítés (szűrőkkel)
 */
router.post('/accommodations-summary', checkPermission('reports.view'), reportController.getAccommodationsSummary);

/**
 * POST /api/v1/reports/tickets-summary
 * Hibajegyek riport összesítés (szűrőkkel)
 */
router.post('/tickets-summary', checkPermission('reports.view'), reportController.getTicketsSummary);

/**
 * POST /api/v1/reports/contractors-summary
 * Alvállalkozók riport összesítés (szűrőkkel)
 */
router.post('/contractors-summary', checkPermission('reports.view'), reportController.getContractorsSummary);

/**
 * GET /api/v1/reports/occupancy/daily
 * Napi ágykihasználtság riport
 */
const occupancyController = require('../controllers/occupancy.controller');
router.get('/occupancy/daily', checkPermission('reports.view'), occupancyController.getDailyOccupancy);

/**
 * GET /api/v1/reports/occupancy/monthly
 * Havi ágykihasználtság riport
 */
router.get('/occupancy/monthly', checkPermission('reports.view'), occupancyController.getMonthlyOccupancy);

/**
 * GET /api/v1/reports/occupancy/range
 * Időszakos ágykihasználtság riport
 */
router.get('/occupancy/range', checkPermission('reports.view'), occupancyController.getRangeOccupancy);

module.exports = router;
