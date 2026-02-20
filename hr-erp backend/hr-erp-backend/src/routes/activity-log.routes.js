const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getLogs, getLogDetail, exportLogs } = require('../controllers/activity-log.controller');

router.get('/', authenticateToken, requireAdmin, getLogs);
router.get('/export', authenticateToken, requireAdmin, exportLogs);
router.get('/:id', authenticateToken, requireAdmin, getLogDetail);

module.exports = router;
