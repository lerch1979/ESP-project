/**
 * Rate Limiter Middleware Tests
 */

const {
  globalLimiter,
  authLimiter,
  passwordResetLimiter,
  uploadLimiter,
  authenticatedLimiter,
  speedLimiter,
} = require('../src/middleware/rateLimiter');

describe('Rate Limiter Middleware', () => {
  describe('Exported limiters', () => {
    test('globalLimiter should be a function (middleware)', () => {
      expect(typeof globalLimiter).toBe('function');
    });

    test('authLimiter should be a function (middleware)', () => {
      expect(typeof authLimiter).toBe('function');
    });

    test('passwordResetLimiter should be a function (middleware)', () => {
      expect(typeof passwordResetLimiter).toBe('function');
    });

    test('uploadLimiter should be a function (middleware)', () => {
      expect(typeof uploadLimiter).toBe('function');
    });

    test('authenticatedLimiter should be a function (middleware)', () => {
      expect(typeof authenticatedLimiter).toBe('function');
    });

    test('speedLimiter should be a function (middleware)', () => {
      expect(typeof speedLimiter).toBe('function');
    });
  });

  describe('Rate limit behavior', () => {
    test('globalLimiter should call next for normal requests', (done) => {
      const req = { ip: '127.0.0.1', headers: {}, method: 'GET', url: '/test', app: { get: () => false } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        getHeader: jest.fn(),
      };
      const next = jest.fn(() => {
        expect(next).toHaveBeenCalled();
        done();
      });

      globalLimiter(req, res, next);
    });

    test('authLimiter should call next for first request', (done) => {
      const req = { ip: '10.0.0.99', headers: {}, method: 'POST', url: '/login', app: { get: () => false } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        getHeader: jest.fn(),
      };
      const next = jest.fn(() => {
        expect(next).toHaveBeenCalled();
        done();
      });

      authLimiter(req, res, next);
    });

    test('speedLimiter should call next without delay for first request', (done) => {
      const req = { ip: '10.0.0.100', headers: {}, method: 'GET', url: '/test', app: { get: () => false } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        getHeader: jest.fn(),
      };
      const next = jest.fn(() => {
        expect(next).toHaveBeenCalled();
        done();
      });

      speedLimiter(req, res, next);
    });
  });

  describe('Rate limit disabled', () => {
    const originalEnv = process.env.RATE_LIMIT_ENABLED;

    afterEach(() => {
      process.env.RATE_LIMIT_ENABLED = originalEnv;
    });

    test('should respect RATE_LIMIT_ENABLED=false environment variable', (done) => {
      // The skip function reads process.env at call time
      process.env.RATE_LIMIT_ENABLED = 'false';

      const req = { ip: '10.0.0.200', headers: {}, method: 'GET', url: '/test', app: { get: () => false } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        getHeader: jest.fn(),
      };
      const next = jest.fn(() => {
        expect(next).toHaveBeenCalled();
        done();
      });

      globalLimiter(req, res, next);
    });
  });
});
