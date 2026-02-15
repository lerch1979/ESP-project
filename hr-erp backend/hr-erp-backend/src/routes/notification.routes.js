const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  getTemplates,
  getFilterOptions,
  filterRecipients,
  sendBulk,
  getEmailLogs,
} = require('../controllers/notification.controller');

router.get('/templates', authenticateToken, getTemplates);
router.get('/filter-options', authenticateToken, requireAdmin, getFilterOptions);
router.post('/filter-recipients', authenticateToken, requireAdmin, filterRecipients);
router.post('/send-bulk', authenticateToken, requireAdmin, sendBulk);
router.get('/email-logs', authenticateToken, requireAdmin, getEmailLogs);

module.exports = router;
