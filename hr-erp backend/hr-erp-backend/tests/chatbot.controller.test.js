/**
 * Chatbot Controller Tests
 *
 * Tests API endpoints using mocked req/res objects.
 */

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

// Mock the translation service so getUserLanguage / translateText don't fire
// internal query() calls that would consume test mocks intended for the
// controller's own SQL. Identity translate + default 'hu' mirrors the no-op
// path taken when ANTHROPIC_API_KEY is absent, which matches pre-translation
// test expectations exactly.
jest.mock('../src/services/translation.service', () => ({
  translateText: jest.fn(async (text) => text),
  getUserLanguage: jest.fn(async () => 'hu'),
  translateObject: jest.fn(async (obj) => obj),
  translateArray: jest.fn(async (arr) => arr),
  AUTO_APPROVE_THRESHOLD: 70,
}));

jest.mock('../src/services/chatbot.service', () => ({
  getWelcomeMessage: jest.fn().mockResolvedValue('Üdvözlöm!'),
  getFallbackMessage: jest.fn().mockResolvedValue('Nem találtam.'),
  getEscalationMessage: jest.fn().mockResolvedValue('Továbbítottam.'),
  getFaqCategories: jest.fn().mockResolvedValue([]),
  getFaqEntries: jest.fn().mockResolvedValue([]),
  searchFaq: jest.fn().mockResolvedValue([]),
  sanitizeInput: jest.fn((text) => {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.replace(/<[^>]*>/g, '').trim();
    return cleaned.length === 0 ? null : cleaned;
  }),
  processMessage: jest.fn().mockResolvedValue({
    content: 'Bot válasz',
    message_type: 'text',
    metadata: { source: 'knowledge_base', kb_id: null },
  }),
  createEscalationTicket: jest.fn().mockResolvedValue({ ticketId: 'ticket-1', ticketNumber: '#1001' }),
  invalidateConfigCache: jest.fn(),
  invalidateFaqCategoryCache: jest.fn(),
}));

const { query } = require('../src/database/connection');
const chatbot = require('../src/controllers/chatbot.controller');

const mockQueryResult = (rows) => ({ rows, rowCount: rows.length });

const mockReq = (overrides = {}) => ({
  user: { id: 'user-1', contractorId: 'contractor-1', roles: ['user'] },
  params: {},
  query: {},
  body: {},
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// CREATE CONVERSATION
// ═══════════════════════════════════════════════════════════════════════

describe('createConversation', () => {
  test('creates conversation and returns 201', async () => {
    const conv = { id: 'conv-1', user_id: 'user-1', title: 'Test' };
    query.mockResolvedValueOnce(mockQueryResult([conv])); // INSERT conv
    query.mockResolvedValueOnce(mockQueryResult([])); // INSERT welcome msg
    // getFaqCategories returns [] (mocked), so no faq_list message

    const req = mockReq({ body: { title: 'Test' } });
    const res = mockRes();

    await chatbot.createConversation(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ id: 'conv-1' }) })
    );
  });

  test('handles database error', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const req = mockReq();
    const res = mockRes();

    await chatbot.createConversation(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════════════════════════════════════

describe('sendMessage', () => {
  test('rejects empty message', async () => {
    const req = mockReq({
      params: { conversationId: 'conv-1' },
      body: { content: '' },
    });
    const res = mockRes();

    await chatbot.sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects null content', async () => {
    const req = mockReq({
      params: { conversationId: 'conv-1' },
      body: { content: null },
    });
    const res = mockRes();

    await chatbot.sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects HTML-only content', async () => {
    const req = mockReq({
      params: { conversationId: 'conv-1' },
      body: { content: '<br><br>' },
    });
    const res = mockRes();

    await chatbot.sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 for non-existent conversation', async () => {
    query.mockResolvedValueOnce(mockQueryResult([])); // ownership check

    const req = mockReq({
      params: { conversationId: 'nonexistent' },
      body: { content: 'Hello' },
    });
    const res = mockRes();

    await chatbot.sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 for closed conversation', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'conv-1', status: 'closed' }]));

    const req = mockReq({
      params: { conversationId: 'conv-1' },
      body: { content: 'Hello' },
    });
    const res = mockRes();

    await chatbot.sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('sends message and gets bot response', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'conv-1', status: 'active' }])); // ownership
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'msg-u' }])); // user msg INSERT
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'msg-b' }])); // bot msg INSERT
    query.mockResolvedValueOnce(mockQueryResult([{ cnt: '1' }])); // msg count
    query.mockResolvedValueOnce(mockQueryResult([])); // update title

    const req = mockReq({
      params: { conversationId: 'conv-1' },
      body: { content: 'Szabadság kérdés' },
    });
    const res = mockRes();

    await chatbot.sendMessage(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          userMessage: expect.any(Object),
          botMessage: expect.any(Object),
        }),
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GET MESSAGES
// ═══════════════════════════════════════════════════════════════════════

describe('getMessages', () => {
  test('returns messages for owned conversation', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'conv-1' }])); // ownership
    query.mockResolvedValueOnce(mockQueryResult([
      { id: 'msg-1', sender_type: 'bot', content: 'Welcome' },
      { id: 'msg-2', sender_type: 'user', content: 'Hello' },
    ]));

    const req = mockReq({ params: { conversationId: 'conv-1' } });
    const res = mockRes();

    await chatbot.getMessages(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.any(Array) })
    );
  });

  test('returns 404 for non-owned conversation', async () => {
    query.mockResolvedValueOnce(mockQueryResult([]));

    const req = mockReq({ params: { conversationId: 'not-mine' } });
    const res = mockRes();

    await chatbot.getMessages(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FEEDBACK
// ═══════════════════════════════════════════════════════════════════════

describe('submitFeedback', () => {
  test('rejects missing messageId', async () => {
    const req = mockReq({ body: { helpful: true } });
    const res = mockRes();

    await chatbot.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects non-boolean helpful', async () => {
    const req = mockReq({ body: { messageId: 'msg-1', helpful: 'yes' } });
    const res = mockRes();

    await chatbot.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects missing helpful field', async () => {
    const req = mockReq({ body: { messageId: 'msg-1' } });
    const res = mockRes();

    await chatbot.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 for non-existent message', async () => {
    query.mockResolvedValueOnce(mockQueryResult([]));

    const req = mockReq({ body: { messageId: 'nonexistent', helpful: true } });
    const res = mockRes();

    await chatbot.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 403 for non-owned message', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{
      id: 'msg-1', faq_id: null, conversation_id: 'conv-1', user_id: 'other-user',
    }]));

    const req = mockReq({ body: { messageId: 'msg-1', helpful: true } });
    const res = mockRes();

    await chatbot.submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('submits positive feedback successfully', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{
      id: 'msg-1', faq_id: 'faq-1', conversation_id: 'conv-1', user_id: 'user-1',
    }])); // msg check
    query.mockResolvedValueOnce(mockQueryResult([])); // update msg
    query.mockResolvedValueOnce(mockQueryResult([])); // update FAQ counter

    const req = mockReq({ body: { messageId: 'msg-1', helpful: true } });
    const res = mockRes();

    await chatbot.submitFeedback(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ helpful: true, faqId: 'faq-1' }),
      })
    );
  });

  test('submits negative feedback successfully', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{
      id: 'msg-1', faq_id: 'faq-2', conversation_id: 'conv-1', user_id: 'user-1',
    }]));
    query.mockResolvedValueOnce(mockQueryResult([])); // update msg
    query.mockResolvedValueOnce(mockQueryResult([])); // update FAQ counter

    const req = mockReq({ body: { messageId: 'msg-1', helpful: false } });
    const res = mockRes();

    await chatbot.submitFeedback(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ helpful: false }),
      })
    );
  });

  test('handles feedback on message without FAQ', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{
      id: 'msg-1', faq_id: null, conversation_id: 'conv-1', user_id: 'user-1',
    }]));
    query.mockResolvedValueOnce(mockQueryResult([])); // update msg only, no FAQ counter

    const req = mockReq({ body: { messageId: 'msg-1', helpful: true } });
    const res = mockRes();

    await chatbot.submitFeedback(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
    // Should NOT update FAQ counter (only 2 queries: check + update msg)
    expect(query).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ESCALATION
// ═══════════════════════════════════════════════════════════════════════

describe('escalateConversation', () => {
  test('escalates active conversation', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'conv-1', status: 'active' }]));
    query.mockResolvedValueOnce(mockQueryResult([])); // escalation msg

    const req = mockReq({ params: { conversationId: 'conv-1' } });
    const res = mockRes();

    await chatbot.escalateConversation(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ ticketNumber: '#1001' }),
      })
    );
  });

  test('rejects escalation of non-active conversation', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'conv-1', status: 'escalated' }]));

    const req = mockReq({ params: { conversationId: 'conv-1' } });
    const res = mockRes();

    await chatbot.escalateConversation(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 for non-owned conversation', async () => {
    query.mockResolvedValueOnce(mockQueryResult([]));

    const req = mockReq({ params: { conversationId: 'not-mine' } });
    const res = mockRes();

    await chatbot.escalateConversation(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CLOSE CONVERSATION
// ═══════════════════════════════════════════════════════════════════════

describe('closeConversation', () => {
  test('closes active conversation', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'conv-1', status: 'closed' }]));
    query.mockResolvedValueOnce(mockQueryResult([])); // system msg

    const req = mockReq({ params: { conversationId: 'conv-1' } });
    const res = mockRes();

    await chatbot.closeConversation(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('returns 404 when no active conversation found', async () => {
    query.mockResolvedValueOnce(mockQueryResult([]));

    const req = mockReq({ params: { conversationId: 'conv-1' } });
    const res = mockRes();

    await chatbot.closeConversation(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE CRUD
// ═══════════════════════════════════════════════════════════════════════

describe('Knowledge Base CRUD', () => {
  test('creates new FAQ entry', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{
      id: 'kb-1', question: 'Test?', answer: 'Yes.',
    }]));

    const req = mockReq({
      body: { question: 'Test?', answer: 'Yes.', keywords: ['test'] },
    });
    const res = mockRes();

    await chatbot.createKnowledgeBaseEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('rejects missing question', async () => {
    const req = mockReq({ body: { answer: 'Answer' } });
    const res = mockRes();

    await chatbot.createKnowledgeBaseEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects missing answer', async () => {
    const req = mockReq({ body: { question: 'Question?' } });
    const res = mockRes();

    await chatbot.createKnowledgeBaseEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('updates existing FAQ', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{
      id: 'kb-1', question: 'Updated?', answer: 'Updated.',
    }]));

    const req = mockReq({
      params: { id: 'kb-1' },
      body: { question: 'Updated?', answer: 'Updated.' },
    });
    const res = mockRes();

    await chatbot.updateKnowledgeBaseEntry(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('returns 404 when updating non-existent FAQ', async () => {
    query.mockResolvedValueOnce(mockQueryResult([]));

    const req = mockReq({
      params: { id: 'nonexistent' },
      body: { question: 'Q?', answer: 'A.' },
    });
    const res = mockRes();

    await chatbot.updateKnowledgeBaseEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('deletes FAQ entry', async () => {
    query.mockResolvedValueOnce(mockQueryResult([{ id: 'kb-1' }]));

    const req = mockReq({ params: { id: 'kb-1' } });
    const res = mockRes();

    await chatbot.deleteKnowledgeBaseEntry(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('returns 404 when deleting non-existent FAQ', async () => {
    query.mockResolvedValueOnce(mockQueryResult([]));

    const req = mockReq({ params: { id: 'nonexistent' } });
    const res = mockRes();

    await chatbot.deleteKnowledgeBaseEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('Controller Exports', () => {
  test('exports all expected controller methods', () => {
    expect(typeof chatbot.createConversation).toBe('function');
    expect(typeof chatbot.getConversations).toBe('function');
    expect(typeof chatbot.getMessages).toBe('function');
    expect(typeof chatbot.sendMessage).toBe('function');
    expect(typeof chatbot.escalateConversation).toBe('function');
    expect(typeof chatbot.closeConversation).toBe('function');
    expect(typeof chatbot.submitFeedback).toBe('function');
    expect(typeof chatbot.getUserFaqCategories).toBe('function');
    expect(typeof chatbot.getUserFaqEntries).toBe('function');
    expect(typeof chatbot.selectSuggestion).toBe('function');
    expect(typeof chatbot.adminGetConversations).toBe('function');
    expect(typeof chatbot.adminGetConversationDetail).toBe('function');
    expect(typeof chatbot.getKnowledgeBase).toBe('function');
    expect(typeof chatbot.createKnowledgeBaseEntry).toBe('function');
    expect(typeof chatbot.updateKnowledgeBaseEntry).toBe('function');
    expect(typeof chatbot.deleteKnowledgeBaseEntry).toBe('function');
    expect(typeof chatbot.bulkActionKnowledgeBase).toBe('function');
    expect(typeof chatbot.getAnalytics).toBe('function');
    expect(typeof chatbot.getDecisionTrees).toBe('function');
    expect(typeof chatbot.getConfig).toBe('function');
    expect(typeof chatbot.updateConfig).toBe('function');
    expect(typeof chatbot.getGlobalAnalytics).toBe('function');
  });
});
