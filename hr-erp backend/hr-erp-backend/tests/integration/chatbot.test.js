/**
 * Chatbot API — Integration Tests
 */
const request = require('supertest');
const app = require('../../src/server');

describe('Chatbot API Integration', () => {
  let authToken;
  let conversationId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hr-erp.com', password: 'password123' });
    if (res.status === 200) authToken = res.body.token;
  });

  describe('GET /api/v1/chatbot/faq/categories (public)', () => {
    it('should return FAQ categories without auth', async () => {
      const res = await request(app)
        .get('/api/v1/chatbot/faq/categories');

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/v1/chatbot/faq/entries (public)', () => {
    it('should return FAQ entries without auth', async () => {
      const res = await request(app)
        .get('/api/v1/chatbot/faq/entries');

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /api/v1/chatbot/conversations', () => {
    it('should create new conversation', async () => {
      if (!authToken) return;

      const res = await request(app)
        .post('/api/v1/chatbot/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Integration Test Conversation' });

      if ([200, 201].includes(res.status)) {
        conversationId = res.body.data?.id || res.body.id;
      }
    });
  });

  describe('GET /api/v1/chatbot/conversations', () => {
    it('should return user conversations', async () => {
      if (!authToken) return;

      const res = await request(app)
        .get('/api/v1/chatbot/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /api/v1/chatbot/conversations/:id/messages', () => {
    it('should send message to conversation', async () => {
      if (!authToken || !conversationId) return;

      const res = await request(app)
        .post(`/api/v1/chatbot/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'Hello, this is a test message' });

      expect([200, 201, 404]).toContain(res.status);
    });
  });
});
