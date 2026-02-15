const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All report routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/v1/reports/employees-summary
 * Munkavállalók riport összesítés
 */
router.get('/employees-summary', reportController.getEmployeesSummary);

/**
 * GET /api/v1/reports/accommodations-summary
 * Szálláshelyek riport összesítés
 */
router.get('/accommodations-summary', reportController.getAccommodationsSummary);

/**
 * GET /api/v1/reports/tickets-summary
 * Hibajegyek riport összesítés
 */
router.get('/tickets-summary', reportController.getTicketsSummary);

/**
 * GET /api/v1/reports/contractors-summary
 * Alvállalkozók riport összesítés
 */
router.get('/contractors-summary', reportController.getContractorsSummary);

module.exports = router;
