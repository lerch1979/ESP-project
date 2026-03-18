const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/slack.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication + admin permission
router.use(authenticateToken);
router.use(checkPermission('blue_colibri.admin.manage'));

// Config
router.get('/config', ctrl.getConfig);
router.put('/config', ctrl.updateConfig);

// User management
router.get('/users', ctrl.getSlackUsers);
router.put('/users/:id/toggle', ctrl.toggleSlackUser);
router.post('/sync-users', ctrl.syncUsers);

// Test & stats
router.post('/test-message', ctrl.sendTestMessage);
router.get('/stats', ctrl.getStats);

module.exports = router;
