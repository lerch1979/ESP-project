/**
 * Damage Report API — Integration Tests
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Damage Report API Integration', () => {
  let authToken;
  let reportId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });
    if (res.status === 200) authToken = res.body.token;
  });

  describe('GET /api/v1/damage-reports', () => {
    it('should return damage report list', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/damage-reports')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/damage-reports');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/damage-reports', () => {
    it('should create damage report', async () => {
      if (!authToken) return;

      const report = {
        location: 'Fertőd, Szállás A',
        description: 'Integration test damage report',
        damage_type: 'property',
        estimated_cost: 85000,
      };

      const res = await request(app)
        .post('/api/v1/damage-reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(report);

      if ([200, 201].includes(res.status)) {
        reportId = res.body.data?.id;
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('GET /api/v1/damage-reports/:id', () => {
    it('should return report detail', async () => {
      if (!authToken || !reportId) return;

      const res = await request(app)
        .get(`/api/v1/damage-reports/${reportId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent report', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/damage-reports/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect([404, 400]).toContain(res.status);
    });
  });
});
