const express = require('express');
const router = express.Router();
const multer = require('multer');
const contractorController = require('../controllers/contractor.controller');
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
 * GET /api/v1/contractors
 * Alvállalkozók listázása (szűrőkkel, lapozással)
 */
router.get('/', contractorController.getContractors);

/**
 * GET /api/v1/contractors/:id
 * Egy alvállalkozó részletei
 */
router.get('/:id', contractorController.getContractorById);

/**
 * POST /api/v1/contractors
 * Új alvállalkozó létrehozása
 */
router.post('/', contractorController.createContractor);

/**
 * POST /api/v1/contractors/bulk
 * Tömeges alvállalkozó importálás fájlból
 */
router.post('/bulk', upload.single('file'), contractorController.bulkImportContractors);

/**
 * PUT /api/v1/contractors/:id
 * Alvállalkozó frissítése
 */
router.put('/:id', contractorController.updateContractor);

/**
 * DELETE /api/v1/contractors/:id
 * Alvállalkozó törlése (soft delete)
 */
router.delete('/:id', contractorController.deleteContractor);

module.exports = router;
