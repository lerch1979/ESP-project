const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const documentController = require('../controllers/document.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config: disk storage, 20MB limit
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nem engedélyezett fájltípus. Engedélyezett: PDF, képek, Word, Excel, CSV, szöveg'));
    }
  },
});

// All routes require authentication + admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/v1/documents
 * Dokumentumok listázása
 */
router.get('/', documentController.getDocuments);

/**
 * GET /api/v1/documents/:id
 * Egy dokumentum részletei
 */
router.get('/:id', documentController.getDocumentById);

/**
 * POST /api/v1/documents
 * Új dokumentum feltöltése
 */
router.post('/', upload.single('file'), documentController.createDocument);

/**
 * PUT /api/v1/documents/:id
 * Dokumentum metaadatainak frissítése
 */
router.put('/:id', documentController.updateDocument);

/**
 * DELETE /api/v1/documents/:id
 * Dokumentum törlése (soft delete)
 */
router.delete('/:id', documentController.deleteDocument);

/**
 * GET /api/v1/documents/:id/download
 * Dokumentum letöltése
 */
router.get('/:id/download', documentController.downloadDocument);

module.exports = router;
