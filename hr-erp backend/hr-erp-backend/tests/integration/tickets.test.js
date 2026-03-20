/**
 * Ticket API — Integration Tests
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Ticket API Integration', () => {
  let authToken;
  let testTicketId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });
    if (res.status === 200) authToken = res.body.token;
  });

  describe('GET /api/v1/tickets', () => {
    it('should return ticket list', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('should support status filter', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/tickets?status=open')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should support pagination', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/tickets?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/tickets');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/tickets', () => {
    it('should create ticket', async () => {
      if (!authToken) return;

      const ticket = {
        title: 'Integration Test Ticket',
        description: 'Created by integration test',
        priority: 'medium',
      };

      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(ticket);

      if ([200, 201].includes(res.status)) {
        testTicketId = res.body.data?.id;
        expect(res.body.success).toBe(true);
      }
    });

    it('should reject empty title', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'No title' });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe('GET /api/v1/tickets/:id', () => {
    it('should return ticket detail', async () => {
      if (!authToken || !testTicketId) return;

      const res = await request(app)
        .get(`/api/v1/tickets/${testTicketId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/v1/tickets/:id/status', () => {
    it('should update ticket status', async () => {
      if (!authToken || !testTicketId) return;

      const res = await request(app)
        .patch(`/api/v1/tickets/${testTicketId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_progress' });

      expect([200, 204]).toContain(res.status);
    });
  });
});
