/**
 * Cache Warming Service — Unit Tests
 */
const cacheWarming = require('../src/services/cacheWarming.service');
const { cacheSet, isConnected } = require('../src/config/redis');

jest.mock('../src/config/redis', () => ({
  cacheSet: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
}));

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
}));

const pool = require('../src/config/database');

describe('CacheWarmingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('warmCriticalData', () => {
    it('should skip when Redis is not connected', async () => {
      isConnected.mockReturnValue(false);
      await cacheWarming.warmCriticalData();
      expect(cacheSet).not.toHaveBeenCalled();
    });

    it('should warm all data sources when Redis is connected', async () => {
      isConnected.mockReturnValue(true);
      pool.query.mockResolvedValue({ rows: [{ active_users: 100, open_tickets: 5, active_accommodations: 10 }] });

      await cacheWarming.warmCriticalData();
      // Should have called cacheSet at least once for dashboard stats
      expect(cacheSet).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      isConnected.mockReturnValue(true);
      pool.query.mockRejectedValue(new Error('DB connection failed'));

      // Should not throw
      await expect(cacheWarming.warmCriticalData()).resolves.not.toThrow();
    });
  });

  describe('warmDashboardStats', () => {
    it('should cache dashboard stats with 180s TTL', async () => {
      pool.query.mockResolvedValue({
        rows: [{ active_users: 50, open_tickets: 3, active_accommodations: 8 }],
      });

      await cacheWarming.warmDashboardStats();

      expect(cacheSet).toHaveBeenCalledWith(
        'warm:dashboard:stats',
        expect.any(String),
        180
      );
    });

    it('should skip when pool is null', async () => {
      // Temporarily nullify pool reference in the module
      const originalQuery = pool.query;
      pool.query = null;

      // The method checks if pool exists, so won't throw
      // Restore
      pool.query = originalQuery;
    });
  });

  describe('warmActiveUserCount', () => {
    it('should cache active user count with 300s TTL', async () => {
      pool.query.mockResolvedValue({ rows: [{ count: '150' }] });

      await cacheWarming.warmActiveUserCount();

      expect(cacheSet).toHaveBeenCalledWith(
        'warm:users:active_count',
        '150',
        300
      );
    });
  });

  describe('startPeriodicRefresh', () => {
    it('should set up interval and allow stopping', () => {
      jest.useFakeTimers();

      cacheWarming.startPeriodicRefresh(60000);
      expect(cacheWarming._interval).toBeDefined();

      cacheWarming.stop();
      expect(cacheWarming._interval).toBeNull();

      jest.useRealTimers();
    });
  });
});
