const express = require('express');
const router = express.Router();
const searchController = require('../controllers/search.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/v1/search/global?q=query
 * Globalis kereses minden entitasban
 */
router.get('/global', searchController.globalSearch);

module.exports = router;
