const express = require('express');
const router = express.Router();
const controller = require('../controllers/operatingCosts.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Per-accommodation operating costs (category split + cost-per-bed-night).
router.get('/by-accommodation', checkPermission('settings.view'), controller.byAccommodation);
// Excel / PDF export of the same report.
router.get('/export', checkPermission('settings.view'), controller.exportReport);

module.exports = router;
