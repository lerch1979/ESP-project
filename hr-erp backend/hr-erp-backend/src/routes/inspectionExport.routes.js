const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inspectionExport.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Read-tier permission (reports.export already exists per the other export
// routes) — falls back to settings.edit if the test admin lacks it.
const perm = checkPermission('reports.export');

router.get('/inspections',           perm, ctrl.inspections);
router.get('/property-performance',  perm, ctrl.propertyPerformance);
router.get('/compensations',         perm, ctrl.compensations);
router.get('/inspector-performance', perm, ctrl.inspectorPerformance);
router.get('/maintenance-tasks',     perm, ctrl.maintenanceTasks);

module.exports = router;
