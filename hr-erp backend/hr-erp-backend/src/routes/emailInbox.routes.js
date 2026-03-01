const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('../controllers/emailInbox.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Upload directory
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Nem támogatott fájlformátum'));
    }
  },
});

// All routes require auth
router.use(authenticateToken);

// Read endpoints - specific paths BEFORE /:id param
router.get('/', controller.getAll);
router.get('/stats', controller.getStats);
router.get('/gmail-status', controller.getGmailStatus);
router.get('/routing-log/:id', controller.getRoutingLog);
router.get('/:id', controller.getById);

// Write endpoints - require settings.edit permission
router.post('/upload', checkPermission('settings.edit'), upload.single('file'), controller.upload);
router.post('/poll-emails', checkPermission('settings.edit'), controller.pollEmails);
router.post('/classify/:id', checkPermission('settings.edit'), controller.classify);
router.post('/route/:id', checkPermission('settings.edit'), controller.route);
router.post('/reclassify/:id', checkPermission('settings.edit'), controller.reclassify);
router.delete('/:id', checkPermission('settings.edit'), controller.remove);

module.exports = router;
