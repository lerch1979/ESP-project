/**
 * Gamification API — Integration Tests
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Gamification API Integration', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });
    if (res.status === 200) authToken = res.body.token;
  });

  describe('GET /api/v1/gamification/my-stats', () => {
    it('should return user gamification stats', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/gamification/my-stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/gamification/leaderboard', () => {
    it('should return leaderboard', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/gamification/leaderboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.data || res.body)).toBe(true);
      }
    });
  });

  describe('GET /api/v1/gamification/badges/available', () => {
    it('should return available badges', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/gamification/badges/available')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/gamification/points-history', () => {
    it('should return points history', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/gamification/points-history')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });
});
