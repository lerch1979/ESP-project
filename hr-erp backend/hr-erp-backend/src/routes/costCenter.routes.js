const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('../controllers/costCenter.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Multer config for invoice file uploads
const invoiceUploadDir = path.join(__dirname, '..', '..', 'uploads', 'invoices');
if (!fs.existsSync(invoiceUploadDir)) {
  fs.mkdirSync(invoiceUploadDir, { recursive: true });
}

const invoiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, invoiceUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const invoiceUpload = multer({
  storage: invoiceStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nem engedélyezett fájltípus. Engedélyezett: PDF, JPG, PNG'));
    }
  },
});

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

router.get('/invoices/stats', controller.getInvoiceStats);
router.get('/invoices/list', controller.getInvoices);
router.post('/invoices/bulk-action', checkPermission('settings.edit'), controller.bulkInvoiceAction);
router.post('/invoices/export-to-folder', checkPermission('settings.edit'), controller.exportToFolder);
router.get('/invoices/:id', controller.getInvoiceById);
router.post('/invoices/:id/upload', checkPermission('settings.edit'), invoiceUpload.single('file'), controller.uploadInvoiceFile);
router.post('/invoices', checkPermission('settings.edit'), controller.createInvoice);
router.put('/invoices/:id', checkPermission('settings.edit'), controller.updateInvoice);
router.delete('/invoices/:id', checkPermission('settings.edit'), controller.deleteInvoice);

module.exports = router;
