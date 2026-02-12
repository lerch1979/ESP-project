const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticateToken } = require('../middleware/auth');

// Felhasználók listája (role szűrővel)
router.get('/', authenticateToken, userController.getUsers);

// Felhasználó részletei
router.get('/:id', authenticateToken, userController.getUserById);

module.exports = router;
