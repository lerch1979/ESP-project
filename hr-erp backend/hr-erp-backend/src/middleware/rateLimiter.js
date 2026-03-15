/**
 * Rate Limiting Middleware
 *
 * Environment-aware tiered rate limits:
 * - test: all limiters are no-ops (passthrough)
 * - development: relaxed limits for comfortable dev workflow
 * - production: balanced limits for security + usability
 *
 * Auth & password-reset limits are STRICT in ALL environments.
 *
 * Uses in-memory store (default). For production with multiple instances,
 * switch to Redis store: npm install rate-limit-redis
 */

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isTest = process.env.NODE_ENV === 'test';

if (isTest) {
  // ─── Test environment: no-op passthrough ─────────────────────
  const passthrough = (req, res, next) => next();
  module.exports = {
    globalLimiter: passthrough,
    authLimiter: passthrough,
    passwordResetLimiter: passthrough,
    uploadLimiter: passthrough,
    authenticatedLimiter: passthrough,
    speedLimiter: passthrough,
  };
} else {
  // ─── Development / Production ────────────────────────────────
  const rateLimit = require('express-rate-limit');
  const slowDown = require('express-slow-down');
  const { logger } = require('../utils/logger');

  // ─── Rate limit configuration ────────────────────────────────
  const RATE_LIMITS = {
    global: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      maxDev: 10000,
      maxProd: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
      message: 'Túl sok kérés ebből a címből. Kérjük várjon 15 percet.',
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 5, // Same for dev AND prod - brute force protection is critical
      message: 'Túl sok bejelentkezési kísérlet. Kérjük várjon 15 percet.',
    },
    passwordReset: {
      windowMs: 60 * 60 * 1000,
      max: 3, // Same for dev AND prod
      message: 'Túl sok jelszó-visszaállítási kérés. Kérjük várjon 1 órát.',
    },
    upload: {
      windowMs: 60 * 60 * 1000,
      maxDev: 1000,
      maxProd: 50,
      message: 'Túl sok fájlfeltöltés. Kérjük várjon 1 órát.',
    },
    authenticated: {
      windowMs: 60 * 60 * 1000,
      maxDev: 100000,
      maxProd: 10000,
      message: 'Túl sok kérés. Kérjük várjon 1 órát.',
    },
  };

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

  function createLimiter(config, opts = {}) {
    const max = isDev ? (config.maxDev || config.max) : (config.maxProd || config.max);

    return rateLimit({
      windowMs: config.windowMs,
      max,
      message: { success: false, message: config.message },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: isDev && !opts.alwaysStrict,
      keyGenerator: opts.keyGenerator || ((req) => req.ip),
      handler: (req, res, next, options) => {
        onLimitReached(req, res, options);
        res.status(429).json(options.message);
      },
    });
  }

  const globalLimiter = createLimiter(RATE_LIMITS.global);
  const authLimiter = createLimiter(RATE_LIMITS.auth, { alwaysStrict: true });
  const passwordResetLimiter = createLimiter(RATE_LIMITS.passwordReset, { alwaysStrict: true });
  const uploadLimiter = createLimiter(RATE_LIMITS.upload);
  const authenticatedLimiter = createLimiter(RATE_LIMITS.authenticated, {
    keyGenerator: (req) => req.user?.id?.toString() || req.ip,
  });

  const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: isDev ? 1000 : 50,
    delayMs: () => 500,
    maxDelayMs: 20000,
  });

  // Startup log
  logger.info(`[Rate Limiting] Environment: ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'}`);
  logger.info(`[Rate Limiting] Global: ${isDev ? RATE_LIMITS.global.maxDev : RATE_LIMITS.global.maxProd} req/15min per IP`);
  logger.info(`[Rate Limiting] Auth: ${RATE_LIMITS.auth.max} req/15min (strict - brute force protection)`);
  logger.info(`[Rate Limiting] Authenticated: ${isDev ? RATE_LIMITS.authenticated.maxDev : RATE_LIMITS.authenticated.maxProd} req/hour per user`);

  module.exports = {
    globalLimiter,
    authLimiter,
    passwordResetLimiter,
    uploadLimiter,
    authenticatedLimiter,
    speedLimiter,
  };
}
