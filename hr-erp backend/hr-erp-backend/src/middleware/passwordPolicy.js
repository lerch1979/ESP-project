/**
 * Password Policy Middleware
 *
 * Enforces:
 *   - Minimum 12 characters
 *   - Complexity: upper, lower, digit, special
 *   - Password history (last 5 passwords cannot be reused)
 *   - Expiration: 90 days
 *   - Account lockout after 10 failed attempts (30 min)
 *   - HaveIBeenPwned breach check (SHA-1 k-anonymity)
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// ─── Configuration ──────────────────────────────────────────────────────────

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_HISTORY_COUNT = 5;
const PASSWORD_EXPIRY_DAYS = 90;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const COMPLEXITY_RULES = [
  { regex: /[A-Z]/, name: 'nagybetű (A-Z)', nameEn: 'uppercase letter' },
  { regex: /[a-z]/, name: 'kisbetű (a-z)', nameEn: 'lowercase letter' },
  { regex: /[0-9]/, name: 'szám (0-9)', nameEn: 'digit' },
  { regex: /[^A-Za-z0-9]/, name: 'speciális karakter (!@#$...)', nameEn: 'special character' },
];

// Common weak passwords (top patterns)
const COMMON_PASSWORDS = new Set([
  'password1234', 'jelszó123456', 'admin1234567',
  'qwerty123456', 'letmein12345', '123456789012',
]);

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate password against policy rules.
 * Returns { valid: boolean, errors: string[] }
 */
function validatePassword(password) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['A jelszó megadása kötelező.'] };
  }

  // Length check
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`A jelszónak legalább ${PASSWORD_MIN_LENGTH} karakter hosszúnak kell lennie.`);
  }

  // Complexity check
  const missing = COMPLEXITY_RULES.filter(r => !r.regex.test(password));
  if (missing.length > 0) {
    errors.push(
      `A jelszónak tartalmaznia kell: ${missing.map(r => r.name).join(', ')}.`
    );
  }

  // Common password check
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Ez a jelszó túl gyakori. Kérjük válasszon egyedit.');
  }

  // Sequential/repeated character check
  if (/(.)\1{3,}/.test(password)) {
    errors.push('A jelszó nem tartalmazhat 4 vagy több egymást követő azonos karaktert.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check password against HaveIBeenPwned API using k-anonymity.
 * Returns true if the password has been breached.
 */
async function checkBreached(password) {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.substring(0, 5);
    const suffix = sha1.substring(5);

    const https = require('https');
    const response = await new Promise((resolve, reject) => {
      const req = https.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'User-Agent': 'HR-ERP-Security-Check' },
        timeout: 3000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });

    const lines = response.split('\n');
    for (const line of lines) {
      const [hashSuffix] = line.split(':');
      if (hashSuffix && hashSuffix.trim() === suffix) {
        return true;
      }
    }
    return false;
  } catch (err) {
    // If the API is down, don't block the user — just log
    logger.warn('[PasswordPolicy] HaveIBeenPwned check failed:', { error: err.message });
    return false;
  }
}

/**
 * Check if password was used in the last N passwords.
 * @param {string} userId - User UUID
 * @param {string} newPassword - Plaintext new password
 * @returns {boolean} true if password was recently used
 */
async function checkPasswordHistory(userId, newPassword) {
  try {
    const result = await query(
      `SELECT password_hash FROM password_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, PASSWORD_HISTORY_COUNT]
    );

    for (const row of result.rows) {
      if (await bcrypt.compare(newPassword, row.password_hash)) {
        return true; // Password was recently used
      }
    }
    return false;
  } catch (err) {
    logger.warn('[PasswordPolicy] History check failed:', { error: err.message });
    return false;
  }
}

/**
 * Save password hash to history.
 */
async function savePasswordHistory(userId, passwordHash) {
  try {
    await query(
      `INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)`,
      [userId, passwordHash]
    );

    // Clean up old entries beyond history count
    await query(
      `DELETE FROM password_history WHERE id IN (
        SELECT id FROM password_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        OFFSET $2
      )`,
      [userId, PASSWORD_HISTORY_COUNT]
    );
  } catch (err) {
    logger.warn('[PasswordPolicy] Failed to save password history:', { error: err.message });
  }
}

/**
 * Check if password has expired.
 * @returns {boolean} true if expired
 */
function isPasswordExpired(passwordChangedAt) {
  if (!passwordChangedAt) return true;
  const expiryDate = new Date(passwordChangedAt);
  expiryDate.setDate(expiryDate.getDate() + PASSWORD_EXPIRY_DAYS);
  return new Date() > expiryDate;
}

// ─── Account Lockout ────────────────────────────────────────────────────────

/**
 * Record a failed login attempt.
 */
async function recordFailedLogin(userId) {
  try {
    const result = await query(
      `UPDATE users
       SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
           last_failed_login = NOW()
       WHERE id = $1
       RETURNING failed_login_attempts`,
      [userId]
    );

    const attempts = result.rows[0]?.failed_login_attempts || 0;

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await query(
        `UPDATE users SET locked_until = NOW() + INTERVAL '30 minutes' WHERE id = $1`,
        [userId]
      );
      logger.warn('[PasswordPolicy] Account locked due to failed attempts', { userId, attempts });
      return { locked: true, attempts };
    }

    return { locked: false, attempts };
  } catch (err) {
    logger.error('[PasswordPolicy] Failed to record failed login:', { error: err.message });
    return { locked: false, attempts: 0 };
  }
}

/**
 * Reset failed login counter on successful login.
 */
async function resetFailedLogins(userId) {
  try {
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [userId]
    );
  } catch (err) {
    logger.warn('[PasswordPolicy] Failed to reset login counter:', { error: err.message });
  }
}

/**
 * Check if account is currently locked.
 */
async function isAccountLocked(userId) {
  try {
    const result = await query(
      `SELECT locked_until FROM users WHERE id = $1`,
      [userId]
    );
    const lockedUntil = result.rows[0]?.locked_until;
    if (!lockedUntil) return false;
    return new Date(lockedUntil) > new Date();
  } catch (err) {
    return false;
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Express middleware: validate password on create/change endpoints.
 */
function validatePasswordMiddleware(req, res, next) {
  const password = req.body.password || req.body.new_password;
  if (!password) return next();

  const result = validatePassword(password);
  if (!result.valid) {
    return res.status(400).json({
      success: false,
      message: 'A jelszó nem felel meg a biztonsági követelményeknek.',
      errors: result.errors,
    });
  }
  next();
}

/**
 * Express middleware: check password expiration.
 */
function checkPasswordExpiry(req, res, next) {
  if (!req.user) return next();
  if (isPasswordExpired(req.user.password_changed_at)) {
    return res.status(403).json({
      success: false,
      message: 'A jelszó lejárt. Kérjük változtassa meg.',
      code: 'PASSWORD_EXPIRED',
    });
  }
  next();
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  validatePassword,
  checkBreached,
  checkPasswordHistory,
  savePasswordHistory,
  isPasswordExpired,
  recordFailedLogin,
  resetFailedLogins,
  isAccountLocked,
  validatePasswordMiddleware,
  checkPasswordExpiry,
  // Constants for testing
  PASSWORD_MIN_LENGTH,
  PASSWORD_HISTORY_COUNT,
  PASSWORD_EXPIRY_DAYS,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
};
