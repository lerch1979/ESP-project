const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/billingCorrection.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// A fix útvonal a '/:id' mintájúak ELŐTT — a /employees/completeness éles 500-asa
// pont attól lett, hogy egy fix útvonal egy paraméteres mögé került.
router.get('/open', checkPermission('finance.view'), ctrl.open);

router.post('/', checkPermission('finance.edit'), ctrl.propose);
router.post('/:id/approve', checkPermission('finance.edit'), ctrl.approve);
router.post('/:id/reject',  checkPermission('finance.edit'), ctrl.reject);
router.post('/:id/settle',  checkPermission('finance.edit'), ctrl.settle);
router.patch('/:id/lines/:lineId', checkPermission('finance.edit'), ctrl.setLine);

module.exports = router;
