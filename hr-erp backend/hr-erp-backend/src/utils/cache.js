class TTLCache {
  constructor(defaultTTL = 5 * 60 * 1000) {
    this._cache = new Map();
    this._defaultTTL = defaultTTL;
  }

  get(key) {
    const entry = this._cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttl) {
    const expiresAt = Date.now() + (ttl || this._defaultTTL);
    this._cache.set(key, { value, expiresAt });
  }

  delete(key) {
    this._cache.delete(key);
  }

  clear() {
    this._cache.clear();
  }
}

module.exports = { TTLCache };
