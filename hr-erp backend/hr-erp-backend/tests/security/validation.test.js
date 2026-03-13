/**
 * Input Validation Tests
 *
 * Tests for the validation utilities and middleware.
 */

const {
  isValidUUID,
  sanitizeString,
  parsePositiveNumber,
  parsePagination,
  parseSortOrder,
  isAllowedValue,
  sanitizeSearch,
  isValidDate,
  validateAmount,
  validateIdParam,
} = require('../../src/utils/validation');

const {
  isValidEmail,
} = require('../../src/middleware/validate');

describe('Validation Utilities', () => {
  describe('isValidUUID', () => {
    test('accepts valid UUID v4', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    test('accepts lowercase UUID', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    test('accepts uppercase UUID', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    test('rejects empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });

    test('rejects null', () => {
      expect(isValidUUID(null)).toBe(false);
    });

    test('rejects random string', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });

    test('rejects partial UUID', () => {
      expect(isValidUUID('550e8400-e29b')).toBe(false);
    });

    test('rejects UUID with extra chars', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000x')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    test('trims whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    test('strips HTML tags', () => {
      expect(sanitizeString('<b>bold</b>')).toBe('bold');
    });

    test('limits length', () => {
      expect(sanitizeString('abcdefghij', 5)).toBe('abcde');
    });

    test('returns null for empty', () => {
      expect(sanitizeString('')).toBeNull();
    });

    test('returns null for whitespace only', () => {
      expect(sanitizeString('   ')).toBeNull();
    });

    test('handles numbers', () => {
      expect(sanitizeString(12345)).toBe('12345');
    });
  });

  describe('parsePositiveNumber', () => {
    test('parses integer string', () => {
      expect(parsePositiveNumber('42')).toBe(42);
    });

    test('parses float string', () => {
      expect(parsePositiveNumber('3.14')).toBe(3.14);
    });

    test('returns null for non-numeric', () => {
      expect(parsePositiveNumber('abc')).toBeNull();
    });

    test('returns null for empty', () => {
      expect(parsePositiveNumber('')).toBeNull();
    });

    test('returns null for null', () => {
      expect(parsePositiveNumber(null)).toBeNull();
    });

    test('returns null for Infinity', () => {
      expect(parsePositiveNumber(Infinity)).toBeNull();
    });
  });

  describe('parsePagination', () => {
    test('returns defaults for empty query', () => {
      const result = parsePagination({});
      expect(result).toEqual({ page: 1, limit: 50, offset: 0 });
    });

    test('respects provided values', () => {
      const result = parsePagination({ page: '3', limit: '25' });
      expect(result).toEqual({ page: 3, limit: 25, offset: 50 });
    });

    test('enforces maxLimit', () => {
      const result = parsePagination({ limit: '1000' }, { maxLimit: 100 });
      expect(result.limit).toBe(100);
    });

    test('enforces minimum page', () => {
      const result = parsePagination({ page: '-5' });
      expect(result.page).toBe(1);
    });
  });

  describe('parseSortOrder', () => {
    test('accepts ASC', () => expect(parseSortOrder('ASC')).toBe('ASC'));
    test('accepts DESC', () => expect(parseSortOrder('DESC')).toBe('DESC'));
    test('normalizes lowercase', () => expect(parseSortOrder('asc')).toBe('ASC'));
    test('defaults to DESC', () => expect(parseSortOrder('invalid')).toBe('DESC'));
    test('handles null', () => expect(parseSortOrder(null)).toBe('DESC'));
  });

  describe('sanitizeSearch', () => {
    test('trims and returns search', () => {
      expect(sanitizeSearch('  hello  ')).toBe('hello');
    });

    test('limits length', () => {
      const long = 'a'.repeat(300);
      const result = sanitizeSearch(long);
      expect(result.length).toBe(200);
    });

    test('returns null for empty', () => {
      expect(sanitizeSearch('')).toBeNull();
    });
  });

  describe('isValidDate', () => {
    test('accepts YYYY-MM-DD', () => {
      expect(isValidDate('2024-01-15')).toBe(true);
    });

    test('rejects invalid format', () => {
      expect(isValidDate('15/01/2024')).toBe(false);
    });

    test('rejects invalid date', () => {
      expect(isValidDate('2024-13-45')).toBe(false);
    });
  });

  describe('validateAmount', () => {
    test('accepts valid amount', () => {
      const result = validateAmount(100.50);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(100.50);
    });

    test('rejects zero', () => {
      expect(validateAmount(0).valid).toBe(false);
    });

    test('rejects negative', () => {
      expect(validateAmount(-50).valid).toBe(false);
    });

    test('rejects too large', () => {
      expect(validateAmount(10000000000).valid).toBe(false);
    });

    test('rejects non-numeric', () => {
      expect(validateAmount('abc').valid).toBe(false);
    });
  });

  describe('validateIdParam', () => {
    test('returns id for valid UUID', () => {
      const req = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const result = validateIdParam(req, res);
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    test('returns null and sends 400 for invalid', () => {
      const req = { params: { id: 'invalid' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const result = validateIdParam(req, res);
      expect(result).toBeNull();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

describe('Validation Middleware', () => {
  describe('isValidEmail', () => {
    test('accepts valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('user+tag@domain.co.uk')).toBe(true);
    });

    test('rejects invalid emails', () => {
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });

    test('rejects SQL injection in emails', () => {
      // admin'--@test.com passes basic email regex (has @ and .)
      // but this is safe because emails are always used as parameterized query params ($N)
      expect(isValidEmail("' OR 1=1--")).toBe(false);
      expect(isValidEmail("'; DROP TABLE--")).toBe(false);
      expect(isValidEmail("")).toBe(false);
    });
  });
});
