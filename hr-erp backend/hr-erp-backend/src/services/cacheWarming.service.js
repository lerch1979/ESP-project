/**
 * Cache Warming Service
 * Pre-loads frequently accessed data into Redis on startup and periodically.
 * DEFENSIVE: Never crashes the server — all errors are caught and logged.
 */
const { cacheSet, isConnected } = require('../config/redis');
const { logger } = require('../utils/logger');

let db;
try {
  db = require('../database/connection');
} catch {
  // Database module may not be available in test environment
  db = null;
}

class CacheWarmingService {
  /**
   * Warm critical data into Redis.
   * Uses Promise.allSettled so partial failures don't block others.
   */
  async warmCriticalData() {
    if (!isConnected()) {
      logger.info('Cache warming skipped — Redis not connected');
      return;
    }

    if (!db || !db.query) {
      logger.info('Cache warming skipped — database not available');
      return;
    }

    logger.info('Starting cache warming...');

    const tasks = [
      { name: 'dashboard stats', fn: () => this._warmDashboardStats() },
      { name: 'FAQ data', fn: () => this._warmFAQData() },
      { name: 'pulse categories', fn: () => this._warmPulseCategories() },
      { name: 'active user count', fn: () => this._warmActiveUserCount() },
    ];

    const results = await Promise.allSettled(tasks.map(t => t.fn()));

    const summary = tasks.map((t, i) =>
      results[i].status === 'fulfilled' ? `✓ ${t.name}` : `✗ ${t.name}`
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    logger.info(`Cache warming complete: ${successCount}/${tasks.length} — ${summary.join(', ')}`);
  }

  async _warmDashboardStats() {
    const { rows } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = true) AS active_users,
        (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed', 'resolved')) AS open_tickets,
        (SELECT COUNT(*) FROM accommodations WHERE is_active = true) AS active_accommodations
    `);
    if (rows[0]) {
      await cacheSet('warm:dashboard:stats', JSON.stringify(rows[0]), 180);
    }
  }

  async _warmFAQData() {
    const { rows } = await db.query(`
      SELECT id, name, slug, icon, color, sort_order
      FROM chatbot_faq_categories
      WHERE is_active = true
      ORDER BY sort_order ASC
    `);
    if (rows.length > 0) {
      await cacheSet('warm:faq:categories', JSON.stringify(rows), 600);
    }
  }

  async _warmPulseCategories() {
    const { rows } = await db.query(`
      SELECT category, COUNT(*) AS question_count
      FROM pulse_question_library
      WHERE is_active = true
      GROUP BY category
      ORDER BY category
    `);
    if (rows.length > 0) {
      await cacheSet('warm:pulse:categories', JSON.stringify(rows), 3600);
    }
  }

  async _warmActiveUserCount() {
    const { rows } = await db.query(`
      SELECT COUNT(*) AS count FROM users WHERE is_active = true
    `);
    if (rows[0]) {
      await cacheSet('warm:users:active_count', rows[0].count.toString(), 300);
    }
  }

  /**
   * Start periodic cache refresh (every 5 minutes).
   */
  startPeriodicRefresh(intervalMs = 5 * 60 * 1000) {
    this._interval = setInterval(async () => {
      try {
        await this.warmCriticalData();
      } catch (error) {
        logger.error('Periodic cache warming failed', { error: error.message });
      }
    }, intervalMs);

    logger.info(`Cache warming scheduled every ${intervalMs / 1000}s`);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

module.exports = new CacheWarmingService();
