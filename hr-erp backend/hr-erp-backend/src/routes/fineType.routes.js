// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fine.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/',        ctrl.listTypes);
router.post('/',       checkPermission('finance.edit'), ctrl.createType);
router.put('/:id',     checkPermission('finance.edit'), ctrl.updateType);
router.delete('/:id',  checkPermission('finance.edit'), ctrl.deleteType);

module.exports = router;
