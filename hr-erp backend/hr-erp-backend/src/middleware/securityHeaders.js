/**
 * Security Headers Middleware
 *
 * Enhanced Helmet.js configuration with strict Content Security Policy.
 * Protects against XSS, clickjacking, MIME sniffing, and other common attacks.
 */

const helmet = require('helmet');
const { logger } = require('../utils/logger');

/**
 * Build the Helmet middleware with full security headers.
 */
function createSecurityHeaders() {
  const isProduction = process.env.NODE_ENV === 'production';
  const enabled = process.env.SECURITY_HEADERS_ENABLED !== 'false';

  if (!enabled) {
    return (req, res, next) => next();
  }

  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // unsafe-inline needed for inline styles from UI frameworks (e.g., MUI, styled-components)
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'https:', 'data:'],
        connectSrc: ["'self'", ...(isProduction ? [] : ['ws:', 'wss:'])],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null,
        // CSP violation reporting
        ...(process.env.CSP_REPORT_URI
          ? { reportUri: process.env.CSP_REPORT_URI }
          : {}),
      },
      reportOnly: !isProduction, // Report-only in development
    },

    // X-DNS-Prefetch-Control: off
    dnsPrefetchControl: { allow: false },

    // X-Frame-Options: DENY — prevents clickjacking
    frameguard: { action: 'deny' },

    // Hide X-Powered-By header
    hidePoweredBy: true,

    // Strict-Transport-Security — enforce HTTPS in production
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: isProduction,
    },

    // X-Content-Type-Options: nosniff — prevents MIME type sniffing
    noSniff: true,

    // X-Permitted-Cross-Domain-Policies: none
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    // Referrer-Policy: strict-origin-when-cross-origin
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // X-XSS-Protection: 0 (modern browsers use CSP instead; the old filter can cause issues)
    xssFilter: false,

    // Cross-Origin policies
    crossOriginEmbedderPolicy: false, // Can break loading of external resources
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
}

/**
 * CSP Violation Report Handler
 * POST /api/v1/csp-report
 */
function cspReportHandler(req, res) {
  const report = req.body?.['csp-report'] || req.body;
  logger.warn('CSP Violation Report', {
    documentUri: report?.['document-uri'],
    violatedDirective: report?.['violated-directive'],
    blockedUri: report?.['blocked-uri'],
    sourceFile: report?.['source-file'],
    lineNumber: report?.['line-number'],
  });
  res.status(204).end();
}

/**
 * Additional custom security headers not covered by Helmet.
 */
function additionalHeaders(req, res, next) {
  // Permissions-Policy: restrict browser features
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Cache-Control for API responses — prevent sensitive data caching
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
}

module.exports = {
  createSecurityHeaders,
  cspReportHandler,
  additionalHeaders,
};
