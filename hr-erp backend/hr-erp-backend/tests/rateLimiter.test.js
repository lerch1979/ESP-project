/**
 * Rate Limiter Middleware Tests
 *
 * NODE_ENV=test → all limiters are no-op passthroughs.
 * These tests verify exports and passthrough behavior.
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

  describe('Test environment passthrough', () => {
    // In test env, all limiters are no-ops that just call next()
    test('globalLimiter passes through in test env', (done) => {
      const req = {};
      const res = {};
      const next = jest.fn(() => {
        expect(next).toHaveBeenCalled();
        done();
      });
      globalLimiter(req, res, next);
    });

    test('authLimiter passes through in test env', (done) => {
      const req = {};
      const res = {};
      const next = jest.fn(() => {
        expect(next).toHaveBeenCalled();
        done();
      });
      authLimiter(req, res, next);
    });

    test('speedLimiter passes through in test env', (done) => {
      const req = {};
      const res = {};
      const next = jest.fn(() => {
        expect(next).toHaveBeenCalled();
        done();
      });
      speedLimiter(req, res, next);
    });

    test('all limiters call next without modifying req/res', () => {
      const limiters = [
        globalLimiter,
        authLimiter,
        passwordResetLimiter,
        uploadLimiter,
        authenticatedLimiter,
        speedLimiter,
      ];

      limiters.forEach((limiter) => {
        const req = { original: true };
        const res = { original: true };
        const next = jest.fn();

        limiter(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.original).toBe(true);
        expect(res.original).toBe(true);
      });
    });
  });
});
