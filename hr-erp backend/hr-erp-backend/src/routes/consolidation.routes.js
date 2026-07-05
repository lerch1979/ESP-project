const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const c = require('../controllers/consolidation.controller');

// Generating + viewing suggestions is read-only (moves nobody) → view permission.
router.post('/run', authenticateToken, checkPermission('employees.view'), c.runEngine);
router.get('/runs', authenticateToken, checkPermission('employees.view'), c.listRuns);
router.get('/config', authenticateToken, checkPermission('employees.view'), c.getConfig);
router.get('/workplaces', authenticateToken, checkPermission('employees.view'), c.listWorkplaces);
router.get('/runs/:id', authenticateToken, checkPermission('employees.view'), c.getRun);

// Approving (creates a move ticket), confirming the physical move, cancelling,
// rejecting + tuning all change data → edit permission.
router.post('/runs/:id/approve', authenticateToken, checkPermission('employees.edit'), c.approve);
router.post('/runs/:id/confirm', authenticateToken, checkPermission('employees.edit'), c.confirm);
router.post('/runs/:id/cancel', authenticateToken, checkPermission('employees.edit'), c.cancel);
router.post('/suggestions/:id/reject', authenticateToken, checkPermission('employees.edit'), c.reject);
router.put('/config', authenticateToken, checkPermission('employees.edit'), c.updateConfig);

module.exports = router;
