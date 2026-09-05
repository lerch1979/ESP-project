// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const controller = require('../controllers/operatingCosts.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Per-accommodation operating costs (category split + cost-per-bed-night).
router.get('/by-accommodation', checkPermission('finance.view'), controller.byAccommodation);
// Excel / PDF export of the same report.
router.get('/export', checkPermission('finance.view'), controller.exportReport);

module.exports = router;
