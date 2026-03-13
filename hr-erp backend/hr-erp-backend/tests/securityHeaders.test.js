/**
 * Security Headers Tests
 */

const { createSecurityHeaders, cspReportHandler, additionalHeaders } = require('../src/middleware/securityHeaders');

describe('Security Headers Middleware', () => {
  describe('createSecurityHeaders', () => {
    test('should return a middleware function when enabled', () => {
      const middleware = createSecurityHeaders();
      expect(typeof middleware).toBe('function');
    });

    test('should return a pass-through function when disabled', () => {
      const original = process.env.SECURITY_HEADERS_ENABLED;
      process.env.SECURITY_HEADERS_ENABLED = 'false';

      const middleware = createSecurityHeaders();
      expect(typeof middleware).toBe('function');

      const req = {};
      const res = {};
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();

      process.env.SECURITY_HEADERS_ENABLED = original;
    });

    test('should set security headers on response', (done) => {
      const middleware = createSecurityHeaders();
      const req = { method: 'GET', url: '/test' };
      const headers = {};
      const res = {
        setHeader: jest.fn((name, value) => { headers[name] = value; }),
        getHeader: jest.fn((name) => headers[name]),
        removeHeader: jest.fn(),
        on: jest.fn(),
      };

      middleware(req, res, () => {
        // Helmet sets headers via setHeader
        // Check that key security headers are set
        const headerNames = Object.keys(headers).map(h => h.toLowerCase());

        // Helmet should have set these
        expect(headerNames).toContain('x-content-type-options');
        expect(headerNames).toContain('x-frame-options');
        expect(headers['X-Content-Type-Options']).toBe('nosniff');
        expect(headers['X-Frame-Options']).toBe('DENY');
        done();
      });
    });
  });

  describe('additionalHeaders', () => {
    test('should set Permissions-Policy header', () => {
      const req = { path: '/test' };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      additionalHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        expect.stringContaining('camera=()')
      );
      expect(next).toHaveBeenCalled();
    });

    test('should set Cache-Control for API routes', () => {
      const req = { path: '/api/v1/employees' };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      additionalHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private'
      );
      expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
    });

    test('should not set Cache-Control for non-API routes', () => {
      const req = { path: '/uploads/photo.jpg' };
      const setCalls = [];
      const res = {
        setHeader: jest.fn((name) => setCalls.push(name)),
      };
      const next = jest.fn();

      additionalHeaders(req, res, next);

      expect(setCalls).not.toContain('Cache-Control');
    });
  });

  describe('cspReportHandler', () => {
    test('should handle CSP violation reports and return 204', () => {
      const req = {
        body: {
          'csp-report': {
            'document-uri': 'http://localhost:3001/dashboard',
            'violated-directive': 'script-src',
            'blocked-uri': 'https://evil.com/script.js',
          },
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      };

      cspReportHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    test('should handle empty report body', () => {
      const req = { body: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      };

      cspReportHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });
});
