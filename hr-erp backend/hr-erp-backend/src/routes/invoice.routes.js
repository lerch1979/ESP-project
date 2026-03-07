const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/v1/invoices
 * Számlák listája szűrőkkel
 */
router.get('/', checkPermission('settings.view'), invoiceController.getAll);

/**
 * GET /api/v1/invoices/:id
 * Számla részletek
 */
router.get('/:id', checkPermission('settings.view'), invoiceController.getById);

/**
 * POST /api/v1/invoices
 * Új számla létrehozása
 */
router.post('/', checkPermission('settings.edit'), invoiceController.create);

/**
 * PUT /api/v1/invoices/:id
 * Számla szerkesztése
 */
router.put('/:id', checkPermission('settings.edit'), invoiceController.update);

/**
 * DELETE /api/v1/invoices/:id
 * Számla törlése (soft delete)
 */
router.delete('/:id', checkPermission('settings.edit'), invoiceController.remove);

module.exports = router;
