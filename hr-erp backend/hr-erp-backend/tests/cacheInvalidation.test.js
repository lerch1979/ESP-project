/**
 * Cache Invalidation Service — Unit Tests
 */
const cacheInvalidation = require('../src/services/cacheInvalidation.service');
const { cacheDel, isConnected } = require('../src/config/redis');

jest.mock('../src/config/redis', () => ({
  cacheDel: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
}));

describe('CacheInvalidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks resets .mock.calls but NOT .mockReturnValue. The
    // "not connected" test flips isConnected to false; without restoring,
    // every test after it sees the early-return in the service.
    isConnected.mockReturnValue(true);
    cacheDel.mockResolvedValue(undefined);
  });

  describe('invalidatePattern', () => {
    it('should call cacheDel with the pattern', async () => {
      await cacheInvalidation.invalidatePattern('test:*');
      expect(cacheDel).toHaveBeenCalledWith('test:*');
    });

    it('should skip when Redis is not connected', async () => {
      isConnected.mockReturnValue(false);
      await cacheInvalidation.invalidatePattern('test:*');
      expect(cacheDel).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      cacheDel.mockRejectedValue(new Error('Redis error'));
      await expect(cacheInvalidation.invalidatePattern('test:*')).resolves.not.toThrow();
    });
  });

  describe('invalidateDashboard', () => {
    it('should invalidate dashboard-related patterns', async () => {
      await cacheInvalidation.invalidateDashboard();
      expect(cacheDel).toHaveBeenCalledWith('warm:dashboard:*');
      expect(cacheDel).toHaveBeenCalledWith('api:*:*/dashboard*');
    });
  });

  describe('invalidateUsers', () => {
    it('should invalidate user-related patterns', async () => {
      await cacheInvalidation.invalidateUsers();
      expect(cacheDel).toHaveBeenCalledWith('warm:users:*');
      expect(cacheDel).toHaveBeenCalledWith('api:*:*/users*');
    });
  });

  describe('invalidatePulse', () => {
    it('should invalidate pulse and analytics patterns', async () => {
      await cacheInvalidation.invalidatePulse();
      expect(cacheDel).toHaveBeenCalledWith('warm:pulse:*');
      expect(cacheDel).toHaveBeenCalledWith('api:*:*/pulse*');
      expect(cacheDel).toHaveBeenCalledWith('api:*:*/analytics/pulse*');
    });
  });

  describe('invalidateFAQ', () => {
    it('should invalidate FAQ and chatbot FAQ patterns', async () => {
      await cacheInvalidation.invalidateFAQ();
      expect(cacheDel).toHaveBeenCalledWith('warm:faq:*');
      expect(cacheDel).toHaveBeenCalledWith('api:*:*/faq*');
      expect(cacheDel).toHaveBeenCalledWith('api:*:*/chatbot/faq*');
    });
  });

  describe('invalidateTickets', () => {
    it('should invalidate tickets and dashboard', async () => {
      await cacheInvalidation.invalidateTickets();
      expect(cacheDel).toHaveBeenCalledWith('api:*:*/tickets*');
      // Also invalidates dashboard
      expect(cacheDel).toHaveBeenCalledWith('warm:dashboard:*');
    });
  });

  describe('invalidateDamageReports', () => {
    it('should invalidate damage report patterns', async () => {
      await cacheInvalidation.invalidateDamageReports();
      expect(cacheDel).toHaveBeenCalledWith('api:*:*/damage-reports*');
    });
  });
});
