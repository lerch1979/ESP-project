/**
 * Cache middleware for GET API responses.
 * Automatically caches responses in Redis with configurable TTL.
 * Gracefully passes through when Redis unavailable.
 */
const { cacheGet, cacheSet, isConnected } = require('../config/redis');
const { logger } = require('../utils/logger');

function cacheMiddleware(ttlSeconds = 300) {
  return async (req, res, next) => {
    if (req.method !== 'GET' || !isConnected()) return next();

    const key = `api:${req.user?.id || 'anon'}:${req.originalUrl}`;

    try {
      const cached = await cacheGet(key);
      if (cached) {
        logger.debug('Cache HIT', { key });
        return res.json(JSON.parse(cached));
      }
    } catch { /* continue without cache */ }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) {
        cacheSet(key, JSON.stringify(data), ttlSeconds).catch(() => {});
      }
      return originalJson(data);
    };

    next();
  };
}

module.exports = { cacheMiddleware };
