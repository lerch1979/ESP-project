/**
 * Claude AI Service Tests
 *
 * Tests for: availability check, rate limiting, semantic matching,
 * response enhancement, contextual response, caching, error handling
 */

// Mock the SDK before requiring the service
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

// Save original env
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  // Reset module cache to pick up env changes
  jest.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function getService(apiKey = 'sk-ant-api03-real-key-here-1234567890') {
  process.env.ANTHROPIC_API_KEY = apiKey;
  return require('../src/services/claude.service');
}

// ═══════════════════════════════════════════════════════════════════════
// AVAILABILITY
// ═══════════════════════════════════════════════════════════════════════

describe('isAvailable', () => {
  test('returns true when API key is set', () => {
    const svc = getService('sk-ant-api03-real-key-here-1234567890');
    expect(svc.isAvailable()).toBe(true);
  });

  test('returns false when API key is empty', () => {
    const svc = getService('');
    expect(svc.isAvailable()).toBe(false);
  });

  test('returns false when API key is placeholder', () => {
    const svc = getService('sk-ant-api03-placeholder');
    expect(svc.isAvailable()).toBe(false);
  });

  test('returns false when API key is too short', () => {
    const svc = getService('short');
    expect(svc.isAvailable()).toBe(false);
  });

  test('returns false when API key is undefined', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const svc = require('../src/services/claude.service');
    expect(svc.isAvailable()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════

describe('Rate Limiting', () => {
  test('allows requests within limit', () => {
    const svc = getService();
    for (let i = 0; i < 10; i++) {
      expect(svc._checkRateLimit()).toBe(true);
    }
  });

  test('blocks requests when limit exceeded', () => {
    const svc = getService();
    // Exhaust all tokens
    for (let i = 0; i < 50; i++) {
      svc._checkRateLimit();
    }
    expect(svc._checkRateLimit()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SEMANTIC MATCH
// ═══════════════════════════════════════════════════════════════════════

describe('semanticMatch', () => {
  const faqs = [
    { id: '1', question: 'Hogyan kérhetek szabadságot?', answer: 'Szabadság igénylése', keywords: ['szabadság'] },
    { id: '2', question: 'Hol van a kórház?', answer: 'A kórház címe', keywords: ['kórház'] },
    { id: '3', question: 'Hogyan hozok létre projektet?', answer: 'Projekt létrehozása', keywords: ['projekt'] },
  ];

  test('returns null when API is unavailable', async () => {
    const svc = getService('');
    const result = await svc.semanticMatch('test question', faqs);
    expect(result).toBeNull();
  });

  test('returns null for empty FAQ list', async () => {
    const svc = getService();
    const result = await svc.semanticMatch('test question', []);
    expect(result).toBeNull();
  });

  test('returns null for null FAQ list', async () => {
    const svc = getService();
    const result = await svc.semanticMatch('test question', null);
    expect(result).toBeNull();
  });

  test('parses successful match response', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '{"match": 1, "confidence": 85}' }],
          usage: { input_tokens: 100, output_tokens: 20 },
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.semanticMatch('Hogyan igényeljek szabadnapot?', faqs);
    expect(result).not.toBeNull();
    expect(result.faqIndex).toBe(1);
    expect(result.confidence).toBe(85);
  });

  test('parses no-match response', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '{"match": 0, "confidence": 0}' }],
          usage: { input_tokens: 100, output_tokens: 10 },
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.semanticMatch('Mi a pizza ára?', faqs);
    expect(result).not.toBeNull();
    expect(result.faqIndex).toBe(0);
    expect(result.confidence).toBe(0);
  });

  test('returns null on API error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockRejectedValue(new Error('API timeout')),
      },
    }));

    const svc = getService();
    const result = await svc.semanticMatch('test', faqs);
    expect(result).toBeNull();
  });

  test('returns null on malformed JSON response', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: 'I think FAQ 1 matches best' }],
          usage: {},
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.semanticMatch('test', faqs);
    expect(result).toBeNull();
  });

  test('clamps confidence to 0-100 range', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '{"match": 1, "confidence": 150}' }],
          usage: {},
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.semanticMatch('test', faqs);
    expect(result.confidence).toBe(100);
  });

  test('rejects match index out of bounds', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '{"match": 99, "confidence": 80}' }],
          usage: {},
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.semanticMatch('test', faqs);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ENHANCE RESPONSE
// ═══════════════════════════════════════════════════════════════════════

describe('enhanceResponse', () => {
  test('returns null when API is unavailable', async () => {
    const svc = getService('');
    const result = await svc.enhanceResponse('question', 'answer', []);
    expect(result).toBeNull();
  });

  test('parses enhanced response with suggestions', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: 'A szabadságot a HR portálon igényelheti.\n\nKapcsolódó kérdések:\n- Hány nap szabadságom van?\n- Mi a betegszabadság folyamata?' }],
          usage: { input_tokens: 200, output_tokens: 50 },
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.enhanceResponse('Hogyan kérek szabadságot?', 'Szabadság igénylése a portálon.', []);
    expect(result).not.toBeNull();
    expect(result.enhancedAnswer).toContain('szabadságot');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  test('returns answer without suggestions if none provided', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: 'Enhanced answer text here.' }],
          usage: {},
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.enhanceResponse('q', 'a', []);
    expect(result.enhancedAnswer).toBe('Enhanced answer text here.');
    expect(result.suggestions).toEqual([]);
  });

  test('returns null on API error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockRejectedValue(new Error('Server error')),
      },
    }));

    const svc = getService();
    const result = await svc.enhanceResponse('q', 'a', []);
    expect(result).toBeNull();
  });

  test('handles conversation history in prompt', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ text: 'Response.' }],
      usage: {},
      stop_reason: 'end_turn',
    });
    Anthropic.mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    const svc = getService();
    await svc.enhanceResponse('q', 'a', [
      { role: 'user', content: 'Previous question' },
      { role: 'assistant', content: 'Previous answer' },
    ]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('Previous question');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONTEXTUAL RESPONSE
// ═══════════════════════════════════════════════════════════════════════

describe('generateContextualResponse', () => {
  test('returns null when API is unavailable', async () => {
    const svc = getService('');
    const result = await svc.generateContextualResponse('test', []);
    expect(result).toBeNull();
  });

  test('parses valid contextual response', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '{"answer": "Sajnos ezt nem tudom megválaszolni.", "confidence": 30, "suggestions": ["Kérdezze meg a HR-t"]}' }],
          usage: {},
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.generateContextualResponse('Mi az élet értelme?', []);
    expect(result).not.toBeNull();
    expect(result.answer).toContain('nem tudom');
    expect(result.confidence).toBe(30);
    expect(result.suggestions).toHaveLength(1);
  });

  test('clamps confidence to valid range', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '{"answer": "test", "confidence": -10, "suggestions": []}' }],
          usage: {},
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.generateContextualResponse('test', []);
    expect(result.confidence).toBe(0);
  });

  test('returns null on malformed response', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: 'Not JSON at all' }],
          usage: {},
          stop_reason: 'end_turn',
        }),
      },
    }));

    const svc = getService();
    const result = await svc.generateContextualResponse('test', []);
    expect(result).toBeNull();
  });

  test('returns null on API error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockRejectedValue(new Error('Rate limited')),
      },
    }));

    const svc = getService();
    const result = await svc.generateContextualResponse('test', []);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// STATS & CACHE
// ═══════════════════════════════════════════════════════════════════════

describe('getStats', () => {
  test('returns stats object', () => {
    const svc = getService();
    const stats = svc.getStats();
    expect(stats).toHaveProperty('available');
    expect(stats).toHaveProperty('model');
    expect(stats).toHaveProperty('rateLimitRemaining');
    expect(stats).toHaveProperty('rateLimitMax');
  });

  test('shows correct availability', () => {
    const svc = getService('sk-ant-api03-real-key-1234567890abcdef');
    expect(svc.getStats().available).toBe(true);
  });
});

describe('Cache Management', () => {
  test('invalidateSemanticCache does not throw', () => {
    const svc = getService();
    expect(() => svc.invalidateSemanticCache()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('Module Exports', () => {
  test('exports all expected functions', () => {
    const svc = getService();
    expect(typeof svc.isAvailable).toBe('function');
    expect(typeof svc.semanticMatch).toBe('function');
    expect(typeof svc.enhanceResponse).toBe('function');
    expect(typeof svc.generateContextualResponse).toBe('function');
    expect(typeof svc.invalidateSemanticCache).toBe('function');
    expect(typeof svc.getStats).toBe('function');
    expect(typeof svc._checkRateLimit).toBe('function');
    expect(typeof svc._callClaude).toBe('function');
  });
});
