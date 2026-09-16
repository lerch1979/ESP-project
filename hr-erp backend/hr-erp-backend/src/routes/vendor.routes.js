// Beszállító-javaslatok. finance.view mögött: a beszállítói névsor és az adószámok
// üzleti adatok, nem tartoznak a szállásfelelősre.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendor.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);
// A literal utak a gyökér elé/mellé — itt nincs :id param, de a sorrend így is beszédes.
router.get('/duplicates', checkPermission('finance.view'), ctrl.duplicates);
router.post('/merge', checkPermission('finance.edit'), ctrl.merge);
router.get('/keep-separate', checkPermission('finance.view'), ctrl.listKeepSeparate);
router.post('/keep-separate', checkPermission('finance.edit'), ctrl.keepSeparate);
router.get('/', checkPermission('finance.view'), ctrl.suggest);

module.exports = router;
