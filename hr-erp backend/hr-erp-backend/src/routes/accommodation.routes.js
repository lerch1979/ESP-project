const express = require('express');
const router = express.Router();
const multer = require('multer');
const accommodationController = require('../controllers/accommodation.controller');
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
 * GET /api/v1/accommodations
 * Szálláshelyek listázása (szűrőkkel, lapozással)
 */
router.get('/', accommodationController.getAccommodations);

/**
 * GET /api/v1/accommodations/:id
 * Egy szálláshely részletei
 */
router.get('/:id', accommodationController.getAccommodationById);

/**
 * GET /api/v1/accommodations/:id/contractors
 * Szálláshely alvállalkozó történet
 */
router.get('/:id/contractors', accommodationController.getAccommodationContractors);

/**
 * POST /api/v1/accommodations
 * Új szálláshely létrehozása
 */
router.post('/', accommodationController.createAccommodation);

/**
 * POST /api/v1/accommodations/bulk
 * Tömeges szálláshely importálás fájlból
 */
router.post('/bulk', upload.single('file'), accommodationController.bulkImportAccommodations);

/**
 * PUT /api/v1/accommodations/:id
 * Szálláshely frissítése
 */
router.put('/:id', accommodationController.updateAccommodation);

/**
 * DELETE /api/v1/accommodations/:id
 * Szálláshely törlése (soft delete)
 */
router.delete('/:id', accommodationController.deleteAccommodation);

module.exports = router;
