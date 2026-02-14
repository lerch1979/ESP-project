const express = require('express');
const router = express.Router();
const multer = require('multer');
const tenantController = require('../controllers/tenant.controller');
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
 * GET /api/v1/tenants
 * Bérlők listázása (szűrőkkel, lapozással)
 */
router.get('/', tenantController.getTenants);

/**
 * GET /api/v1/tenants/:id
 * Egy bérlő részletei
 */
router.get('/:id', tenantController.getTenantById);

/**
 * POST /api/v1/tenants
 * Új bérlő létrehozása
 */
router.post('/', tenantController.createTenant);

/**
 * POST /api/v1/tenants/bulk
 * Tömeges bérlő importálás fájlból
 */
router.post('/bulk', upload.single('file'), tenantController.bulkImportTenants);

/**
 * PUT /api/v1/tenants/:id
 * Bérlő frissítése
 */
router.put('/:id', tenantController.updateTenant);

/**
 * DELETE /api/v1/tenants/:id
 * Bérlő törlése (soft delete)
 */
router.delete('/:id', tenantController.deleteTenant);

module.exports = router;
