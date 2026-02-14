const express = require('express');
const router = express.Router();
const multer = require('multer');
const employeeController = require('../controllers/employee.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

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

module.exports = router;
