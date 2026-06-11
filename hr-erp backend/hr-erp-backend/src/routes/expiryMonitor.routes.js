/**
 * Expiry monitor admin routes — all admin-gated (superadmin / data_controller / admin).
 * Mounted at ${API_PREFIX}/expiry-monitor.
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/expiryMonitor.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken, requireAdmin);

router.get('/config', ctrl.getConfig);
router.put('/config', ctrl.updateConfig);

router.get('/rules', ctrl.listRules);
router.post('/rules', ctrl.createRule);
router.put('/rules/:id', ctrl.updateRule);
router.delete('/rules/:id', ctrl.deleteRule);

router.get('/summary', ctrl.getSummary);
router.post('/run', ctrl.runNow);

module.exports = router;
