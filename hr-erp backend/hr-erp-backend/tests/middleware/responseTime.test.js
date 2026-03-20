/**
 * Response Time Middleware — Unit Tests
 */
const responseTime = require('../../src/middleware/responseTime');

describe('responseTime middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { method: 'GET', originalUrl: '/test' };
    res = {
      statusCode: 200,
      setHeader: jest.fn(),
      on: jest.fn(),
    };
    next = jest.fn();
  });

  it('should call next()', () => {
    responseTime(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should register a finish listener', () => {
    responseTime(req, res, next);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should set X-Response-Time header on finish', () => {
    responseTime(req, res, next);

    // Simulate the finish event
    const finishCallback = res.on.mock.calls[0][1];
    finishCallback();

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Response-Time',
      expect.stringMatching(/^\d+(\.\d+)?ms$/)
    );
  });
});
