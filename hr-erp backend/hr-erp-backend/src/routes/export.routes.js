const express = require('express');
const router = express.Router();
const exportController = require('../controllers/export.controller');
const { authenticateToken, requireAdmin, checkContractorAccess } = require('../middleware/auth');

// Minden export route-hoz authentikáció szükséges
router.use(authenticateToken);

/**
 * GET /api/v1/export/employees
 * Munkavállalók exportálása Excel fájlba
 */
router.get('/employees', requireAdmin, exportController.exportEmployees);

/**
 * GET /api/v1/export/contractors
 * Alvállalkozók exportálása Excel fájlba
 */
router.get('/contractors', requireAdmin, exportController.exportContractors);

/**
 * GET /api/v1/export/accommodations
 * Szálláshelyek exportálása Excel fájlba
 */
router.get('/accommodations', requireAdmin, exportController.exportAccommodations);

/**
 * GET /api/v1/export/tickets
 * Hibajegyek exportálása Excel fájlba
 */
router.get('/tickets', checkContractorAccess, exportController.exportTickets);

module.exports = router;
