const express = require('express');
const router = express.Router();
const multer = require('multer');
const accommodationController = require('../controllers/accommodation.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

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
 * GET /api/v1/accommodations
 * Szálláshelyek listázása (szűrőkkel, lapozással)
 */
router.get('/', checkPermission('accommodations.view'), accommodationController.getAccommodations);

/**
 * GET /api/v1/accommodations/:id
 * Egy szálláshely részletei
 */
router.get('/:id', checkPermission('accommodations.view'), accommodationController.getAccommodationById);

/**
 * GET /api/v1/accommodations/:id/contractors
 * Szálláshely alvállalkozó történet
 */
router.get('/:id/contractors', checkPermission('accommodations.view'), accommodationController.getAccommodationContractors);

/**
 * GET /api/v1/accommodations/:id/utilities
 * A hat rezsi sor mátrixa (mig 142) — mindig mind a hat, a be nem állítottak alapértékkel.
 */
router.get('/:id/utilities', checkPermission('accommodations.view'), accommodationController.getUtilityMatrix);

/**
 * PUT /api/v1/accommodations/:id/utilities
 * Rezsi-mátrix mentése soronként (ki fizeti · kinek a nevén · továbbszámlázás · arány).
 * Pénzügyi konfiguráció → ugyanaz a jog, mint a szálláshely szerkesztése.
 */
router.put('/:id/utilities', checkPermission('accommodations.edit'), accommodationController.updateUtilityMatrix);

/**
 * POST /api/v1/accommodations
 * Új szálláshely létrehozása
 */
router.post('/', checkPermission('accommodations.create'), accommodationController.createAccommodation);

/**
 * POST /api/v1/accommodations/bulk
 * Tömeges szálláshely importálás fájlból
 */
router.post('/bulk', checkPermission('accommodations.create'), upload.single('file'), accommodationController.bulkImportAccommodations);

/**
 * PUT /api/v1/accommodations/:id
 * Szálláshely frissítése
 */
router.put('/:id', checkPermission('accommodations.edit'), accommodationController.updateAccommodation);

/**
 * DELETE /api/v1/accommodations/:id
 * Szálláshely törlése (soft delete)
 */
router.delete('/:id', checkPermission('accommodations.delete'), accommodationController.deleteAccommodation);

// Room routes
const roomController = require('../controllers/room.controller');
router.get('/:id/rooms', checkPermission('accommodations.view'), roomController.getRoomsByAccommodation);
router.post('/:id/rooms', checkPermission('accommodations.create'), roomController.createRoom);
router.put('/:id/rooms/:roomId', checkPermission('accommodations.edit'), roomController.updateRoom);
router.delete('/:id/rooms/:roomId', checkPermission('accommodations.delete'), roomController.deleteRoom);
// Beköltöztetés/kiköltöztetés a szobalistából. Gated on employees.edit, not
// accommodations.edit: this writes employees.room_id and occupancy history, so the
// permission has to be the one that governs the employee record, not the building.
router.post('/:id/rooms/:roomId/occupants', checkPermission('employees.edit'), roomController.assignOccupant);
router.delete('/:id/rooms/:roomId/occupants/:employeeId', checkPermission('employees.edit'), roomController.removeOccupant);

module.exports = router;
