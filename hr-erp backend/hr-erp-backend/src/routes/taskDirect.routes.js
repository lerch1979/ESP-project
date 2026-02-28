const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const taskController = require('../controllers/task.controller');
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

module.exports = router;
