/**
 * Chatbot Semantic Integration Tests
 *
 * Tests the AI-enhanced matching flow in chatbot.service.js:
 * - semanticMatchKnowledgeBase fallback behavior
 * - processMessage with AI enabled/disabled
 * - Confidence-based routing
 * - Conversation history retrieval
 */

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('../src/services/claude.service', () => ({
  isAvailable: jest.fn(),
  semanticMatch: jest.fn(),
  enhanceResponse: jest.fn(),
  generateContextualResponse: jest.fn(),
  invalidateSemanticCache: jest.fn(),
  getStats: jest.fn(),
}));

const db = require('../src/database/connection');
const claudeService = require('../src/services/claude.service');
const chatbotService = require('../src/services/chatbot.service');

beforeEach(() => {
  jest.resetAllMocks();
  claudeService.isAvailable.mockReturnValue(false);
});

// ═══════════════════════════════════════════════════════════════════════
// SEMANTIC MATCH KB
// ═══════════════════════════════════════════════════════════════════════

describe('semanticMatchKnowledgeBase', () => {
  const faqRows = [
    { id: 'faq-1', question: 'Hogyan kérhetek szabadságot?', answer: 'Szabadság info', keywords: ['szabadság'], priority: 0 },
    { id: 'faq-2', question: 'Hol van a kórház?', answer: 'Kórház info', keywords: ['kórház'], priority: 0 },
  ];

  test('returns null when Claude is unavailable', async () => {
    claudeService.isAvailable.mockReturnValue(false);
    const result = await chatbotService.semanticMatchKnowledgeBase('test', 'c1');
    expect(result).toBeNull();
  });

  test('returns null when no FAQs in DB', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    db.query.mockResolvedValue({ rows: [] });
    const result = await chatbotService.semanticMatchKnowledgeBase('test', 'c1');
    expect(result).toBeNull();
  });

  test('returns matched FAQ on high confidence', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    db.query.mockResolvedValueOnce({ rows: faqRows });
    db.query.mockResolvedValueOnce({ rows: [] }); // usage_count update

    claudeService.semanticMatch.mockResolvedValue({ faqIndex: 1, confidence: 85 });

    const result = await chatbotService.semanticMatchKnowledgeBase('Hogyan igényeljek szabadnapot?', 'c1');
    expect(result).not.toBeNull();
    expect(result.id).toBe('faq-1');
    expect(result.combined_score).toBe(85);
    expect(result._ai_matched).toBe(true);
  });

  test('returns null on low confidence (<30)', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    db.query.mockResolvedValue({ rows: faqRows });
    claudeService.semanticMatch.mockResolvedValue({ faqIndex: 1, confidence: 20 });

    const result = await chatbotService.semanticMatchKnowledgeBase('Valami random', 'c1');
    expect(result).toBeNull();
  });

  test('returns null when Claude returns no match', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    db.query.mockResolvedValue({ rows: faqRows });
    claudeService.semanticMatch.mockResolvedValue({ faqIndex: 0, confidence: 0 });

    const result = await chatbotService.semanticMatchKnowledgeBase('test', 'c1');
    expect(result).toBeNull();
  });

  test('returns null when Claude returns null', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    db.query.mockResolvedValue({ rows: faqRows });
    claudeService.semanticMatch.mockResolvedValue(null);

    const result = await chatbotService.semanticMatchKnowledgeBase('test', 'c1');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONVERSATION HISTORY
// ═══════════════════════════════════════════════════════════════════════

describe('getConversationHistory', () => {
  test('returns formatted history from DB', async () => {
    db.query.mockResolvedValue({
      rows: [
        { sender_type: 'user', content: 'Hello' },
        { sender_type: 'bot', content: 'Üdvözlöm!' },
        { sender_type: 'user', content: 'Szabadságot kérnék' },
      ],
    });

    const history = await chatbotService.getConversationHistory('conv-1');
    expect(history).toHaveLength(3);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
    expect(history[2].role).toBe('user');
  });

  test('returns empty array for no messages', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const history = await chatbotService.getConversationHistory('conv-1');
    expect(history).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PROCESS MESSAGE — AI INTEGRATION
// ═══════════════════════════════════════════════════════════════════════

describe('processMessage with AI', () => {
  const setupConversation = () => {
    // Query 1: conversation status
    db.query.mockResolvedValueOnce({
      rows: [{ current_tree_id: null, current_node_id: null, status: 'active' }],
    });
    // Query 2: conversation context (getConversationContext)
    db.query.mockResolvedValueOnce({ rows: [] });
  };

  const setupKBQuery = (entries) => {
    // Query 3: knowledge base entries
    db.query.mockResolvedValueOnce({ rows: entries });
  };

  test('uses keyword match when AI is unavailable', async () => {
    claudeService.isAvailable.mockReturnValue(false);
    setupConversation();
    setupKBQuery([
      { id: 'faq-1', question: 'Hogyan kérhetek szabadságot?', answer: 'Szabadság válasz', keywords: ['szabadság', 'szabadsag'], priority: 10 },
    ]);
    // usage_count update
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await chatbotService.processMessage('conv-1', 'szabadság kérés', 'u1', 'c1');
    expect(result.metadata.source).toBe('knowledge_base');
    expect(result.metadata.ai_enhanced).toBeFalsy();
  });

  test('enhances keyword match with AI when available and score < 80', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    claudeService.enhanceResponse.mockResolvedValue({
      enhancedAnswer: 'AI-enhanced szabadság válasz',
      suggestions: ['Hány nap van?'],
    });

    setupConversation();
    setupKBQuery([
      { id: 'faq-1', question: 'Hogyan kérhetek szabadságot?', answer: 'Szabadság válasz', keywords: ['szabadság', 'szabadsag'], priority: 10 },
    ]);
    // usage_count update
    db.query.mockResolvedValueOnce({ rows: [] });
    // getConversationHistory for enhance
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await chatbotService.processMessage('conv-1', 'szabadság kérés', 'u1', 'c1');
    expect(result.content).toBe('AI-enhanced szabadság válasz');
    expect(result.metadata.ai_enhanced).toBe(true);
  });

  test('falls back to keyword match when AI enhancement fails', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    claudeService.enhanceResponse.mockResolvedValue(null);

    setupConversation();
    setupKBQuery([
      { id: 'faq-1', question: 'Hogyan kérhetek szabadságot?', answer: 'Eredeti válasz', keywords: ['szabadság', 'szabadsag'], priority: 10 },
    ]);
    db.query.mockResolvedValueOnce({ rows: [] }); // usage_count
    db.query.mockResolvedValueOnce({ rows: [] }); // history

    const result = await chatbotService.processMessage('conv-1', 'szabadság kérés', 'u1', 'c1');
    expect(result.content).toBe('Eredeti válasz');
    expect(result.metadata.ai_enhanced).toBe(false);
  });

  test('returns fallback when no match and AI unavailable', async () => {
    claudeService.isAvailable.mockReturnValue(false);
    setupConversation();
    setupKBQuery([]);

    // matchDecisionTree query
    db.query.mockResolvedValueOnce({ rows: [] });
    // getSuggestions query
    db.query.mockResolvedValueOnce({ rows: [] });
    // getFallbackMessage (getContractorConfig)
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await chatbotService.processMessage('conv-1', 'random question here', 'u1', 'c1');
    expect(result.metadata.source).toBe('fallback');
  });

  test('uses AI contextual response when no FAQ match', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    claudeService.semanticMatch.mockResolvedValue(null);
    claudeService.generateContextualResponse.mockResolvedValue({
      answer: 'AI-generated contextual answer',
      confidence: 60,
      suggestions: ['Kérdezze a HR-t'],
    });

    setupConversation();
    setupKBQuery([]);

    // semanticMatchKnowledgeBase DB query
    db.query.mockResolvedValueOnce({ rows: [] });
    // matchDecisionTree query
    db.query.mockResolvedValueOnce({ rows: [] });
    // getConversationHistory for contextual
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await chatbotService.processMessage('conv-1', 'special unique question', 'u1', 'c1');
    expect(result.metadata.source).toBe('ai_generated');
    expect(result.content).toBe('AI-generated contextual answer');
    expect(result.metadata.confidence_score).toBe(60);
  });

  test('skips AI contextual response on low confidence', async () => {
    claudeService.isAvailable.mockReturnValue(true);
    claudeService.semanticMatch.mockResolvedValue(null);
    claudeService.generateContextualResponse.mockResolvedValue({
      answer: 'Low confidence answer',
      confidence: 20,
      suggestions: [],
    });

    setupConversation();
    setupKBQuery([]);

    // semanticMatchKnowledgeBase DB query
    db.query.mockResolvedValueOnce({ rows: [] });
    // matchDecisionTree query
    db.query.mockResolvedValueOnce({ rows: [] });
    // getConversationHistory for contextual
    db.query.mockResolvedValueOnce({ rows: [] });
    // getSuggestions
    db.query.mockResolvedValueOnce({ rows: [] });
    // getFallbackMessage
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await chatbotService.processMessage('conv-1', 'random words here', 'u1', 'c1');
    expect(result.metadata.source).toBe('fallback');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONFIDENCE ROUTING
// ═══════════════════════════════════════════════════════════════════════

describe('Confidence-Based Routing', () => {
  test('high keyword score (>=30) returned directly without AI semantic search', async () => {
    claudeService.isAvailable.mockReturnValue(true);

    // conversation
    db.query.mockResolvedValueOnce({
      rows: [{ current_tree_id: null, current_node_id: null, status: 'active' }],
    });
    // context
    db.query.mockResolvedValueOnce({ rows: [] });
    // KB entries with high-match keyword
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'faq-1', question: 'Hol van a korhaz?',
        answer: 'A kórház a fő utcán van.',
        keywords: ['korhaz', 'kórház', 'orvos'], priority: 0,
      }],
    });
    // usage update
    db.query.mockResolvedValueOnce({ rows: [] });
    // history for enhance
    db.query.mockResolvedValueOnce({ rows: [] });

    claudeService.enhanceResponse.mockResolvedValue(null);

    const result = await chatbotService.processMessage('conv-1', 'Hol van a kórház?', 'u1', 'c1');
    expect(result.metadata.source).toBe('knowledge_base');
    // semanticMatch should NOT have been called since keyword match was strong
    expect(claudeService.semanticMatch).not.toHaveBeenCalled();
  });

  test('AI semantic search is called when available and KB has no match', async () => {
    claudeService.isAvailable.mockReturnValue(true);

    const faqEntry = { id: 'faq-1', question: 'Hogyan kérhetek szabadságot?', answer: 'Szabadság válasz', keywords: ['szabadság'], priority: 0 };
    claudeService.semanticMatch.mockResolvedValue({ faqIndex: 1, confidence: 70 });
    claudeService.enhanceResponse.mockResolvedValue(null);

    // processMessage query sequence for "pihenni" (no keyword match):
    db.query
      .mockResolvedValueOnce({ rows: [{ current_tree_id: null, current_node_id: null, status: 'active' }] }) // conversation
      .mockResolvedValueOnce({ rows: [] })    // getConversationContext messages
      .mockResolvedValueOnce({ rows: [faqEntry] })  // matchKnowledgeBase SELECT
      // no keyword hit → score < 15 → falls through to AI semantic
      .mockResolvedValueOnce({ rows: [faqEntry] })  // semanticMatchKnowledgeBase SELECT
      .mockResolvedValueOnce({ rows: [] })    // usage_count UPDATE
      .mockResolvedValueOnce({ rows: [] })    // getConversationHistory
      ;

    const result = await chatbotService.processMessage('conv-1', 'Szeretnék pihenni egy kicsit', 'u1', 'c1');
    expect(claudeService.semanticMatch).toHaveBeenCalled();
    expect(result.metadata.ai_matched).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BACKWARD COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════

describe('Backward Compatibility', () => {
  test('processMessage works identically when AI is off', async () => {
    claudeService.isAvailable.mockReturnValue(false);

    const faqEntry = {
      id: 'faq-1', question: 'Hogyan kérhetek szabadságot?',
      answer: 'Menjen a portálra.',
      keywords: ['szabadság', 'szabadsag'], priority: 5,
    };

    db.query
      .mockResolvedValueOnce({ rows: [{ current_tree_id: null, current_node_id: null, status: 'active' }] }) // conversation
      .mockResolvedValueOnce({ rows: [] })          // getConversationContext
      .mockResolvedValueOnce({ rows: [faqEntry] })  // matchKnowledgeBase SELECT
      .mockResolvedValueOnce({ rows: [] })           // usage_count UPDATE
      ;

    const result = await chatbotService.processMessage('conv-1', 'szabadság kérés', 'u1', 'c1');
    expect(result.content).toBe('Menjen a portálra.');
    expect(result.metadata.source).toBe('knowledge_base');
    expect(result.metadata.ai_enhanced).toBeFalsy();
    expect(result.metadata.ai_matched).toBeUndefined();
  });

  test('sanitizeInput still works', () => {
    expect(chatbotService.sanitizeInput('<b>hello</b>')).toBe('hello');
    expect(chatbotService.sanitizeInput(null)).toBeNull();
  });

  test('normalizeText still works', () => {
    expect(chatbotService.normalizeText('Szabadság')).toBe('szabadsag');
  });

  test('scoreEntry still works', () => {
    const score = chatbotService.scoreEntry(
      ['szabadsag'],
      { keywords: ['szabadság'], question: 'Test?', answer: 'Test', priority: 0 }
    );
    expect(score).toBeGreaterThan(0);
  });

  test('new exports exist', () => {
    expect(typeof chatbotService.semanticMatchKnowledgeBase).toBe('function');
    expect(typeof chatbotService.getConversationHistory).toBe('function');
  });
});
