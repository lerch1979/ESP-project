/**
 * Language Management API — Integration Tests
 *
 * NOTE: these previously targeted `/api/v1/language/*`, which is NOT mounted —
 * every request 404'd and the lenient assertions passed on the 404, so the file
 * provided zero real coverage. The actual endpoints live under /users:
 *   GET   /api/v1/users/me/language
 *   PATCH /api/v1/users/me/language   (validates against SUPPORTED_LANGUAGES)
 * Retargeted to those, with a real round-trip + validation assertion.
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Language Management API Integration', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });
    if (res.status === 200) authToken = res.body.data?.token;
  });

  describe('GET /api/v1/users/me/language', () => {
    it('should return the current user language', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/users/me/language')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const lang = res.body.data?.language || res.body.language;
      expect(typeof lang).toBe('string');
    });
  });

  describe('PATCH /api/v1/users/me/language', () => {
    afterAll(async () => {
      if (!authToken) return;
      // Restore Hungarian so the shared admin account isn't left in English.
      await request(app)
        .patch('/api/v1/users/me/language')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ language: 'hu' });
    });

    it('should update the language and persist it (round-trip)', async () => {
      if (!authToken) return;

      const upd = await request(app)
        .patch('/api/v1/users/me/language')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ language: 'en' });
      expect(upd.status).toBe(200);

      // Read it back — the write must actually persist (this is the class of
      // silent no-op the audit is guarding against).
      const check = await request(app)
        .get('/api/v1/users/me/language')
        .set('Authorization', `Bearer ${authToken}`);
      expect(check.status).toBe(200);
      expect(check.body.data?.language || check.body.language).toBe('en');
    });

    it('should reject an invalid language code with 400', async () => {
      if (!authToken) return;

      const res = await request(app)
        .patch('/api/v1/users/me/language')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ language: 'xx' });

      expect(res.status).toBe(400);
    });
  });
});
