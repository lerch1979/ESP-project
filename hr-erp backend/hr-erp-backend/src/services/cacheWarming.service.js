/**
 * Cache Warming Service
 * Pre-loads frequently accessed data into Redis on startup and periodically.
 * Gracefully skips if Redis or DB is unavailable.
 */
const { cacheSet, isConnected } = require('../config/redis');
const { logger } = require('../utils/logger');
const pool = require('../config/database');

class CacheWarmingService {
  /**
   * Warm critical data into Redis
   */
  async warmCriticalData() {
    if (!isConnected()) {
      logger.info('Cache warming skipped — Redis not connected');
      return;
    }

    logger.info('Starting cache warming...');
    const results = [];

    const tasks = [
      { name: 'dashboard stats', fn: () => this.warmDashboardStats() },
      { name: 'FAQ data', fn: () => this.warmFAQData() },
      { name: 'pulse categories', fn: () => this.warmPulseCategories() },
      { name: 'active user count', fn: () => this.warmActiveUserCount() },
    ];

    for (const task of tasks) {
      try {
        await task.fn();
        results.push(`✓ ${task.name}`);
      } catch (error) {
        results.push(`✗ ${task.name}: ${error.message}`);
      }
    }

    logger.info(`Cache warming complete: ${results.join(', ')}`);
  }

  async warmDashboardStats() {
    if (!pool) return;
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = true) AS active_users,
        (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed', 'resolved')) AS open_tickets,
        (SELECT COUNT(*) FROM accommodations WHERE is_active = true) AS active_accommodations
    `);
    if (rows[0]) {
      await cacheSet('warm:dashboard:stats', JSON.stringify(rows[0]), 180);
    }
  }

  async warmFAQData() {
    if (!pool) return;
    try {
      const { rows } = await pool.query(`
        SELECT id, name, slug, icon, color, sort_order
        FROM chatbot_faq_categories
        WHERE is_active = true
        ORDER BY sort_order ASC
      `);
      if (rows.length > 0) {
        await cacheSet('warm:faq:categories', JSON.stringify(rows), 600);
      }
    } catch {
      // Table may not exist yet
    }
  }

  async warmPulseCategories() {
    if (!pool) return;
    try {
      const { rows } = await pool.query(`
        SELECT category, COUNT(*) AS question_count
        FROM pulse_question_library
        WHERE is_active = true
        GROUP BY category
        ORDER BY category
      `);
      if (rows.length > 0) {
        await cacheSet('warm:pulse:categories', JSON.stringify(rows), 3600);
      }
    } catch {
      // Table may not exist yet
    }
  }

  async warmActiveUserCount() {
    if (!pool) return;
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS count FROM users WHERE is_active = true
    `);
    if (rows[0]) {
      await cacheSet('warm:users:active_count', rows[0].count.toString(), 300);
    }
  }

  /**
   * Start periodic cache refresh (every 5 minutes)
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
