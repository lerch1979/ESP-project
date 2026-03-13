/**
 * CSRF Protection Middleware
 *
 * Custom implementation using crypto tokens (csurf is deprecated).
 *
 * Strategy:
 * - JWT Bearer token requests are inherently CSRF-safe (token in Authorization header
 *   cannot be sent automatically by a browser cross-origin form/link).
 * - Cookie-based sessions (if any) need CSRF tokens.
 * - This middleware provides double-submit cookie pattern for defense-in-depth.
 */

const crypto = require('crypto');
const { logger } = require('../utils/logger');

const CSRF_COOKIE_NAME = '_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Generate a cryptographically secure CSRF token.
 */
function generateToken() {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Check if request uses JWT Bearer authentication (inherently CSRF-safe).
 */
function hasJwtBearer(req) {
  const authHeader = req.headers['authorization'];
  return authHeader && authHeader.startsWith('Bearer ');
}

/**
 * CSRF Protection middleware.
 *
 * Uses double-submit cookie pattern:
 * 1. Sets a CSRF token in a cookie (readable by JavaScript)
 * 2. Expects the same token in the x-csrf-token header on state-changing requests
 *
 * Skips validation for:
 * - Safe HTTP methods (GET, HEAD, OPTIONS)
 * - Requests with JWT Bearer tokens (CSRF not applicable)
 * - Explicitly exempted paths
 */
function csrfProtection(options = {}) {
  const {
    exemptPaths = [],
    enabled = process.env.CSRF_ENABLED !== 'false',
  } = options;

  return (req, res, next) => {
    if (!enabled) return next();

    // Always set/refresh the CSRF cookie so frontend can read it
    if (!req.cookies?.[CSRF_COOKIE_NAME]) {
      const token = generateToken();
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Must be readable by JavaScript
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
      });
      req._csrfToken = token;
    } else {
      req._csrfToken = req.cookies[CSRF_COOKIE_NAME];
    }

    // Expose helper for templates/responses
    res.locals.csrfToken = req._csrfToken;

    // Safe methods don't need CSRF validation
    if (SAFE_METHODS.includes(req.method)) return next();

    // JWT Bearer requests are inherently CSRF-safe
    if (hasJwtBearer(req)) return next();

    // Check exempt paths
    const isExempt = exemptPaths.some(p => req.path.startsWith(p));
    if (isExempt) return next();

    // Validate: cookie token must match header token
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      logger.warn('CSRF validation failed', {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
        hasCookie: !!cookieToken,
        hasHeader: !!headerToken,
      });

      return res.status(403).json({
        success: false,
        message: 'Érvénytelen CSRF token. Kérjük frissítse az oldalt és próbálja újra.',
        code: 'CSRF_INVALID',
      });
    }

    next();
  };
}

/**
 * Route handler to issue a CSRF token.
 * GET /api/v1/csrf-token
 */
function csrfTokenHandler(req, res) {
  const token = req._csrfToken || req.cookies?.[CSRF_COOKIE_NAME] || generateToken();

  // Set/refresh cookie
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  res.json({
    success: true,
    csrfToken: token,
  });
}

module.exports = {
  csrfProtection,
  csrfTokenHandler,
  generateToken,
};
