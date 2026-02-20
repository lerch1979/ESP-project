const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getLogs, getLogDetail } = require('../controllers/activity-log.controller');

router.get('/', authenticateToken, requireAdmin, getLogs);
router.get('/:id', authenticateToken, requireAdmin, getLogDetail);

module.exports = router;
