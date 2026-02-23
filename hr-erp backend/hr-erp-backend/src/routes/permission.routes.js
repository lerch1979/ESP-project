const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All permission routes require authentication
router.use(authenticateToken);

/**
 * GET /api/v1/permissions
 * Összes elérhető jogosultság listázása
 */
router.get('/', checkPermission('users.view'), permissionController.getAllPermissions);

/**
 * GET /api/v1/permissions/roles
 * Összes szerepkör jogosultságokkal
 */
router.get('/roles', checkPermission('users.view'), permissionController.getRoles);

/**
 * POST /api/v1/permissions/roles
 * Új szerepkör létrehozása
 */
router.post('/roles', checkPermission('users.manage_permissions'), permissionController.createRole);

/**
 * PUT /api/v1/permissions/roles/:id/permissions
 * Szerepkör jogosultságainak frissítése
 */
router.put('/roles/:id/permissions', checkPermission('users.manage_permissions'), permissionController.updateRolePermissions);

/**
 * GET /api/v1/permissions/users/:id
 * Felhasználó effektív jogosultságai
 */
router.get('/users/:id', checkPermission('users.view'), permissionController.getUserPermissions);

/**
 * PUT /api/v1/permissions/users/:id
 * Felhasználó jogosultságainak frissítése (egyéni felülírások)
 */
router.put('/users/:id', checkPermission('users.manage_permissions'), permissionController.updateUserPermissions);

module.exports = router;
