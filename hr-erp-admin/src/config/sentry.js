/**
 * Sentry wiring for the admin React app.
 *
 * Graceful no-op when `VITE_SENTRY_DSN` is unset (local dev, CI). When the
 * DSN is set, tracks errors + a small fraction of transactions; also
 * gives us the ErrorBoundary wrapper.
 */
import * as Sentry from '@sentry/react';

let enabled = false;

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.info('[sentry] VITE_SENTRY_DSN not set — error reporting disabled');
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    tracesSampleRate: parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    // Replay can be enabled later; default off to keep bundle lean.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
  enabled = true;
}

export function isSentryEnabled() { return enabled; }
export { Sentry };
