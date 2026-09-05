// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const controller = require('../controllers/invoiceReport.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// Generate report (POST with filter body)
router.post('/generate', checkPermission('finance.edit'), controller.generateReport);

// Export report (POST with filter body + format)
router.post('/export', checkPermission('finance.edit'), controller.exportReport);

module.exports = router;
