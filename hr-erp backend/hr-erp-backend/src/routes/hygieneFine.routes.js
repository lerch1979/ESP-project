const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const c = require('../controllers/hygieneFine.controller');

// Room-hygiene house-rule fine config (házirend). Admin-editable; default OFF.
router.get('/config', authenticateToken, checkPermission('settings.edit'), c.getConfig);
router.put('/config', authenticateToken, checkPermission('settings.edit'), c.updateConfig);
router.post('/run',   authenticateToken, checkPermission('settings.edit'), c.runNow);

module.exports = router;
