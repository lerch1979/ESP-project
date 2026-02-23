const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All user routes require authentication
router.use(authenticateToken);

// Felhasználók listája (role szűrővel)
router.get('/', checkPermission('users.view'), userController.getUsers);

// Felhasználó részletei
router.get('/:id', checkPermission('users.view'), userController.getUserById);

// Felhasználó létrehozása
router.post('/', checkPermission('users.create'), userController.createUser);

// Felhasználó frissítése
router.put('/:id', checkPermission('users.edit'), userController.updateUser);

// Felhasználó törlése (deaktiválás)
router.delete('/:id', checkPermission('users.delete'), userController.deleteUser);

// Felhasználó szerepkör frissítése
router.put('/:id/role', checkPermission('users.manage_permissions'), userController.updateUserRole);

module.exports = router;
