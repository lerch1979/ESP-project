const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const aiAssistantController = require('../controllers/aiAssistant.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

/**
 * GET /api/v1/admin/tasks/all
 * Cross-cutting task view for superadmin. Permission check is handled
 * inline in the controller (returns 403 for non-superadmin).
 */
router.get('/tasks/all', taskController.getAllTasksAdmin);

/**
 * GET /api/v1/admin/ai-assistant/logs
 * Superadmin view of every AI assistant interaction (intent / action / feedback).
 */
router.get('/ai-assistant/logs', aiAssistantController.adminLogs);

module.exports = router;
