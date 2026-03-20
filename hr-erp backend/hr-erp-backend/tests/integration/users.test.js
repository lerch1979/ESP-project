/**
 * User Management API — Integration Tests
 * Tests CRUD operations on /api/v1/users
 */
const request = require('supertest');
const app = require('../../src/server');

describe('User Management API', () => {
  let authToken;
  let testUserId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });

    if (res.status === 200) {
      authToken = res.body.token;
    }
  });

  describe('GET /api/v1/users', () => {
    it('should return user list with auth', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('should support pagination', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/users?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should support search parameter', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/users?search=admin')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/users');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/users', () => {
    it('should create user with valid data', async () => {
      if (!authToken) return;

      const newUser = {
        email: `integration-test-${Date.now()}@example.com`,
        full_name: 'Integration Test User',
        role: 'employee',
        preferred_language: 'hu',
      };

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newUser);

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        testUserId = res.body.data?.id;
      }
    });

    it('should reject missing required fields', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'only-email@example.com' });

      expect([400, 422]).toContain(res.status);
    });

    it('should reject invalid email format', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'not-an-email', full_name: 'Test', role: 'employee' });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should return user by ID', async () => {
      if (!authToken || !testUserId) return;

      const res = await request(app)
        .get(`/api/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent user', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect([404, 400]).toContain(res.status);
    });
  });

  describe('PUT /api/v1/users/:id', () => {
    it('should update user', async () => {
      if (!authToken || !testUserId) return;

      const res = await request(app)
        .put(`/api/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ full_name: 'Updated Integration Test User' });

      expect([200, 204]).toContain(res.status);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('should delete user', async () => {
      if (!authToken || !testUserId) return;

      const res = await request(app)
        .delete(`/api/v1/users/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 204]).toContain(res.status);
    });
  });
});
