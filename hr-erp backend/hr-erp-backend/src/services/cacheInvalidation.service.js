/**
 * Cache Invalidation Service
 * Pattern-based Redis cache invalidation for mutations.
 */
const { cacheDel, isConnected } = require('../config/redis');
const { logger } = require('../utils/logger');

class CacheInvalidationService {
  /**
   * Delete all keys matching a pattern
   */
  async invalidatePattern(pattern) {
    if (!isConnected()) return;

    try {
      await cacheDel(pattern);
      logger.debug(`Cache invalidated: ${pattern}`);
    } catch (error) {
      logger.error('Cache invalidation failed', { error: error.message, pattern });
    }
  }

  async invalidateDashboard() {
    await this.invalidatePattern('warm:dashboard:*');
    await this.invalidatePattern('api:*:*/dashboard*');
  }

  async invalidateUsers() {
    await this.invalidatePattern('warm:users:*');
    await this.invalidatePattern('api:*:*/users*');
  }

  async invalidatePulse() {
    await this.invalidatePattern('warm:pulse:*');
    await this.invalidatePattern('api:*:*/pulse*');
    await this.invalidatePattern('api:*:*/analytics/pulse*');
  }

  async invalidateFAQ() {
    await this.invalidatePattern('warm:faq:*');
    await this.invalidatePattern('api:*:*/faq*');
    await this.invalidatePattern('api:*:*/chatbot/faq*');
  }

  async invalidateTickets() {
    await this.invalidatePattern('api:*:*/tickets*');
    await this.invalidateDashboard();
  }

  async invalidateDamageReports() {
    await this.invalidatePattern('api:*:*/damage-reports*');
  }
}

module.exports = new CacheInvalidationService();
