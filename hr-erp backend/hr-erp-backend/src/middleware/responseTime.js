/**
 * Response time tracking middleware.
 * Adds X-Response-Time header and logs slow requests (>1s).
 */
const { logger } = require('../utils/logger');

function responseTime(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = (durationNs / 1e6).toFixed(1);

    res.setHeader('X-Response-Time', `${durationMs}ms`);

    if (durationMs > 1000) {
      logger.warn('Slow request', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: `${durationMs}ms`,
      });
    }
  });

  next();
}

module.exports = responseTime;
