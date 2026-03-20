/**
 * Cache Warming Service — Unit Tests
 */

jest.mock('../src/config/redis', () => ({
  cacheSet: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
}));

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
}));

const { cacheSet, isConnected } = require('../src/config/redis');
const db = require('../src/database/connection');

// Must require after mocks are set up
let cacheWarming;
beforeAll(() => {
  cacheWarming = require('../src/services/cacheWarming.service');
});

describe('CacheWarmingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isConnected.mockReturnValue(true);
  });

  describe('warmCriticalData', () => {
    it('should skip when Redis is not connected', async () => {
      isConnected.mockReturnValue(false);
      await cacheWarming.warmCriticalData();
      expect(cacheSet).not.toHaveBeenCalled();
    });

    it('should warm all data sources when Redis is connected', async () => {
      db.query.mockResolvedValue({
        rows: [{ active_users: 100, open_tickets: 5, active_accommodations: 10, count: '100' }],
      });

      await cacheWarming.warmCriticalData();
      expect(cacheSet).toHaveBeenCalled();
    });

    it('should handle partial failures gracefully', async () => {
      // First call succeeds, rest fail
      db.query
        .mockResolvedValueOnce({ rows: [{ active_users: 50, open_tickets: 3, active_accommodations: 8 }] })
        .mockRejectedValueOnce(new Error('Table not found'))
        .mockRejectedValueOnce(new Error('Table not found'))
        .mockResolvedValueOnce({ rows: [{ count: '50' }] });

      // Should not throw
      await expect(cacheWarming.warmCriticalData()).resolves.not.toThrow();
    });
  });

  describe('_warmDashboardStats', () => {
    it('should cache dashboard stats with 180s TTL', async () => {
      db.query.mockResolvedValue({
        rows: [{ active_users: 50, open_tickets: 3, active_accommodations: 8 }],
      });

      await cacheWarming._warmDashboardStats();

      expect(cacheSet).toHaveBeenCalledWith(
        'warm:dashboard:stats',
        expect.any(String),
        180
      );
    });
  });

  describe('_warmActiveUserCount', () => {
    it('should cache active user count with 300s TTL', async () => {
      db.query.mockResolvedValue({ rows: [{ count: '150' }] });

      await cacheWarming._warmActiveUserCount();

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
