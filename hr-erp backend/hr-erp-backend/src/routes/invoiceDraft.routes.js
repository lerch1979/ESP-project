// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
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

// GET routes — staff-only (settings.edit) + contractor-scoped (DEEP_AUDIT finding 3).
router.get('/stats', checkPermission('finance.edit'), controller.getStats);
router.get('/', checkPermission('finance.edit'), controller.getAll);
router.get('/:id', checkPermission('finance.edit'), controller.getById);

// Actions — previously-ungated upload/update/re-ocr are part of the same
// resident-reachable hole (finding 3), now gated too.
router.post('/upload', checkPermission('finance.edit'), upload.single('file'), controller.uploadPDF);
router.post('/poll-emails', checkPermission('finance.edit'), controller.pollEmails);
router.put('/:id', checkPermission('finance.edit'), controller.update);
router.post('/:id/approve', checkPermission('finance.edit'), controller.approve);
router.post('/:id/reject',  checkPermission('finance.edit'), controller.reject);
router.post('/:id/convert', checkPermission('finance.edit'), controller.convert);
router.post('/:id/re-ocr', checkPermission('finance.edit'), controller.reRunOCR);
router.delete('/:id', checkPermission('finance.edit'), controller.remove);

module.exports = router;
