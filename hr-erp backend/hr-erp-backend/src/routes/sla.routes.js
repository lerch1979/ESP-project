const express = require('express');
const router = express.Router();
const controller = require('../controllers/sla.controller');
const { authenticateToken, checkContractorAccess } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Minden route-hoz authentikáció szükséges
router.use(authenticateToken);
router.use(checkContractorAccess);

/**
 * GET /api/v1/sla-policies
 * SLA szabályzatok listázása
 * Query: ?is_active=true|false
 */
router.get('/', checkPermission('settings.view'), controller.getAll);

/**
 * GET /api/v1/sla-policies/:id
 * Egy SLA szabályzat részletei
 */
router.get('/:id', checkPermission('settings.view'), controller.getById);

/**
 * POST /api/v1/sla-policies
 * Új SLA szabályzat létrehozása
 */
router.post('/', checkPermission('settings.edit'), controller.create);

/**
 * PUT /api/v1/sla-policies/:id
 * SLA szabályzat módosítása
 */
router.put('/:id', checkPermission('settings.edit'), controller.update);

/**
 * DELETE /api/v1/sla-policies/:id
 * SLA szabályzat törlése
 */
router.delete('/:id', checkPermission('settings.edit'), controller.remove);

module.exports = router;
