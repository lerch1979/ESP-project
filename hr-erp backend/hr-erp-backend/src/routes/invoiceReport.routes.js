const express = require('express');
const router = express.Router();
const controller = require('../controllers/invoiceReport.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// Generate report (POST with filter body)
router.post('/generate', checkPermission('settings.edit'), controller.generateReport);

// Export report (POST with filter body + format)
router.post('/export', checkPermission('settings.edit'), controller.exportReport);

module.exports = router;
