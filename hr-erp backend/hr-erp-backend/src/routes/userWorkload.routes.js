const express = require('express');
const router = express.Router();
const controller = require('../controllers/userWorkload.controller');
const { authenticateToken, checkContractorAccess } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Minden route-hoz authentikáció szükséges
router.use(authenticateToken);
router.use(checkContractorAccess);

/**
 * GET /api/v1/user-workload
 * Felhasználók munkaterhelése
 */
router.get('/', checkPermission('users.view'), controller.getAll);

/**
 * POST /api/v1/user-workload/recalculate
 * Munkaterhelés újraszámítása (admin)
 */
router.post('/recalculate', checkPermission('settings.edit'), controller.recalculate);

/**
 * GET /api/v1/user-workload/:userId
 * Egy felhasználó munkaterhelése részletesen
 */
router.get('/:userId', checkPermission('users.view'), controller.getByUserId);

/**
 * GET /api/v1/user-skills
 * Felhasználói képességek listázása
 */
router.get('/skills/all', checkPermission('users.view'), controller.getSkills);

/**
 * POST /api/v1/user-skills
 * Képesség hozzáadása
 */
router.post('/skills', checkPermission('users.edit'), controller.addSkill);

/**
 * DELETE /api/v1/user-skills/:id
 * Képesség törlése
 */
router.delete('/skills/:id', checkPermission('users.edit'), controller.removeSkill);

module.exports = router;
