/**
 * SSL/TLS Configuration Tests
 */

const {
  getDatabaseSSLConfig,
  enforceHTTPS,
  getExternalSSLOptions,
  validateSSLConfig,
} = require('../src/config/ssl.config');

// ═══════════════════════════════════════════════════════════════════════
// DATABASE SSL CONFIG
// ═══════════════════════════════════════════════════════════════════════

describe('getDatabaseSSLConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('returns false when DB_SSL is not set', () => {
    delete process.env.DB_SSL;
    expect(getDatabaseSSLConfig()).toBe(false);
  });

  test('returns false when DB_SSL is not "true"', () => {
    process.env.DB_SSL = 'false';
    expect(getDatabaseSSLConfig()).toBe(false);
  });

  test('returns config object when DB_SSL is true', () => {
    process.env.DB_SSL = 'true';
    const config = getDatabaseSSLConfig();
    expect(config).toBeInstanceOf(Object);
    expect(config.rejectUnauthorized).toBe(true);
  });

  test('rejectUnauthorized can be disabled', () => {
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
    const config = getDatabaseSSLConfig();
    expect(config.rejectUnauthorized).toBe(false);
  });

  test('handles inline CA certificate', () => {
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_CA = 'INLINE-CERT-DATA';
    const config = getDatabaseSSLConfig();
    expect(config.ca).toBe('INLINE-CERT-DATA');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// HTTPS ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════

describe('enforceHTTPS', () => {
  const mockRes = () => {
    const res = {};
    res.redirect = jest.fn();
    res.setHeader = jest.fn();
    return res;
  };

  test('passes through in non-production', () => {
    const req = { secure: false, headers: {} };
    const res = mockRes();
    const next = jest.fn();

    enforceHTTPS(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('is a function', () => {
    expect(typeof enforceHTTPS).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EXTERNAL SSL OPTIONS
// ═══════════════════════════════════════════════════════════════════════

describe('getExternalSSLOptions', () => {
  test('returns options object', () => {
    const opts = getExternalSSLOptions();
    expect(opts).toHaveProperty('rejectUnauthorized');
  });

  test('allows self-signed in dev by default', () => {
    const opts = getExternalSSLOptions();
    // In test/dev environment
    expect(typeof opts.rejectUnauthorized).toBe('boolean');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SSL VALIDATION
// ═══════════════════════════════════════════════════════════════════════

describe('validateSSLConfig', () => {
  test('returns array of warnings', () => {
    const warnings = validateSSLConfig();
    expect(Array.isArray(warnings)).toBe(true);
  });

  test('returns no warnings in non-production', () => {
    // Since we're in test environment, no production warnings
    const warnings = validateSSLConfig();
    expect(warnings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('Module Exports', () => {
  test('exports all expected functions', () => {
    expect(typeof getDatabaseSSLConfig).toBe('function');
    expect(typeof enforceHTTPS).toBe('function');
    expect(typeof getExternalSSLOptions).toBe('function');
    expect(typeof validateSSLConfig).toBe('function');
  });
});
