const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const c = require('../controllers/consolidation.controller');

// Generating + viewing suggestions is read-only (moves nobody) → view permission.
router.post('/run', authenticateToken, checkPermission('employees.view'), c.runEngine);
router.get('/runs', authenticateToken, checkPermission('employees.view'), c.listRuns);
router.get('/config', authenticateToken, checkPermission('employees.view'), c.getConfig);
router.get('/runs/:id', authenticateToken, checkPermission('employees.view'), c.getRun);

// Applying moves + rejecting + tuning changes data → edit permission.
router.post('/runs/:id/apply', authenticateToken, checkPermission('employees.edit'), c.apply);
router.post('/suggestions/:id/reject', authenticateToken, checkPermission('employees.edit'), c.reject);
router.put('/config', authenticateToken, checkPermission('employees.edit'), c.updateConfig);

module.exports = router;
