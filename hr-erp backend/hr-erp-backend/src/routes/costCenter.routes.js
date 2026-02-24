const express = require('express');
const router = express.Router();
const controller = require('../controllers/costCenter.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// ============================================
// COST CENTERS
// ============================================

// Tree view (before /:id)
router.get('/tree', controller.getTree);

// Flat list
router.get('/', controller.getAll);

// Single
router.get('/:id', controller.getById);

// Ancestors (breadcrumb)
router.get('/:id/ancestors', controller.getAncestors);

// Descendants
router.get('/:id/descendants', controller.getDescendants);

// Budget summary
router.get('/:id/budget-summary', controller.getBudgetSummary);

// Create
router.post('/', checkPermission('settings.edit'), controller.create);

// Update
router.put('/:id', checkPermission('settings.edit'), controller.update);

// Move
router.post('/:id/move', checkPermission('settings.edit'), controller.move);

// Delete
router.delete('/:id', checkPermission('settings.edit'), controller.remove);

// ============================================
// INVOICE CATEGORIES
// ============================================

router.get('/invoice-categories/list', controller.getInvoiceCategories);
router.post('/invoice-categories', checkPermission('settings.edit'), controller.createInvoiceCategory);
router.put('/invoice-categories/:id', checkPermission('settings.edit'), controller.updateInvoiceCategory);
router.delete('/invoice-categories/:id', checkPermission('settings.edit'), controller.deleteInvoiceCategory);

// ============================================
// INVOICES
// ============================================

router.get('/invoices/list', controller.getInvoices);
router.get('/invoices/:id', controller.getInvoiceById);
router.post('/invoices', checkPermission('settings.edit'), controller.createInvoice);
router.put('/invoices/:id', checkPermission('settings.edit'), controller.updateInvoice);
router.delete('/invoices/:id', checkPermission('settings.edit'), controller.deleteInvoice);

module.exports = router;
