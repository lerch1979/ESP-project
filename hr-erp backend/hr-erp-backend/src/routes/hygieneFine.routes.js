// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const c = require('../controllers/hygieneFine.controller');

// Room-hygiene house-rule fine config (házirend). Admin-editable; default OFF.
router.get('/config', authenticateToken, checkPermission('finance.edit'), c.getConfig);
router.put('/config', authenticateToken, checkPermission('finance.edit'), c.updateConfig);
router.post('/run',   authenticateToken, checkPermission('finance.edit'), c.runNow);

module.exports = router;
