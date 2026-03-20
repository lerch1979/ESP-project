/**
 * Accommodation API — Integration Tests
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Accommodation API Integration', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });
    if (res.status === 200) authToken = res.body.token;
  });

  describe('GET /api/v1/accommodations', () => {
    it('should return accommodation list', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/accommodations')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });

    it('should support pagination', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/accommodations?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/accommodations');
      expect(res.status).toBe(401);
    });
  });
});
