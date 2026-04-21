const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/classificationRules.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Anyone with read access can list rules + test classification
router.get('/', ctrl.list);
router.post('/test', ctrl.test);

// Settings.edit permission required for mutations
router.post('/', checkPermission('settings.edit'), ctrl.create);
router.put('/:id', checkPermission('settings.edit'), ctrl.update);
router.delete('/:id', checkPermission('settings.edit'), ctrl.remove);

module.exports = router;
