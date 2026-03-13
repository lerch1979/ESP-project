/**
 * CSRF Protection Tests
 */

const { csrfProtection, csrfTokenHandler, generateToken } = require('../src/middleware/csrf');

describe('CSRF Protection', () => {
  let mockReq;
  let mockRes;
  let nextFn;

  beforeEach(() => {
    mockReq = {
      method: 'POST',
      path: '/api/v1/test',
      originalUrl: '/api/v1/test',
      ip: '127.0.0.1',
      headers: {},
      cookies: {},
    };

    mockRes = {
      cookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      locals: {},
    };

    nextFn = jest.fn();
  });

  describe('generateToken', () => {
    test('should generate a 64-char hex string', () => {
      const token = generateToken();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    test('should generate unique tokens', () => {
      const t1 = generateToken();
      const t2 = generateToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe('csrfProtection middleware', () => {
    test('should skip safe methods (GET)', () => {
      mockReq.method = 'GET';
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should skip safe methods (HEAD)', () => {
      mockReq.method = 'HEAD';
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should skip safe methods (OPTIONS)', () => {
      mockReq.method = 'OPTIONS';
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should skip requests with JWT Bearer token', () => {
      mockReq.headers['authorization'] = 'Bearer some.jwt.token';
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should skip exempt paths', () => {
      mockReq.path = '/auth/google/callback';
      const middleware = csrfProtection({
        enabled: true,
        exemptPaths: ['/auth/google/callback'],
      });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should reject POST without CSRF token', () => {
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CSRF_INVALID' })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    test('should reject POST with mismatched CSRF tokens', () => {
      mockReq.cookies._csrf = 'token-from-cookie';
      mockReq.headers['x-csrf-token'] = 'different-token';
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });

    test('should allow POST with matching CSRF tokens', () => {
      const token = generateToken();
      mockReq.cookies._csrf = token;
      mockReq.headers['x-csrf-token'] = token;
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should allow DELETE with matching CSRF tokens', () => {
      mockReq.method = 'DELETE';
      const token = generateToken();
      mockReq.cookies._csrf = token;
      mockReq.headers['x-csrf-token'] = token;
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should allow PUT with matching CSRF tokens', () => {
      mockReq.method = 'PUT';
      const token = generateToken();
      mockReq.cookies._csrf = token;
      mockReq.headers['x-csrf-token'] = token;
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should skip when disabled', () => {
      const middleware = csrfProtection({ enabled: false });
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should set CSRF cookie for new requests', () => {
      mockReq.method = 'GET';
      const middleware = csrfProtection({ enabled: true });
      middleware(mockReq, mockRes, nextFn);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        '_csrf',
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          sameSite: 'strict',
        })
      );
    });
  });

  describe('csrfTokenHandler', () => {
    test('should return a CSRF token', () => {
      mockReq._csrfToken = 'test-token-123';
      csrfTokenHandler(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        csrfToken: 'test-token-123',
      });
    });

    test('should set cookie when returning token', () => {
      mockReq._csrfToken = 'test-token';
      csrfTokenHandler(mockReq, mockRes);
      expect(mockRes.cookie).toHaveBeenCalled();
    });
  });
});
