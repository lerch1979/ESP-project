const express = require('express');
const router = express.Router();
const emailTemplateController = require('../controllers/email-template.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// Template types (must be before /:id routes)
router.get('/types', emailTemplateController.getTemplateTypes);

// Slug-based lookup (must be before /:id routes)
router.get('/slug/:slug', emailTemplateController.getEmailTemplateBySlug);

// CRUD
router.get('/', emailTemplateController.getEmailTemplates);
router.get('/:id', emailTemplateController.getEmailTemplateById);
router.post('/', checkPermission('employees.create'), emailTemplateController.createEmailTemplate);
router.put('/:id', checkPermission('employees.edit'), emailTemplateController.updateEmailTemplate);
router.delete('/:id', checkPermission('employees.delete'), emailTemplateController.deleteEmailTemplate);

// Preview & Render
router.post('/:id/preview', emailTemplateController.previewEmailTemplate);
router.post('/:id/render', emailTemplateController.renderEmailTemplate);

// Duplicate
router.post('/:id/duplicate', checkPermission('employees.create'), emailTemplateController.duplicateEmailTemplate);

module.exports = router;
