// Gated on finance.* (mig 154): exchange rates ARE money — a szállásfelelős has no
// business seeing what a cost converted at.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/exchangeRate.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Literal paths before anything param-shaped — the /employees/completeness lesson.
router.get('/missing', checkPermission('finance.view'), ctrl.listMissing);
router.post('/retry',  checkPermission('finance.edit'), ctrl.retryMissing);
router.get('/',        checkPermission('finance.view'), ctrl.listRates);

module.exports = router;
