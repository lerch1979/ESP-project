const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fine.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/',        ctrl.listTypes);
router.post('/',       checkPermission('settings.edit'), ctrl.createType);
router.put('/:id',     checkPermission('settings.edit'), ctrl.updateType);
router.delete('/:id',  checkPermission('settings.edit'), ctrl.deleteType);

module.exports = router;
