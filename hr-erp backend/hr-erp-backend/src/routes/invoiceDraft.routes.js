const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const controller = require('../controllers/invoiceDraft.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Multer config for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'uploads', 'invoices'));
  },
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
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Csak PDF, PNG, JPG fájlok engedélyezettek'));
    }
  },
});

// All routes require authentication
router.use(authenticateToken);

// GET routes
router.get('/stats', controller.getStats);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);

// Actions
router.post('/upload', upload.single('file'), controller.uploadPDF);
router.post('/poll-emails', checkPermission('settings.edit'), controller.pollEmails);
router.put('/:id', controller.update);
router.post('/:id/approve', checkPermission('settings.edit'), controller.approve);
router.post('/:id/reject', checkPermission('settings.edit'), controller.reject);
router.post('/:id/re-ocr', controller.reRunOCR);
router.delete('/:id', checkPermission('settings.edit'), controller.remove);

module.exports = router;
