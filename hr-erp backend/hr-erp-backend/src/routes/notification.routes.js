const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
  getFilterOptions,
  filterRecipients,
  sendBulk,
  getEmailLogs,
  testEmail,
} = require('../controllers/notification.controller');

// Template CRUD + preview (must come before GET /templates to avoid route conflicts)
router.post('/templates/preview', authenticateToken, requireAdmin, previewTemplate);
router.post('/templates', authenticateToken, requireAdmin, createTemplate);
router.get('/templates/:id', authenticateToken, requireAdmin, getTemplateById);
router.put('/templates/:id', authenticateToken, requireAdmin, updateTemplate);
router.delete('/templates/:id', authenticateToken, requireAdmin, deleteTemplate);

router.get('/templates', authenticateToken, getTemplates);
router.get('/filter-options', authenticateToken, requireAdmin, getFilterOptions);
router.post('/filter-recipients', authenticateToken, requireAdmin, filterRecipients);
router.post('/send-bulk', authenticateToken, requireAdmin, sendBulk);
router.get('/email-logs', authenticateToken, requireAdmin, getEmailLogs);
router.post('/test-email', authenticateToken, requireAdmin, testEmail);

module.exports = router;
