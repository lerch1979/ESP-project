const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const employeeController = require('../controllers/employee.controller');
const employeeDocController = require('../controllers/employee-document.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

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

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/v1/employees/statuses
 * Munkavállalói státuszok listázása (dropdown-okhoz)
 */
router.get('/statuses', checkPermission('employees.view'), employeeController.getEmployeeStatuses);

/**
 * GET/DELETE /api/v1/employees/documents/:docId
 * Must be before /:id to avoid matching "documents" as an employee id
 */
router.get('/documents/:docId', checkPermission('employees.view'), employeeDocController.getDocument);
router.delete('/documents/:docId', checkPermission('employees.delete'), employeeDocController.deleteDocument);

/**
 * GET /api/v1/employees
 * Munkavállalók listázása (szűrőkkel, lapozással)
 */
router.get('/', checkPermission('employees.view'), employeeController.getEmployees);

/**
 * POST /api/v1/employees/bulk-update
 * Tömeges státusz frissítés
 */
router.post('/bulk-update', checkPermission('employees.edit'), employeeController.bulkUpdateStatus);

/**
 * POST /api/v1/employees/bulk-delete
 * Tömeges törlés (soft delete)
 */
router.post('/bulk-delete', checkPermission('employees.delete'), employeeController.bulkDelete);

/**
 * POST /api/v1/employees/bulk-export
 * Kiválasztott munkavállalók exportálása
 */
router.post('/bulk-export', checkPermission('employees.export'), employeeController.bulkExport);

/**
 * GET /api/v1/employees/:id
 * Egy munkavállaló részletei
 */
router.get('/:id', checkPermission('employees.view'), employeeController.getEmployeeById);

/**
 * POST /api/v1/employees
 * Új munkavállaló létrehozása
 */
router.post('/', checkPermission('employees.create'), employeeController.createEmployee);

/**
 * POST /api/v1/employees/bulk
 * Tömeges munkavállaló importálás fájlból
 */
router.post('/bulk', checkPermission('employees.create'), upload.single('file'), employeeController.bulkImportEmployees);

/**
 * PUT /api/v1/employees/:id
 * Munkavállaló frissítése
 */
router.put('/:id', checkPermission('employees.edit'), employeeController.updateEmployee);

/**
 * DELETE /api/v1/employees/:id
 * Munkavállaló törlése (soft delete)
 */
router.delete('/:id', checkPermission('employees.delete'), employeeController.deleteEmployee);

/**
 * POST /api/v1/employees/:id/photo
 * Profilkép feltöltése
 */
router.post('/:id/photo', checkPermission('employees.edit'), photoUpload.single('photo'), employeeController.uploadPhoto);

/**
 * DELETE /api/v1/employees/:id/photo
 * Profilkép törlése
 */
router.delete('/:id/photo', checkPermission('employees.edit'), employeeController.deletePhoto);

/**
 * GET /api/v1/employees/:id/timeline
 * Munkavállaló idővonal (összes esemény aggregálva)
 */
router.get('/:id/timeline', checkPermission('employees.view'), employeeController.getEmployeeTimeline);

/**
 * POST /api/v1/employees/:id/notes
 * Jegyzet hozzáadása a munkavállalóhoz
 */
router.post('/:id/notes', checkPermission('employees.edit'), employeeController.createEmployeeNote);

/**
 * DELETE /api/v1/employees/:id/notes/:noteId
 * Jegyzet törlése
 */
router.delete('/:id/notes/:noteId', checkPermission('employees.delete'), employeeController.deleteEmployeeNote);

// ============================================================
// Employee Documents (Scan & Upload)
// ============================================================

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const empId = req.params.id;
    const dir = path.join(__dirname, '..', '..', 'uploads', 'employee-documents', String(empId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `original_${timestamp}_${safeName}`);
  },
});

const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Csak képek és PDF fájlok engedélyezettek'));
    }
  },
});

router.post('/:id/documents', checkPermission('employees.upload_documents'), docUpload.single('document'), employeeDocController.uploadDocument);
router.get('/:id/documents', checkPermission('employees.view'), employeeDocController.getDocuments);

module.exports = router;
