// Beszállító-javaslatok. finance.view mögött: a beszállítói névsor és az adószámok
// üzleti adatok, nem tartoznak a szállásfelelősre.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendor.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);
router.get('/', checkPermission('finance.view'), ctrl.suggest);

module.exports = router;
