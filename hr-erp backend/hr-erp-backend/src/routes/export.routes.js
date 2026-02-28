const express = require('express');
const router = express.Router();
const exportController = require('../controllers/export.controller');
const { authenticateToken, checkContractorAccess } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Minden export route-hoz authentikáció szükséges
router.use(authenticateToken);

/**
 * GET /api/v1/export/employees
 * Munkavállalók exportálása Excel fájlba
 */
router.get('/employees', checkPermission('employees.export'), exportController.exportEmployees);

/**
 * GET /api/v1/export/contractors
 * Alvállalkozók exportálása Excel fájlba
 */
router.get('/contractors', checkPermission('reports.export'), exportController.exportContractors);

/**
 * GET /api/v1/export/accommodations
 * Szálláshelyek exportálása Excel fájlba
 */
router.get('/accommodations', checkPermission('reports.export'), exportController.exportAccommodations);

/**
 * GET /api/v1/export/tickets
 * Hibajegyek exportálása Excel fájlba
 */
router.get('/tickets', checkPermission('reports.export'), checkContractorAccess, exportController.exportTickets);

/**
 * GET /api/v1/export/projects/:id
 * Projekt exportálása Excel fájlba (3 munkalap)
 */
router.get('/projects/:id', checkPermission('projects.view'), exportController.exportProject);

/**
 * GET /api/v1/export/projects/:id/tasks-csv
 * Projekt feladatainak exportálása CSV fájlba
 */
router.get('/projects/:id/tasks-csv', checkPermission('projects.view'), exportController.exportProjectTasksCsv);

module.exports = router;
