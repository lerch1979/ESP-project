const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');

// Brute-force protection: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Túl sok bejelentkezési kísérlet. Próbálja újra 15 perc múlva.' },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/v1/auth/login
 * Bejelentkezés
 */
router.post('/login', loginLimiter, authController.login);

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
