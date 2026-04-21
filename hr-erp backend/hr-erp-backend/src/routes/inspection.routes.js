const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inspection.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Read — any authenticated user (scoped by contractor at query level; owner-portal
// filtering is Day 4 work). For now admin + inspectors can list.
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

// Write — inspectors + admins. Using settings.edit as a proxy permission
// until the new property_inspector-scoped permissions land.
router.post('/',                     checkPermission('settings.edit'), ctrl.create);
router.patch('/:id',                 checkPermission('settings.edit'), ctrl.update);
router.post('/:id/scores',           checkPermission('settings.edit'), ctrl.addScores);
router.post('/:id/complete',         checkPermission('settings.edit'), ctrl.complete);
router.delete('/:id',                checkPermission('settings.edit'), ctrl.remove);

module.exports = router;
