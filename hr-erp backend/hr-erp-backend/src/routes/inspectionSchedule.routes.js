const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inspectionSchedule.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/',             ctrl.list);
router.get('/upcoming',     ctrl.upcoming);
router.post('/',            checkPermission('settings.edit'), ctrl.create);
router.put('/:id',          checkPermission('settings.edit'), ctrl.update);
router.delete('/:id',       checkPermission('settings.edit'), ctrl.remove);

module.exports = router;
