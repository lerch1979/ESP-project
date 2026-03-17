/**
 * SSL/TLS Configuration
 *
 * Environment-based SSL enforcement for:
 *  - Database connections
 *  - HTTPS enforcement
 *  - External API calls
 */

const fs = require('fs');
const { logger } = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// ─── Database SSL ──────────────────────────────────────────────────────────

function getDatabaseSSLConfig() {
  const sslEnabled = process.env.DB_SSL === 'true';

  if (!sslEnabled) {
    if (isProduction) {
      logger.warn('[SSL] DB_SSL is not enabled in production! This is a security risk.');
    }
    return false;
  }

  const config = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };

  // Custom CA certificate
  if (process.env.DB_SSL_CA) {
    try {
      if (fs.existsSync(process.env.DB_SSL_CA)) {
        config.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
      } else {
        // Treat as inline certificate
        config.ca = process.env.DB_SSL_CA;
      }
    } catch (err) {
      logger.error('[SSL] Failed to read CA certificate:', { error: err.message });
    }
  }

  // Client certificate (mutual TLS)
  if (process.env.DB_SSL_CERT && process.env.DB_SSL_KEY) {
    try {
      config.cert = fs.existsSync(process.env.DB_SSL_CERT)
        ? fs.readFileSync(process.env.DB_SSL_CERT, 'utf8')
        : process.env.DB_SSL_CERT;
      config.key = fs.existsSync(process.env.DB_SSL_KEY)
        ? fs.readFileSync(process.env.DB_SSL_KEY, 'utf8')
        : process.env.DB_SSL_KEY;
    } catch (err) {
      logger.error('[SSL] Failed to read client certificate:', { error: err.message });
    }
  }

  return config;
}

// ─── HTTPS Enforcement ─────────────────────────────────────────────────────

/**
 * Express middleware: enforce HTTPS in production.
 * Redirects HTTP to HTTPS and sets HSTS header.
 */
function enforceHTTPS(req, res, next) {
  // Skip in development/test
  if (!isProduction || isTest) {
    return next();
  }

  // Check for HTTPS (direct or behind proxy)
  const isSecure = req.secure
    || req.headers['x-forwarded-proto'] === 'https'
    || req.headers['x-forwarded-ssl'] === 'on';

  if (!isSecure) {
    const httpsUrl = `https://${req.headers.host}${req.originalUrl}`;
    return res.redirect(301, httpsUrl);
  }

  // HSTS header (1 year, include subdomains, preload)
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  next();
}

// ─── External API SSL ──────────────────────────────────────────────────────

/**
 * Get HTTPS agent options for external API calls.
 */
function getExternalSSLOptions() {
  if (isProduction) {
    return {
      rejectUnauthorized: true, // Always verify certificates in production
    };
  }

  // Allow self-signed in development
  return {
    rejectUnauthorized: process.env.REJECT_SELF_SIGNED !== 'false',
  };
}

// ─── Validation ────────────────────────────────────────────────────────────

/**
 * Validate SSL configuration at startup.
 * Returns warnings for production misconfigurations.
 */
function validateSSLConfig() {
  const warnings = [];

  if (isProduction) {
    if (process.env.DB_SSL !== 'true') {
      warnings.push('DB_SSL is not enabled in production');
    }
    if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
      warnings.push('DB_SSL_REJECT_UNAUTHORIZED is false in production — certificates not verified');
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      warnings.push('JWT_SECRET should be at least 32 characters in production');
    }
    if (!process.env.ENCRYPTION_KEY) {
      warnings.push('ENCRYPTION_KEY is not set — PII data is not encrypted');
    }
  }

  for (const w of warnings) {
    logger.warn(`[SSL Config] ${w}`);
  }

  return warnings;
}

module.exports = {
  getDatabaseSSLConfig,
  enforceHTTPS,
  getExternalSSLOptions,
  validateSSLConfig,
  isProduction,
};
