// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
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
router.post('/', checkPermission('finance.edit'), ctrl.create);
router.put('/:id', checkPermission('finance.edit'), ctrl.update);
router.delete('/:id', checkPermission('finance.edit'), ctrl.remove);

module.exports = router;
