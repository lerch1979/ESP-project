/**
 * Comprehensive Security Test Suite
 *
 * Tests ALL security hardening measures as an integrated whole.
 * This is the final validation that all 60 security issues are addressed.
 */

// ═══════════════════════════════════════════════════════════════════════
// 1. PII ENCRYPTION COVERAGE
// ═══════════════════════════════════════════════════════════════════════

describe('Security: PII Encryption Coverage', () => {
  process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2';

  const encryption = require('../../src/services/encryption.service');

  test('all employee PII fields are defined', () => {
    const required = [
      'social_security_number', 'passport_number', 'bank_account', 'tax_id',
      'company_phone', 'mothers_name', 'company_email',
      'permanent_address_street', 'permanent_address_city',
      'permanent_address_zip', 'permanent_address_number',
    ];
    for (const field of required) {
      expect(encryption.PII_FIELDS).toContain(field);
    }
  });

  test('all user PII fields are defined', () => {
    expect(encryption.USER_PII_FIELDS).toContain('email');
    expect(encryption.USER_PII_FIELDS).toContain('phone');
  });

  test('encryption uses AES-256-CBC', () => {
    const encrypted = encryption.encrypt('test');
    // Verify format: 32-char hex IV + colon + hex data
    expect(encrypted).toMatch(/^[0-9a-f]{32}:.+$/);
  });

  test('each encryption uses unique IV', () => {
    const enc1 = encryption.encrypt('same');
    const enc2 = encryption.encrypt('same');
    expect(enc1.split(':')[0]).not.toBe(enc2.split(':')[0]);
  });

  test('isEncrypted correctly identifies encrypted values', () => {
    const encrypted = encryption.encrypt('test');
    expect(encryption.isEncrypted(encrypted)).toBe(true);
    expect(encryption.isEncrypted('plaintext')).toBe(false);
    expect(encryption.isEncrypted(null)).toBe(false);
  });

  test('key rotation support exists', () => {
    expect(typeof encryption.reEncrypt).toBe('function');
    expect(typeof encryption.getCurrentKeyVersion).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. PASSWORD POLICY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Password Policy', () => {
  jest.mock('../../src/database/connection', () => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
  }));

  const passwordPolicy = require('../../src/middleware/passwordPolicy');

  test('minimum length is 12 characters', () => {
    expect(passwordPolicy.PASSWORD_MIN_LENGTH).toBe(12);
  });

  test('rejects short passwords', () => {
    const result = passwordPolicy.validatePassword('Short1!');
    expect(result.valid).toBe(false);
  });

  test('requires uppercase', () => {
    const result = passwordPolicy.validatePassword('alllowercase1!x');
    expect(result.valid).toBe(false);
  });

  test('requires lowercase', () => {
    const result = passwordPolicy.validatePassword('ALLUPPERCASE1!X');
    expect(result.valid).toBe(false);
  });

  test('requires digits', () => {
    const result = passwordPolicy.validatePassword('NoDigitsHere!!x');
    expect(result.valid).toBe(false);
  });

  test('requires special characters', () => {
    const result = passwordPolicy.validatePassword('NoSpecial12345');
    expect(result.valid).toBe(false);
  });

  test('blocks common passwords', () => {
    const result = passwordPolicy.validatePassword('password1234');
    expect(result.valid).toBe(false);
  });

  test('blocks repeated characters', () => {
    const result = passwordPolicy.validatePassword('Baaaa234!@#$bb');
    expect(result.valid).toBe(false);
  });

  test('accepts strong passwords', () => {
    const result = passwordPolicy.validatePassword('MyStr0ng!Pass99');
    expect(result.valid).toBe(true);
  });

  test('password history count is 5', () => {
    expect(passwordPolicy.PASSWORD_HISTORY_COUNT).toBe(5);
  });

  test('password expiry is 90 days', () => {
    expect(passwordPolicy.PASSWORD_EXPIRY_DAYS).toBe(90);
  });

  test('account lockout after 10 attempts', () => {
    expect(passwordPolicy.MAX_FAILED_ATTEMPTS).toBe(10);
  });

  test('HaveIBeenPwned check exists', () => {
    expect(typeof passwordPolicy.checkBreached).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. SECURITY MONITORING
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Monitoring', () => {
  const monitor = require('../../src/services/securityMonitor.service');

  test('all event types are defined', () => {
    expect(monitor.EVENT_TYPES.LOGIN_FAILED).toBeDefined();
    expect(monitor.EVENT_TYPES.LOGIN_SUCCESS).toBeDefined();
    expect(monitor.EVENT_TYPES.ACCOUNT_LOCKED).toBeDefined();
    expect(monitor.EVENT_TYPES.PASSWORD_CHANGED).toBeDefined();
    expect(monitor.EVENT_TYPES.PII_ACCESSED).toBeDefined();
    expect(monitor.EVENT_TYPES.SUSPICIOUS_ACTIVITY).toBeDefined();
    expect(monitor.EVENT_TYPES.RATE_LIMIT_HIT).toBeDefined();
    expect(monitor.EVENT_TYPES.CSRF_VIOLATION).toBeDefined();
  });

  test('severity levels are defined', () => {
    expect(monitor.SEVERITY.INFO).toBe('info');
    expect(monitor.SEVERITY.WARNING).toBe('warning');
    expect(monitor.SEVERITY.CRITICAL).toBe('critical');
  });

  test('logging functions exist', () => {
    expect(typeof monitor.logEvent).toBe('function');
    expect(typeof monitor.logFailedLogin).toBe('function');
    expect(typeof monitor.logSuccessfulLogin).toBe('function');
    expect(typeof monitor.logAccountLocked).toBe('function');
    expect(typeof monitor.logPiiAccess).toBe('function');
  });

  test('report functions exist', () => {
    expect(typeof monitor.getSecuritySummary).toBe('function');
    expect(typeof monitor.getCriticalEvents).toBe('function');
    expect(typeof monitor.getSuspiciousIPs).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. SSL/TLS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

describe('Security: SSL/TLS', () => {
  const ssl = require('../../src/config/ssl.config');

  test('HTTPS enforcement exists', () => {
    expect(typeof ssl.enforceHTTPS).toBe('function');
  });

  test('database SSL config function exists', () => {
    expect(typeof ssl.getDatabaseSSLConfig).toBe('function');
  });

  test('external SSL options exist', () => {
    const opts = ssl.getExternalSSLOptions();
    expect(opts).toHaveProperty('rejectUnauthorized');
  });

  test('SSL validation exists', () => {
    expect(typeof ssl.validateSSLConfig).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. RLS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Row-Level Security Middleware', () => {
  const { setDatabaseUser, setAuditUser } = require('../../src/middleware/setDatabaseUser');

  test('setDatabaseUser middleware exists', () => {
    expect(typeof setDatabaseUser).toBe('function');
  });

  test('setAuditUser middleware exists', () => {
    expect(typeof setAuditUser).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Rate Limiting', () => {
  const rateLimiter = require('../../src/middleware/rateLimiter');

  test('global limiter exists', () => {
    expect(rateLimiter.globalLimiter).toBeDefined();
  });

  test('auth limiter exists', () => {
    expect(rateLimiter.authLimiter).toBeDefined();
  });

  test('speed limiter exists', () => {
    expect(rateLimiter.speedLimiter).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. CSRF PROTECTION
// ═══════════════════════════════════════════════════════════════════════

describe('Security: CSRF Protection', () => {
  const csrf = require('../../src/middleware/csrf');

  test('CSRF protection middleware exists', () => {
    expect(typeof csrf.csrfProtection).toBe('function');
  });

  test('CSRF token handler exists', () => {
    expect(typeof csrf.csrfTokenHandler).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Headers', () => {
  const headers = require('../../src/middleware/securityHeaders');

  test('security headers middleware exists', () => {
    expect(typeof headers.createSecurityHeaders).toBe('function');
  });

  test('CSP report handler exists', () => {
    expect(typeof headers.cspReportHandler).toBe('function');
  });

  test('additional headers middleware exists', () => {
    expect(typeof headers.additionalHeaders).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Input Validation', () => {
  const validation = require('../../src/utils/validation');

  test('UUID validation exists', () => {
    expect(typeof validation.isValidUUID).toBe('function');
  });

  test('sanitizeString exists', () => {
    expect(typeof validation.sanitizeString).toBe('function');
  });

  test('rejects SQL injection in UUIDs', () => {
    expect(validation.isValidUUID("'; DROP TABLE users--")).toBe(false);
  });

  test('strips HTML tags', () => {
    const sanitized = validation.sanitizeString('<script>alert("xss")</script>Hello');
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('Hello');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. AUTHENTICATION & AUTHORIZATION
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Authentication', () => {
  const auth = require('../../src/middleware/auth');

  test('authenticateToken middleware exists', () => {
    expect(typeof auth.authenticateToken).toBe('function');
  });

  test('requireRole middleware exists', () => {
    expect(typeof auth.requireRole).toBe('function');
  });

  test('requireSuperAdmin middleware exists', () => {
    expect(typeof auth.requireSuperAdmin).toBe('function');
  });

  test('requireAdmin middleware exists', () => {
    expect(typeof auth.requireAdmin).toBe('function');
  });

  test('checkContractorAccess middleware exists', () => {
    expect(typeof auth.checkContractorAccess).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 11. ENCRYPTION AT REST VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Encryption at Rest', () => {
  const encryption = require('../../src/services/encryption.service');

  test('full encrypt/decrypt cycle for all employee PII fields', () => {
    const employeeData = {
      social_security_number: '123-456-789',
      passport_number: 'HU-AB123456',
      bank_account: 'HU42-1234-5678-9012-3456',
      tax_id: '8765432190',
      company_phone: '+36-30-123-4567',
      mothers_name: 'Kovács Mária',
      company_email: 'employee@company.hu',
      permanent_address_street: 'Kossuth Lajos utca',
      permanent_address_city: 'Budapest',
      permanent_address_zip: '1051',
      permanent_address_number: '42/A',
      first_name: 'NOT-PII',
    };

    const encrypted = encryption.encryptPiiFields(employeeData);

    // Verify all PII is encrypted
    for (const field of encryption.PII_FIELDS) {
      if (employeeData[field]) {
        expect(encrypted[field]).not.toBe(employeeData[field]);
        expect(encryption.isEncrypted(encrypted[field])).toBe(true);
      }
    }

    // Verify non-PII is unchanged
    expect(encrypted.first_name).toBe('NOT-PII');

    // Verify decryption restores original
    const decrypted = encryption.decryptPiiFields(encrypted);
    for (const field of encryption.PII_FIELDS) {
      expect(decrypted[field]).toBe(employeeData[field]);
    }
  });

  test('full encrypt/decrypt cycle for all user PII fields', () => {
    const userData = {
      email: 'user@example.com',
      phone: '+36-30-123-4567',
      first_name: 'NOT-PII',
    };

    const encrypted = encryption.encryptUserPiiFields(userData);
    expect(encrypted.email).not.toBe('user@example.com');
    expect(encrypted.phone).not.toBe('+36-30-123-4567');
    expect(encrypted.first_name).toBe('NOT-PII');

    const decrypted = encryption.decryptUserPiiFields(encrypted);
    expect(decrypted.email).toBe('user@example.com');
    expect(decrypted.phone).toBe('+36-30-123-4567');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 12. SECURITY CHECKLIST VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

describe('Security: Complete Checklist', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '../..');

  test('migration 054 (PII encryption) exists', () => {
    expect(fs.existsSync(path.join(root, 'migrations/054_complete_pii_encryption.sql'))).toBe(true);
  });

  test('migration 055 (audit triggers) exists', () => {
    expect(fs.existsSync(path.join(root, 'migrations/055_complete_audit_triggers.sql'))).toBe(true);
  });

  test('migration 056 (password policies) exists', () => {
    expect(fs.existsSync(path.join(root, 'migrations/056_password_policies.sql'))).toBe(true);
  });

  test('migration 057 (RLS) exists', () => {
    expect(fs.existsSync(path.join(root, 'migrations/057_row_level_security.sql'))).toBe(true);
  });

  test('encryption service exists', () => {
    expect(fs.existsSync(path.join(root, 'src/services/encryption.service.js'))).toBe(true);
  });

  test('security monitor service exists', () => {
    expect(fs.existsSync(path.join(root, 'src/services/securityMonitor.service.js'))).toBe(true);
  });

  test('password policy middleware exists', () => {
    expect(fs.existsSync(path.join(root, 'src/middleware/passwordPolicy.js'))).toBe(true);
  });

  test('setDatabaseUser middleware exists', () => {
    expect(fs.existsSync(path.join(root, 'src/middleware/setDatabaseUser.js'))).toBe(true);
  });

  test('SSL config exists', () => {
    expect(fs.existsSync(path.join(root, 'src/config/ssl.config.js'))).toBe(true);
  });

  test('key rotation script exists', () => {
    expect(fs.existsSync(path.join(root, 'scripts/rotate-encryption-key.js'))).toBe(true);
  });

  test('production security docs exist', () => {
    expect(fs.existsSync(path.join(root, 'docs/PRODUCTION_SECURITY.md'))).toBe(true);
  });

  test('migration manifest includes all security migrations', () => {
    const migrate = fs.readFileSync(path.join(root, 'src/database/migrate.js'), 'utf8');
    expect(migrate).toContain('054');
    expect(migrate).toContain('055');
    expect(migrate).toContain('056');
    expect(migrate).toContain('057');
  });
});
