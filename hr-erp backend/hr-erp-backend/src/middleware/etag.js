/**
 * ETag middleware for HTTP caching.
 * Generates weak ETags from JSON responses and returns 304 when unchanged.
 */
const crypto = require('crypto');

function etagMiddleware(req, res, next) {
  // Only for GET requests
  if (req.method !== 'GET') return next();

  const originalJson = res.json.bind(res);

  res.json = function (data) {
    const body = JSON.stringify(data);
    const hash = crypto.createHash('md5').update(body).digest('hex');
    const etag = `W/"${hash}"`;

    if (!res.headersSent) {
      res.setHeader('ETag', etag);
    }

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    return originalJson(data);
  };

  next();
}

module.exports = etagMiddleware;
