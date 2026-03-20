/**
 * Health Endpoints — Integration Tests
 * Tests /health, /health/ready, /health/live
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Health Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 OK', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness data', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'alive');
      expect(res.body).toHaveProperty('pid');
      expect(res.body).toHaveProperty('uptime');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness data', async () => {
      const res = await request(app).get('/health/ready');
      // May return 200 or 503 depending on DB connection
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
    });
  });

  describe('GET /api/health', () => {
    it('should return API health check', async () => {
      const res = await request(app).get('/api/health');
      expect([200, 503]).toContain(res.status);
    });
  });
});
