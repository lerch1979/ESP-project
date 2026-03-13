/**
 * Rate Limiting Middleware
 *
 * Tiered rate limits for different endpoint categories.
 * Uses in-memory store (default). For production with multiple instances,
 * switch to Redis store: npm install rate-limit-redis
 *
 * TODO: Redis store for multi-instance deployments
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { logger } = require('../utils/logger');

const isEnabled = () => process.env.RATE_LIMIT_ENABLED !== 'false';

/**
 * Log rate limit violations to application logs.
 */
function onLimitReached(req, res, options) {
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id || 'anonymous',
    limit: options.max,
    windowMs: options.windowMs,
  });
}

/**
 * Skip rate limiting for superadmin users.
 */
function skipForSuperadmin(req) {
  return req.user?.roles?.includes('superadmin');
}

// ─── Global API Limiter ────────────────────────────────────────
// 100 requests per 15 minutes per IP (fallback for all /api/ routes)
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Túl sok kérés erről az IP címről, kérjük próbálja később.',
    retryAfter: 'Kérjük várjon 15 percet.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isEnabled(),
  handler: (req, res, next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// ─── Auth Limiter ──────────────────────────────────────────────
// 5 requests per 15 minutes per IP (login, register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Túl sok bejelentkezési kísérlet. Próbálja újra 15 perc múlva.',
  },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isEnabled(),
  handler: (req, res, next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// ─── Password Reset Limiter ────────────────────────────────────
// 3 requests per hour per IP
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: 'Túl sok jelszó-visszaállítási kérés. Próbálja újra 1 óra múlva.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isEnabled(),
  handler: (req, res, next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// ─── File Upload Limiter ───────────────────────────────────────
// 10 uploads per hour per IP
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Túl sok fájlfeltöltés. Próbálja újra 1 óra múlva.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isEnabled() || skipForSuperadmin(req),
  handler: (req, res, next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// ─── Authenticated User Limiter ────────────────────────────────
// 1000 requests per hour per authenticated user (keyed by user ID)
const authenticatedLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1000,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    success: false,
    message: 'Túl sok kérés. Kérjük próbálja később.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isEnabled() || skipForSuperadmin(req),
  handler: (req, res, next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// ─── Speed Limiter (Slow Down) ─────────────────────────────────
// After 50 requests in 15 minutes, add 500ms delay per request
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: (hits) => (hits - 50) * 500,
  skip: (req) => !isEnabled() || skipForSuperadmin(req),
});

module.exports = {
  globalLimiter,
  authLimiter,
  passwordResetLimiter,
  uploadLimiter,
  authenticatedLimiter,
  speedLimiter,
};
