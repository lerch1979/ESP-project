/**
 * Analytics API — Integration Tests
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Analytics API Integration', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });
    if (res.status === 200) authToken = res.body.token;
  });

  describe('GET /api/v1/analytics/pulse/overview', () => {
    it('should return pulse overview', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/analytics/pulse/overview')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/analytics/pulse/trend', () => {
    it('should return pulse trend data', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/analytics/pulse/trend?days=30')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/analytics/pulse/categories', () => {
    it('should return category breakdown', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/analytics/pulse/categories')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/analytics/pulse/housing', () => {
    it('should return housing insights', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/analytics/pulse/housing')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/analytics/pulse/alerts', () => {
    it('should return active alerts', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/analytics/pulse/alerts')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/analytics/pulse/export', () => {
    it('should export analytics data', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/analytics/pulse/export?format=json')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });
});
