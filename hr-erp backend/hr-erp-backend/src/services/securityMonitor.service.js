/**
 * Security Monitor Service
 *
 * Tracks and alerts on security events:
 *   - Failed login attempts
 *   - Suspicious activity patterns
 *   - Account lockouts
 *   - PII access logging
 *   - Daily security reports
 */

const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// ─── Event Types ────────────────────────────────────────────────────────────

const EVENT_TYPES = {
  LOGIN_FAILED: 'login_failed',
  LOGIN_SUCCESS: 'login_success',
  ACCOUNT_LOCKED: 'account_locked',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_EXPIRED: 'password_expired',
  PII_ACCESSED: 'pii_accessed',
  PERMISSION_DENIED: 'permission_denied',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  RATE_LIMIT_HIT: 'rate_limit_hit',
  CSRF_VIOLATION: 'csrf_violation',
};

const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

// ─── Event Logging ──────────────────────────────────────────────────────────

/**
 * Log a security event.
 */
async function logEvent(eventType, severity, details = {}) {
  try {
    await query(
      `INSERT INTO security_events (event_type, severity, user_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        eventType,
        severity,
        details.userId || null,
        details.ip || null,
        details.userAgent || null,
        JSON.stringify({
          ...details,
          userId: undefined,
          ip: undefined,
          userAgent: undefined,
        }),
      ]
    );

    if (severity === SEVERITY.CRITICAL) {
      logger.error(`[Security] CRITICAL: ${eventType}`, details);
    } else if (severity === SEVERITY.WARNING) {
      logger.warn(`[Security] WARNING: ${eventType}`, details);
    } else {
      logger.info(`[Security] ${eventType}`, details);
    }
  } catch (err) {
    // Security logging should never block the main flow
    logger.error('[SecurityMonitor] Failed to log event:', { error: err.message, eventType });
  }
}

/**
 * Log a failed login attempt.
 */
async function logFailedLogin(email, ip, userAgent, reason) {
  await logEvent(EVENT_TYPES.LOGIN_FAILED, SEVERITY.WARNING, {
    email,
    ip,
    userAgent,
    reason,
  });

  // Check for brute force pattern: 5+ failures from same IP in 10 min
  try {
    const result = await query(
      `SELECT COUNT(*) as cnt FROM security_events
       WHERE event_type = $1 AND ip_address = $2
       AND created_at >= NOW() - INTERVAL '10 minutes'`,
      [EVENT_TYPES.LOGIN_FAILED, ip]
    );
    const count = parseInt(result.rows[0]?.cnt) || 0;
    if (count >= 5) {
      await logEvent(EVENT_TYPES.SUSPICIOUS_ACTIVITY, SEVERITY.CRITICAL, {
        ip,
        pattern: 'brute_force',
        failedAttempts: count,
        windowMinutes: 10,
      });
    }
  } catch (err) {
    // Non-critical — don't propagate
  }
}

/**
 * Log a successful login.
 */
async function logSuccessfulLogin(userId, ip, userAgent) {
  await logEvent(EVENT_TYPES.LOGIN_SUCCESS, SEVERITY.INFO, {
    userId,
    ip,
    userAgent,
  });
}

/**
 * Log an account lockout.
 */
async function logAccountLocked(userId, ip, attempts) {
  await logEvent(EVENT_TYPES.ACCOUNT_LOCKED, SEVERITY.CRITICAL, {
    userId,
    ip,
    attempts,
  });
}

/**
 * Log PII data access.
 */
async function logPiiAccess(userId, employeeId, fields, ip) {
  await logEvent(EVENT_TYPES.PII_ACCESSED, SEVERITY.INFO, {
    userId,
    employeeId,
    fields,
    ip,
  });
}

// ─── Reports ────────────────────────────────────────────────────────────────

/**
 * Get security summary for the last N days.
 */
async function getSecuritySummary(days = 7) {
  try {
    const result = await query(
      `SELECT
        event_type,
        severity,
        COUNT(*) as count,
        COUNT(DISTINCT ip_address) as unique_ips,
        COUNT(DISTINCT user_id) as unique_users
       FROM security_events
       WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY event_type, severity
       ORDER BY count DESC`,
      [days]
    );
    return result.rows;
  } catch (err) {
    logger.error('[SecurityMonitor] Failed to get summary:', { error: err.message });
    return [];
  }
}

/**
 * Get recent critical events.
 */
async function getCriticalEvents(limit = 20) {
  try {
    const result = await query(
      `SELECT * FROM security_events
       WHERE severity = 'critical'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (err) {
    logger.error('[SecurityMonitor] Failed to get critical events:', { error: err.message });
    return [];
  }
}

/**
 * Get suspicious IPs (5+ failed logins in 24 hours).
 */
async function getSuspiciousIPs() {
  try {
    const result = await query(
      `SELECT ip_address, COUNT(*) as attempts,
              MAX(created_at) as last_attempt
       FROM security_events
       WHERE event_type = 'login_failed'
       AND created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY ip_address
       HAVING COUNT(*) >= 5
       ORDER BY attempts DESC`
    );
    return result.rows;
  } catch (err) {
    return [];
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  EVENT_TYPES,
  SEVERITY,
  logEvent,
  logFailedLogin,
  logSuccessfulLogin,
  logAccountLocked,
  logPiiAccess,
  getSecuritySummary,
  getCriticalEvents,
  getSuspiciousIPs,
};
