const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const taskController = require('../controllers/task.controller');
const taskAssignees = require('../controllers/taskAssignees.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// ============================================
// MULTER CONFIG - Task Attachments
// ============================================

const attachmentUploadDir = path.join(__dirname, '..', '..', 'uploads', 'tasks');
if (!fs.existsSync(attachmentUploadDir)) {
  fs.mkdirSync(attachmentUploadDir, { recursive: true });
}

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, attachmentUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'task_' + uniqueSuffix + ext);
  },
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// All routes require authentication
router.use(authenticateToken);

/**
 * POST /api/v1/tasks
 * Standalone task creation (no project) — used by the employee timeline
 * "Create Task" flow. Notifies the assignee via in-app notifications.
 */
router.post('/', checkPermission('tasks.edit'), taskController.createStandalone);

// ============================================
// Direct task routes (mounted on /api/v1/tasks)
// ============================================

/**
 * GET /api/v1/tasks/my/stats
 * Saját feladatok statisztikái (dashboard widget + sidebar badge)
 */
router.get('/my/stats', checkPermission('tasks.view'), taskController.getMyTasksStats);

/**
 * GET /api/v1/tasks/my
 * Saját feladatok lekérdezése (összes projektből)
 */
router.get('/my', checkPermission('tasks.view'), taskController.getMyTasks);

/**
 * GET /api/v1/tasks/my-active
 * "Elvégzendő feladataim" widget feed — non-completed tasks where the
 * caller is either the main responsible or a helper (with their own
 * assignee row not yet completed). Must be declared BEFORE :id routes
 * so 'my-active' isn't treated as a UUID lookup.
 */
router.get('/my-active', checkPermission('tasks.view'), taskController.getMyActiveTasks);

/**
 * GET /api/v1/tasks/gtd-view
 * Unified "Teendők" kanban data (buckets + counts). Must be above :id
 * to avoid being caught as an id lookup.
 */
router.get('/gtd-view', checkPermission('tasks.view'), taskController.getGtdView);

/**
 * PATCH /api/v1/tasks/:id/gtd-status
 * Drag-and-drop friendly status change. Body: { gtd_status }
 */
router.patch('/:id/gtd-status', checkPermission('tasks.edit'), taskController.updateGtdStatus);

/**
 * GET /api/v1/tasks/:id
 * Egyedi feladat lekérdezése
 */
router.get('/:id', checkPermission('tasks.view'), taskController.getById);

/**
 * PUT /api/v1/tasks/:id
 * Feladat szerkesztése
 */
router.put('/:id', checkPermission('tasks.edit'), taskController.update);

/**
 * DELETE /api/v1/tasks/:id
 * Feladat törlése
 */
router.delete('/:id', checkPermission('tasks.delete'), taskController.remove);

/**
 * PUT /api/v1/tasks/:id/status
 * Feladat státusz módosítása
 */
router.put('/:id/status', checkPermission('tasks.edit'), taskController.updateStatus);

/**
 * GET /api/v1/tasks/:id/subtasks
 * Alfeladatok lekérdezése
 */
router.get('/:id/subtasks', checkPermission('tasks.view'), taskController.getSubtasks);

/**
 * POST /api/v1/tasks/:id/comments
 * Hozzászólás hozzáadása
 */
router.post('/:id/comments', checkPermission('tasks.edit'), taskController.addComment);

/**
 * POST /api/v1/tasks/:id/attachments
 * Melléklet feltöltése
 */
router.post('/:id/attachments', checkPermission('tasks.edit'), attachmentUpload.single('file'), taskController.addAttachment);

/**
 * POST /api/v1/tasks/:id/dependencies
 * Függőség hozzáadása
 */
router.post('/:id/dependencies', checkPermission('tasks.edit'), taskController.addDependency);

/**
 * Multi-assignee endpoints (migration 107). The assignee list lives in
 * task_assignees; the main responsible (tasks.assigned_to) is managed
 * via the existing PUT /:id route.
 */
router.get('/:taskId/assignees',
  checkPermission('tasks.view'), taskAssignees.list);
router.post('/:taskId/assignees',
  checkPermission('tasks.edit'), taskAssignees.add);
router.delete('/:taskId/assignees/:userId',
  checkPermission('tasks.edit'), taskAssignees.remove);
router.patch('/:taskId/assignees/:userId/visit',
  checkPermission('tasks.view'), taskAssignees.markVisited);
router.patch('/:taskId/assignees/:userId/complete',
  checkPermission('tasks.view'), taskAssignees.markCompleted);

module.exports = router;
