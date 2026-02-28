const express = require('express');
const router = express.Router();
const controller = require('../controllers/assignmentRule.controller');
const { authenticateToken, checkContractorAccess } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Minden route-hoz authentikáció szükséges
router.use(authenticateToken);
router.use(checkContractorAccess);

/**
 * GET /api/v1/assignment-rules
 * Kiosztási szabályok listázása
 * Query: ?type=ticket|task&is_active=true|false
 */
router.get('/', checkPermission('settings.view'), controller.getAll);

/**
 * POST /api/v1/assignment-rules/simulate
 * Szimuláció: milyen szabály illeszkedne és ki lenne kijelölve
 * Body: { type: 'ticket'|'task', item: { status_slug, category_slug, priority_slug, ... } }
 */
router.post('/simulate', checkPermission('settings.view'), controller.simulate);

/**
 * GET /api/v1/assignment-rules/:id
 * Egy kiosztási szabály részletei
 */
router.get('/:id', checkPermission('settings.view'), controller.getById);

/**
 * POST /api/v1/assignment-rules
 * Új kiosztási szabály létrehozása
 * Body: { name, type, conditions, assign_to_role, assign_to_user_id, assign_strategy, priority, is_active }
 */
router.post('/', checkPermission('settings.edit'), controller.create);

/**
 * PUT /api/v1/assignment-rules/:id
 * Kiosztási szabály módosítása
 */
router.put('/:id', checkPermission('settings.edit'), controller.update);

/**
 * DELETE /api/v1/assignment-rules/:id
 * Kiosztási szabály törlése
 */
router.delete('/:id', checkPermission('settings.edit'), controller.remove);

module.exports = router;
