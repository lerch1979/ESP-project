/**
 * Password Policy Tests
 */

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
}));

const db = require('../src/database/connection');

const {
  validatePassword,
  isPasswordExpired,
  PASSWORD_MIN_LENGTH,
  PASSWORD_HISTORY_COUNT,
  MAX_FAILED_ATTEMPTS,
  validatePasswordMiddleware,
  checkPasswordExpiry,
} = require('../src/middleware/passwordPolicy');

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// VALIDATE PASSWORD
// ═══════════════════════════════════════════════════════════════════════

describe('validatePassword', () => {
  test('accepts strong password', () => {
    const result = validatePassword('MyStr0ng!Pass99');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects null password', () => {
    const result = validatePassword(null);
    expect(result.valid).toBe(false);
  });

  test('rejects undefined password', () => {
    const result = validatePassword(undefined);
    expect(result.valid).toBe(false);
  });

  test('rejects empty string', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
  });

  test('rejects short password', () => {
    const result = validatePassword('Short1!');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain(`${PASSWORD_MIN_LENGTH}`);
  });

  test('rejects password without uppercase', () => {
    const result = validatePassword('alllowercase1!x');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('nagybetű'))).toBe(true);
  });

  test('rejects password without lowercase', () => {
    const result = validatePassword('ALLUPPERCASE1!X');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('kisbetű'))).toBe(true);
  });

  test('rejects password without digits', () => {
    const result = validatePassword('NoDigitsHere!!x');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('szám'))).toBe(true);
  });

  test('rejects password without special characters', () => {
    const result = validatePassword('NoSpecial12345');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('speciális'))).toBe(true);
  });

  test('rejects common password', () => {
    const result = validatePassword('password1234');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('gyakori'))).toBe(true);
  });

  test('rejects repeated characters (4+)', () => {
    const result = validatePassword('Baaaa234!@#$bb');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('azonos karakter'))).toBe(true);
  });

  test('accepts exactly minimum length', () => {
    const result = validatePassword('Ab1!56789012');
    expect(result.valid).toBe(true);
  });

  test('accepts long complex password', () => {
    const result = validatePassword('ThisIsAVery$tr0ng&SecurePassword2024!');
    expect(result.valid).toBe(true);
  });

  test('multiple errors returned at once', () => {
    const result = validatePassword('short');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  test('accepts Hungarian characters', () => {
    const result = validatePassword('Jelsz0!ÁrvíztűrőTükörfúrógép');
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PASSWORD EXPIRATION
// ═══════════════════════════════════════════════════════════════════════

describe('isPasswordExpired', () => {
  test('returns true for null date', () => {
    expect(isPasswordExpired(null)).toBe(true);
  });

  test('returns true for undefined date', () => {
    expect(isPasswordExpired(undefined)).toBe(true);
  });

  test('returns false for recent password change', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 10); // 10 days ago
    expect(isPasswordExpired(recent)).toBe(false);
  });

  test('returns true for old password change', () => {
    const old = new Date();
    old.setDate(old.getDate() - 100); // 100 days ago
    expect(isPasswordExpired(old)).toBe(true);
  });

  test('returns false for just before expiry', () => {
    const almostExpired = new Date();
    almostExpired.setDate(almostExpired.getDate() - 89); // 89 days ago
    expect(isPasswordExpired(almostExpired)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════

describe('validatePasswordMiddleware', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('passes through when no password in body', () => {
    const req = { body: { email: 'test@test.com' } };
    const res = mockRes();
    const next = jest.fn();

    validatePasswordMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 400 for weak password', () => {
    const req = { body: { password: 'weak' } };
    const res = mockRes();
    const next = jest.fn();

    validatePasswordMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('passes through for strong password', () => {
    const req = { body: { password: 'MyStr0ng!Pass99' } };
    const res = mockRes();
    const next = jest.fn();

    validatePasswordMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('checks new_password field too', () => {
    const req = { body: { new_password: 'weak' } };
    const res = mockRes();
    const next = jest.fn();

    validatePasswordMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('checkPasswordExpiry', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('passes through when no user', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    checkPasswordExpiry(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes through for fresh password', () => {
    const req = { user: { password_changed_at: new Date() } };
    const res = mockRes();
    const next = jest.fn();

    checkPasswordExpiry(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 for expired password', () => {
    const old = new Date();
    old.setDate(old.getDate() - 100);
    const req = { user: { password_changed_at: old } };
    const res = mockRes();
    const next = jest.fn();

    checkPasswordExpiry(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

describe('Constants', () => {
  test('minimum length is 12', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });

  test('history count is 5', () => {
    expect(PASSWORD_HISTORY_COUNT).toBe(5);
  });

  test('max failed attempts is 10', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ACCOUNT LOCKOUT
// ═══════════════════════════════════════════════════════════════════════

describe('Account Lockout', () => {
  const { recordFailedLogin, resetFailedLogins, isAccountLocked } = require('../src/middleware/passwordPolicy');

  test('recordFailedLogin increments counter', async () => {
    db.query.mockResolvedValue({ rows: [{ failed_login_attempts: 3 }] });
    const result = await recordFailedLogin('user-1');
    expect(result.locked).toBe(false);
    expect(result.attempts).toBe(3);
  });

  test('recordFailedLogin locks account at threshold', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ failed_login_attempts: 10 }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await recordFailedLogin('user-1');
    expect(result.locked).toBe(true);
  });

  test('resetFailedLogins resets counter', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await resetFailedLogins('user-1');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('failed_login_attempts = 0'),
      ['user-1']
    );
  });

  test('isAccountLocked returns false when not locked', async () => {
    db.query.mockResolvedValue({ rows: [{ locked_until: null }] });
    const locked = await isAccountLocked('user-1');
    expect(locked).toBe(false);
  });

  test('isAccountLocked returns true when locked', async () => {
    const future = new Date();
    future.setMinutes(future.getMinutes() + 15);
    db.query.mockResolvedValue({ rows: [{ locked_until: future }] });
    const locked = await isAccountLocked('user-1');
    expect(locked).toBe(true);
  });

  test('isAccountLocked returns false when lock expired', async () => {
    const past = new Date();
    past.setMinutes(past.getMinutes() - 5);
    db.query.mockResolvedValue({ rows: [{ locked_until: past }] });
    const locked = await isAccountLocked('user-1');
    expect(locked).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PASSWORD HISTORY
// ═══════════════════════════════════════════════════════════════════════

describe('Password History', () => {
  const bcrypt = require('bcryptjs');
  const { checkPasswordHistory, savePasswordHistory } = require('../src/middleware/passwordPolicy');

  test('checkPasswordHistory returns false for new password', async () => {
    db.query.mockResolvedValue({ rows: [
      { password_hash: await bcrypt.hash('OldPass1!xxxx', 10) },
    ]});
    const result = await checkPasswordHistory('user-1', 'CompletelyNew1!');
    expect(result).toBe(false);
  });

  test('checkPasswordHistory returns true for reused password', async () => {
    const hash = await bcrypt.hash('ReusedPass1!x', 10);
    db.query.mockResolvedValue({ rows: [{ password_hash: hash }] });
    const result = await checkPasswordHistory('user-1', 'ReusedPass1!x');
    expect(result).toBe(true);
  });

  test('savePasswordHistory inserts and cleans up', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await savePasswordHistory('user-1', 'hashed-password');
    expect(db.query).toHaveBeenCalledTimes(2); // INSERT + DELETE cleanup
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('Module Exports', () => {
  const mod = require('../src/middleware/passwordPolicy');

  test('exports all expected functions', () => {
    expect(typeof mod.validatePassword).toBe('function');
    expect(typeof mod.checkBreached).toBe('function');
    expect(typeof mod.checkPasswordHistory).toBe('function');
    expect(typeof mod.savePasswordHistory).toBe('function');
    expect(typeof mod.isPasswordExpired).toBe('function');
    expect(typeof mod.recordFailedLogin).toBe('function');
    expect(typeof mod.resetFailedLogins).toBe('function');
    expect(typeof mod.isAccountLocked).toBe('function');
    expect(typeof mod.validatePasswordMiddleware).toBe('function');
    expect(typeof mod.checkPasswordExpiry).toBe('function');
  });
});
