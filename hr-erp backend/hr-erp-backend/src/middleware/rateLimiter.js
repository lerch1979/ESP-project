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
      // Coarse per-IP ANTI-DoS ceiling ONLY — must never brake legitimate use.
      // An authenticated admin power-user (data-heavy pages fan out ~15–20 calls
      // each) easily does 1000+ requests in 15 min; a shared-NAT accommodation
      // (many residents on one public IP) adds more. 5000/15min per IP is ~5.5/s
      // sustained — ample headroom for real use, still caps a genuine flood.
      // Per-USER budgets are enforced separately by authenticatedLimiter (post-auth).
      // (2026-07-13 incident: a prod env override of 200 throttled the owner mid-work.)
      maxProd: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5000,
      message: 'Túl sok kérés ebből a címből. Kérjük várjon 15 percet.',
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      maxDev: 1000,  // Dev: effectively unlimited
      maxProd: 10,   // Prod: FAILED logins per 15min per client IP (successes don't count).
                     // Sized so a shared-NAT accommodation (roommates on one public IP) isn't
                     // throttled by a few mistyped passwords, while still stopping brute force.
      message: 'Túl sok sikertelen bejelentkezési kísérlet. Kérjük várjon 15 percet.',
    },
    passwordReset: {
      windowMs: 60 * 60 * 1000,
      maxDev: 100,   // Dev: relaxed
      maxProd: 3,    // Prod: strict
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
      // Per-USER budget (keyed by user id, applied post-auth in authenticateToken).
      // Generous — 10000/hour/user is ~2.8/s sustained per account; a real admin
      // never approaches it, but one runaway/compromised account is still bounded.
      // Env-tunable so ops can adjust without a redeploy.
      maxProd: parseInt(process.env.RATE_LIMIT_AUTHENTICATED_MAX) || 10000,
      message: 'Túl sok kérés. Kérjük várjon 1 órát.',
    },
  };

  function onLimitReached(req, res, options) {
    // Log LOUDLY and greppably. A 429 hitting an AUTHENTICATED admin is a red flag
    // that a limit is mis-sized (this is exactly how the 2026-07 owner incident
    // would have surfaced) — surface the userId so legit-use hits stand out from
    // anonymous flood/brute-force.
    logger.warn('[RATE-LIMIT] 429 blocked — request rejected', {
      limiter: options.limiterName || 'global',
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
      userId: req.user?.id || 'anonymous',
      authenticated: !!req.user,
      max: options.max,
      windowMs: options.windowMs,
    });
  }

  function createLimiter(config, opts = {}) {
    const max = isDev ? (config.maxDev || config.max) : (config.maxProd || config.max);

    return rateLimit({
      windowMs: config.windowMs,
      max,
      limiterName: opts.name || 'global',   // surfaced in the 429 log so we know which limiter fired
      message: { success: false, message: config.message },
      standardHeaders: true,
      legacyHeaders: false,
      // Per-limiter override wins; otherwise dev skips successes for a comfortable workflow.
      // Auth passes `skipSuccessfulRequests: true` so a successful login never consumes budget —
      // only failed attempts count toward the cap (standard brute-force-protection shape).
      skipSuccessfulRequests:
        opts.skipSuccessfulRequests !== undefined
          ? opts.skipSuccessfulRequests
          : (isDev && !opts.alwaysStrict),
      keyGenerator: opts.keyGenerator || ((req) => req.ip),
      handler: (req, res, next, options) => {
        onLimitReached(req, res, options);
        res.status(429).json(options.message);
      },
    });
  }

  const globalLimiter = createLimiter(RATE_LIMITS.global, { name: 'global' });
  const authLimiter = createLimiter(RATE_LIMITS.auth, { name: 'auth-login', skipSuccessfulRequests: true });
  const passwordResetLimiter = createLimiter(RATE_LIMITS.passwordReset, { name: 'password-reset' });
  const uploadLimiter = createLimiter(RATE_LIMITS.upload, { name: 'upload' });
  const authenticatedLimiter = createLimiter(RATE_LIMITS.authenticated, {
    name: 'authenticated-per-user',
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
  logger.info(`[Rate Limiting] Auth: ${isDev ? RATE_LIMITS.auth.maxDev : RATE_LIMITS.auth.maxProd} FAILED logins/15min per client IP${isDev ? ' (dev - relaxed)' : ' (successes not counted; brute force protection)'}`);
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
