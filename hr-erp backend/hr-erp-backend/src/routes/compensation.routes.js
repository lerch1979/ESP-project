const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/compensation.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/',        ctrl.list);
router.get('/:id',     ctrl.getById);
router.get('/:id/pdf', ctrl.pdfNotice);

// Write — settings.edit as proxy permission (matches existing inspection routes)
router.post('/',                    checkPermission('settings.edit'), ctrl.create);
router.post('/:id/issue',           checkPermission('settings.edit'), ctrl.issue);
router.post('/:id/payments',        checkPermission('settings.edit'), ctrl.recordPayment);
router.post('/:id/waive',           checkPermission('settings.edit'), ctrl.waive);
router.post('/:id/escalate',        checkPermission('settings.edit'), ctrl.escalate);

module.exports = router;
