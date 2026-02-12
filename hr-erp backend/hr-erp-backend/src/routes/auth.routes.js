const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');

/**
 * POST /api/v1/auth/login
 * Bejelentkezés
 */
router.post('/login', authController.login);

/**
 * POST /api/v1/auth/refresh
 * Token frissítés
 */
router.post('/refresh', authController.refreshToken);

/**
 * GET /api/v1/auth/me
 * Jelenlegi felhasználó adatai (authentikáció szükséges)
 */
router.get('/me', authenticateToken, authController.me);

/**
 * POST /api/v1/auth/logout
 * Kijelentkezés
 */
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
