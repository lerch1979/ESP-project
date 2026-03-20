/**
 * Redis Client — graceful fallback when Redis unavailable.
 * Provides caching methods that silently return null when Redis is down.
 */
const Redis = require('ioredis');
const { logger } = require('../utils/logger');

let client = null;
let isReady = false;

function createClient() {
  const url = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

  try {
    const redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // Stop reconnecting after 5 attempts
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on('connect', () => { isReady = true; logger.info('Redis connected'); });
    redis.on('error', (err) => { isReady = false; logger.debug('Redis error (non-critical):', err.message); });
    redis.on('close', () => { isReady = false; });

    redis.connect().catch(() => {
      logger.info('Redis not available — running without cache (performance reduced but functional)');
    });

    return redis;
  } catch {
    logger.info('Redis not configured — caching disabled');
    return null;
  }
}

client = createClient();

// ─── Cache API (safe to call even without Redis) ────────────────────

async function cacheGet(key) {
  if (!isReady || !client) return null;
  try { return await client.get(key); } catch { return null; }
}

async function cacheSet(key, value, ttlSeconds = 300) {
  if (!isReady || !client) return;
  try { await client.setex(key, ttlSeconds, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* silent */ }
}

async function cacheDel(pattern) {
  if (!isReady || !client) return;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) await client.del(...keys);
  } catch { /* silent */ }
}

function isConnected() { return isReady; }

module.exports = { client, cacheGet, cacheSet, cacheDel, isConnected };
