const express = require('express');
const router = express.Router();
const profitController = require('../controllers/profit.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/by-accommodation', checkPermission('settings.view'), profitController.byAccommodation);

module.exports = router;
