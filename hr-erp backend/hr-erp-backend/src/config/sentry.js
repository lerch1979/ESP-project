/**
 * Sentry wiring — graceful no-op when SENTRY_DSN is unset.
 *
 * We intentionally only wire the defaults here. The modern SDK
 * auto-instruments Express + http + postgres when installed, so no
 * manual integration list is needed.
 *
 * Usage in server.js:
 *   const sentry = require('./config/sentry');
 *   sentry.init();                              // before any middleware
 *   ... (routes) ...
 *   sentry.setupErrorHandler(app);              // before your own 500 handler
 *
 * `captureException(err, context?)` is safe to call from anywhere —
 * if Sentry was never initialised, it's a no-op that still logs via
 * the app's logger so the error isn't silently swallowed.
 */
const { logger } = require('../utils/logger');

let enabled = false;
let Sentry = null;

function init() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('[sentry] SENTRY_DSN not set — error reporting disabled');
    return;
  }
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || undefined,
      // Keep the transaction sample low in production — we don't need
      // every request traced, just a statistical sample.
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      // Only send errors by default; turn this up per-env if PII is OK.
      sendDefaultPii: false,
      beforeSend(event) {
        // Strip obviously-sensitive fields from the request context
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        if (event.request?.data) {
          if (typeof event.request.data === 'object') {
            for (const k of ['password', 'token', 'api_key', 'secret', 'signature_data']) {
              if (k in event.request.data) event.request.data[k] = '[Filtered]';
            }
          }
        }
        return event;
      },
    });
    enabled = true;
    logger.info(`[sentry] initialised — environment=${process.env.NODE_ENV || 'development'}`);
  } catch (err) {
    logger.error('[sentry] init failed — continuing without error reporting:', err.message);
  }
}

function setupErrorHandler(app) {
  if (!enabled || !Sentry) return;
  // v8+ helper: registers a plain express error-handling middleware.
  // Call BEFORE the app's own error handler so Sentry sees the error first.
  if (typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
  }
}

function captureException(err, context) {
  if (enabled && Sentry) {
    try { Sentry.captureException(err, context ? { extra: context } : undefined); }
    catch (e) { logger.error('[sentry] captureException failed:', e.message); }
  } else {
    // Ensure the error is still logged locally
    logger.error('[uncaught]', err?.message || err, context || '');
  }
}

function captureMessage(message, level = 'info', context) {
  if (enabled && Sentry) {
    try { Sentry.captureMessage(message, { level, ...(context ? { extra: context } : {}) }); }
    catch (e) { logger.error('[sentry] captureMessage failed:', e.message); }
  }
}

function isEnabled() { return enabled; }

module.exports = { init, setupErrorHandler, captureException, captureMessage, isEnabled };
