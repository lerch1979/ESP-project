const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const langCtrl = require('../controllers/language.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Language management (MUST be before /:id routes)
router.get('/languages', langCtrl.getSupportedLanguages);
router.get('/language-stats', langCtrl.getLanguageStats);
router.get('/me/language', langCtrl.getMyLanguage);
router.patch('/me/language', langCtrl.updateMyLanguage);
router.post('/bulk-language-assignment', langCtrl.bulkLanguageAssignment);
router.patch('/:id/language', langCtrl.updateUserLanguage);

// Felhasználók listája
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
