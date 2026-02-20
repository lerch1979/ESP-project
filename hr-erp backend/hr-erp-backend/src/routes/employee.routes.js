const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const employeeController = require('../controllers/employee.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Photo upload multer config
const photoUploadDir = path.join(__dirname, '..', '..', 'uploads', 'employees');
if (!fs.existsSync(photoUploadDir)) {
  fs.mkdirSync(photoUploadDir, { recursive: true });
}

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, photoUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'raw_' + uniqueSuffix + ext);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Csak JPEG, PNG vagy WebP képek engedélyezettek'));
    }
  },
});

// Multer config: memory storage, 5MB limit, xlsx/xls/csv only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Csak .xlsx, .xls vagy .csv fájlok engedélyezettek'));
    }
  },
});

// All routes require authentication + admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/v1/employees/statuses
 * Munkavállalói státuszok listázása (dropdown-okhoz)
 */
router.get('/statuses', employeeController.getEmployeeStatuses);

/**
 * GET /api/v1/employees
 * Munkavállalók listázása (szűrőkkel, lapozással)
 */
router.get('/', employeeController.getEmployees);

/**
 * POST /api/v1/employees/bulk-update
 * Tömeges státusz frissítés
 */
router.post('/bulk-update', employeeController.bulkUpdateStatus);

/**
 * POST /api/v1/employees/bulk-delete
 * Tömeges törlés (soft delete)
 */
router.post('/bulk-delete', employeeController.bulkDelete);

/**
 * POST /api/v1/employees/bulk-export
 * Kiválasztott munkavállalók exportálása
 */
router.post('/bulk-export', employeeController.bulkExport);

/**
 * GET /api/v1/employees/:id
 * Egy munkavállaló részletei
 */
router.get('/:id', employeeController.getEmployeeById);

/**
 * POST /api/v1/employees
 * Új munkavállaló létrehozása
 */
router.post('/', employeeController.createEmployee);

/**
 * POST /api/v1/employees/bulk
 * Tömeges munkavállaló importálás fájlból
 */
router.post('/bulk', upload.single('file'), employeeController.bulkImportEmployees);

/**
 * PUT /api/v1/employees/:id
 * Munkavállaló frissítése
 */
router.put('/:id', employeeController.updateEmployee);

/**
 * DELETE /api/v1/employees/:id
 * Munkavállaló törlése (soft delete)
 */
router.delete('/:id', employeeController.deleteEmployee);

/**
 * POST /api/v1/employees/:id/photo
 * Profilkép feltöltése
 */
router.post('/:id/photo', photoUpload.single('photo'), employeeController.uploadPhoto);

/**
 * DELETE /api/v1/employees/:id/photo
 * Profilkép törlése
 */
router.delete('/:id/photo', employeeController.deletePhoto);

/**
 * GET /api/v1/employees/:id/timeline
 * Munkavállaló idővonal (összes esemény aggregálva)
 */
router.get('/:id/timeline', employeeController.getEmployeeTimeline);

/**
 * POST /api/v1/employees/:id/notes
 * Jegyzet hozzáadása a munkavállalóhoz
 */
router.post('/:id/notes', employeeController.createEmployeeNote);

/**
 * DELETE /api/v1/employees/:id/notes/:noteId
 * Jegyzet törlése
 */
router.delete('/:id/notes/:noteId', employeeController.deleteEmployeeNote);

module.exports = router;
