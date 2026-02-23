const express = require('express');
const router = express.Router();
const searchController = require('../controllers/search.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

/**
 * GET /api/v1/search/global?q=query
 * Globalis kereses minden entitasban
 */
router.get('/global', checkPermission('employees.view'), searchController.globalSearch);

module.exports = router;
