const express = require('express');
const router = express.Router({ mergeParams: true });
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
// Project-scoped task routes (mounted on /api/v1/projects/:projectId/tasks)
// ============================================

/**
 * GET /api/v1/projects/:projectId/tasks
 * Projekt feladatainak listája
 */
router.get('/', checkPermission('tasks.view'), taskController.getAll);

/**
 * POST /api/v1/projects/:projectId/tasks
 * Új feladat létrehozása
 */
router.post('/', checkPermission('tasks.create'), taskController.create);

module.exports = router;
