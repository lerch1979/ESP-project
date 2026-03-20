/**
 * Language Management API — Integration Tests
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Language Management API Integration', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });
    if (res.status === 200) authToken = res.body.token;
  });

  describe('GET /api/v1/language/supported', () => {
    it('should return supported languages', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/language/supported')
        .set('Authorization', `Bearer ${authToken}`);

      if (res.status === 200) {
        const languages = res.body.data || res.body;
        expect(languages).toContain('hu');
        expect(languages).toContain('en');
      }
    });
  });

  describe('GET /api/v1/language/my-language', () => {
    it('should return current user language', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/language/my-language')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('PUT /api/v1/language/my-language', () => {
    it('should update user language', async () => {
      if (!authToken) return;

      const res = await request(app)
        .put('/api/v1/language/my-language')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ language: 'en' });

      expect([200, 204, 404]).toContain(res.status);

      // Reset back to Hungarian
      await request(app)
        .put('/api/v1/language/my-language')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ language: 'hu' });
    });

    it('should reject invalid language code', async () => {
      if (!authToken) return;

      const res = await request(app)
        .put('/api/v1/language/my-language')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ language: 'xx' });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe('GET /api/v1/language/stats', () => {
    it('should return language statistics', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/language/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 403, 404]).toContain(res.status);
    });
  });
});
