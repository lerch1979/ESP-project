/**
 * Response Time Middleware — Unit Tests
 *
 * The middleware wraps res.end() to stamp X-Response-Time right before
 * the response is finalized. Test mocks res.end so the wrap + invocation
 * cycle can be exercised without a real HTTP round-trip.
 */
const responseTime = require('../../src/middleware/responseTime');

describe('responseTime middleware', () => {
  let req, res, next, originalEnd;

  beforeEach(() => {
    req = { method: 'GET', originalUrl: '/test' };
    originalEnd = jest.fn();
    res = {
      statusCode: 200,
      headersSent: false,
      setHeader: jest.fn(),
      end: originalEnd,
    };
    next = jest.fn();
  });

  it('should call next()', () => {
    responseTime(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should wrap res.end', () => {
    responseTime(req, res, next);
    expect(res.end).not.toBe(originalEnd);
    expect(typeof res.end).toBe('function');
  });

  it('should set X-Response-Time header when res.end is called', () => {
    responseTime(req, res, next);

    // Call the wrapped end (what Express would do when sending the response)
    res.end('body');

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Response-Time',
      expect.stringMatching(/^\d+(\.\d+)?ms$/)
    );
    expect(originalEnd).toHaveBeenCalledWith('body');
  });

  it('should NOT set X-Response-Time if headers already sent', () => {
    res.headersSent = true;
    responseTime(req, res, next);
    res.end();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(originalEnd).toHaveBeenCalled();
  });
});
