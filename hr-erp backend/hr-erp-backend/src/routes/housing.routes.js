const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/housing.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Employee endpoints
router.post('/inspections/self-report', ctrl.submitSelfReport);
router.get('/inspections/my', ctrl.getMyInspections);

// Admin endpoints
router.post('/inspections', checkPermission('housing.manage'), ctrl.createInspection);
router.get('/inspections/user/:userId', checkPermission('housing.manage'), ctrl.getUserInspections);
router.get('/admin/inspections', checkPermission('housing.manage'), ctrl.getAllInspections);
router.put('/inspections/:id', checkPermission('housing.manage'), ctrl.updateInspection);
router.get('/admin/correlation', checkPermission('housing.manage'), ctrl.getCorrelation);
router.get('/admin/follow-ups', checkPermission('housing.manage'), ctrl.getFollowUps);
router.put('/inspections/:id/follow-up', checkPermission('housing.manage'), ctrl.completeFollowUp);

module.exports = router;
