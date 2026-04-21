/**
 * ETag Middleware — Unit Tests
 */
const etagMiddleware = require('../../src/middleware/etag');

describe('etagMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { method: 'GET', headers: {} };
    res = {
      json: jest.fn(),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    next = jest.fn();
  });

  it('should call next() for GET requests', () => {
    etagMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should skip non-GET requests', () => {
    req.method = 'POST';
    etagMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    // res.json should not be overridden
  });

  it('should set ETag header on JSON response', () => {
    // Capture the ORIGINAL res.json before the middleware wraps it,
    // otherwise the "not.toBe" assertion trivially compares the wrapper
    // with itself.
    const originalJson = res.json;
    etagMiddleware(req, res, next);

    // The middleware should have replaced res.json with a wrapper
    expect(res.json).not.toBe(originalJson);

    // Call the new res.json
    res.json({ data: 'test' });

    expect(res.setHeader).toHaveBeenCalledWith(
      'ETag',
      expect.stringMatching(/^W\/"[a-f0-9]{32}"$/)
    );
  });

  it('should return 304 when ETag matches', () => {
    const crypto = require('crypto');
    const body = JSON.stringify({ data: 'test' });
    const hash = crypto.createHash('md5').update(body).digest('hex');
    const etag = `W/"${hash}"`;

    req.headers['if-none-match'] = etag;

    etagMiddleware(req, res, next);
    res.json({ data: 'test' });

    expect(res.status).toHaveBeenCalledWith(304);
    expect(res.end).toHaveBeenCalled();
  });

  it('should return full response when ETag does not match', () => {
    req.headers['if-none-match'] = 'W/"stale-hash"';

    // We need to capture the original json mock before middleware replaces it
    const jsonSpy = jest.fn();
    res.json = jsonSpy;

    etagMiddleware(req, res, next);

    // Now res.json is the wrapper — call it
    res.json({ data: 'test' });

    // Should NOT return 304
    expect(res.status).not.toHaveBeenCalledWith(304);
  });
});
