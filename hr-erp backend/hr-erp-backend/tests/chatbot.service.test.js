/**
 * Chatbot Service Tests
 *
 * Tests for: text processing, input validation, keyword extraction, edge cases
 * DB-dependent functions tested via controller integration tests
 */

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

const chatbotService = require('../src/services/chatbot.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// TEXT NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════

describe('normalizeText', () => {
  test('converts to lowercase and removes accents', () => {
    expect(chatbotService.normalizeText('Szabadság')).toBe('szabadsag');
  });

  test('removes special characters', () => {
    expect(chatbotService.normalizeText('Hello! World?')).toBe('hello world');
  });

  test('handles all Hungarian accented characters', () => {
    expect(chatbotService.normalizeText('áéíóöőúüű')).toBe('aeiooouuu');
    expect(chatbotService.normalizeText('ÁÉÍÓÖŐÚÜŰ')).toBe('aeiooouuu');
  });

  test('handles empty string', () => {
    expect(chatbotService.normalizeText('')).toBe('');
  });

  test('trims whitespace', () => {
    expect(chatbotService.normalizeText('  hello  ')).toBe('hello');
  });

  test('handles mixed case and accents', () => {
    expect(chatbotService.normalizeText('ÉKEZETES SzÖvEg')).toBe('ekezetes szoveg');
  });

  test('removes numbers from middle of text', () => {
    const result = chatbotService.normalizeText('abc123def');
    expect(result).toBe('abc123def');
  });

  test('handles punctuation', () => {
    expect(chatbotService.normalizeText('hello, world! how?')).toBe('hello world how');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// WORD EXTRACTION
// ═══════════════════════════════════════════════════════════════════════

describe('extractWords', () => {
  test('splits text into words and normalizes', () => {
    const words = chatbotService.extractWords('hogyan kérhetek szabadságot');
    expect(words).toContain('hogyan');
    expect(words).toContain('kerhetek');
    expect(words).toContain('szabadsagot');
  });

  test('filters out single-character words', () => {
    const words = chatbotService.extractWords('a b cd efg');
    expect(words).not.toContain('a');
    expect(words).not.toContain('b');
    expect(words).toContain('cd');
    expect(words).toContain('efg');
  });

  test('returns empty array for empty string', () => {
    expect(chatbotService.extractWords('')).toEqual([]);
  });

  test('handles consecutive spaces', () => {
    const words = chatbotService.extractWords('hello    world   test');
    expect(words).toEqual(['hello', 'world', 'test']);
  });

  test('handles accented words', () => {
    const words = chatbotService.extractWords('Fizetés Szabadság');
    expect(words).toContain('fizetes');
    expect(words).toContain('szabadsag');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// INPUT SANITIZATION
// ═══════════════════════════════════════════════════════════════════════

describe('sanitizeInput', () => {
  test('strips HTML tags', () => {
    expect(chatbotService.sanitizeInput('<b>hello</b>')).toBe('hello');
  });

  test('returns null for empty input', () => {
    expect(chatbotService.sanitizeInput('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(chatbotService.sanitizeInput(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(chatbotService.sanitizeInput(undefined)).toBeNull();
  });

  test('returns null for non-string input', () => {
    expect(chatbotService.sanitizeInput(123)).toBeNull();
    expect(chatbotService.sanitizeInput({})).toBeNull();
    expect(chatbotService.sanitizeInput([])).toBeNull();
  });

  test('trims whitespace', () => {
    expect(chatbotService.sanitizeInput('  hello  ')).toBe('hello');
  });

  test('truncates to 2000 characters', () => {
    const longText = 'a'.repeat(3000);
    const result = chatbotService.sanitizeInput(longText);
    expect(result.length).toBe(2000);
  });

  test('returns null for whitespace-only input', () => {
    expect(chatbotService.sanitizeInput('   ')).toBeNull();
  });

  test('handles script injection attempts', () => {
    const result = chatbotService.sanitizeInput('<script>alert("xss")</script>hello');
    expect(result).toBe('alert("xss")hello');
    expect(result).not.toContain('<script>');
  });

  test('strips nested HTML', () => {
    const result = chatbotService.sanitizeInput('<div><p>text</p></div>');
    expect(result).toBe('text');
  });

  test('handles emoji in input', () => {
    const result = chatbotService.sanitizeInput('Hello 😀 World');
    expect(result).toBeTruthy();
    expect(result).toContain('Hello');
  });

  test('preserves newlines', () => {
    const result = chatbotService.sanitizeInput('Line 1\nLine 2\nLine 3');
    expect(result).toBe('Line 1\nLine 2\nLine 3');
  });

  test('handles only HTML tags (empty after strip)', () => {
    expect(chatbotService.sanitizeInput('<br><br><br>')).toBeNull();
  });

  test('handles very long text with HTML', () => {
    const text = '<b>' + 'x'.repeat(2500) + '</b>';
    const result = chatbotService.sanitizeInput(text);
    expect(result.length).toBe(2000);
    expect(result).not.toContain('<');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
  test('normalizeText handles all-special-chars input', () => {
    expect(chatbotService.normalizeText('!@#$%^&*()')).toBe('');
  });

  test('extractWords handles all-special-chars', () => {
    expect(chatbotService.extractWords('!@#$%^&*()')).toEqual([]);
  });

  test('sanitizeInput handles tab characters', () => {
    const result = chatbotService.sanitizeInput('\thello\t');
    expect(result).toBe('hello');
  });

  test('normalizeText preserves numbers', () => {
    expect(chatbotService.normalizeText('szoba 123')).toBe('szoba 123');
  });

  test('extractWords with numbers', () => {
    const words = chatbotService.extractWords('szoba 123 kulcs');
    expect(words).toContain('szoba');
    expect(words).toContain('123');
    expect(words).toContain('kulcs');
  });

  test('sanitizeInput with mixed content', () => {
    const result = chatbotService.sanitizeInput('  <b>Hello</b> World!  ');
    expect(result).toBe('Hello World!');
  });

  test('handles unicode whitespace', () => {
    // Non-breaking space
    const result = chatbotService.sanitizeInput('hello\u00A0world');
    expect(result).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('Module Exports', () => {
  test('exports all expected functions', () => {
    expect(typeof chatbotService.normalizeText).toBe('function');
    expect(typeof chatbotService.extractWords).toBe('function');
    expect(typeof chatbotService.sanitizeInput).toBe('function');
    expect(typeof chatbotService.getWelcomeMessage).toBe('function');
    expect(typeof chatbotService.getFallbackMessage).toBe('function');
    expect(typeof chatbotService.getEscalationMessage).toBe('function');
    expect(typeof chatbotService.matchKnowledgeBase).toBe('function');
    expect(typeof chatbotService.matchDecisionTree).toBe('function');
    expect(typeof chatbotService.processMessage).toBe('function');
    expect(typeof chatbotService.createEscalationTicket).toBe('function');
    expect(typeof chatbotService.getFaqCategories).toBe('function');
    expect(typeof chatbotService.getFaqEntries).toBe('function');
    expect(typeof chatbotService.searchFaq).toBe('function');
    expect(typeof chatbotService.getSuggestions).toBe('function');
    expect(typeof chatbotService.getConversationContext).toBe('function');
    expect(typeof chatbotService.navigateTree).toBe('function');
    expect(typeof chatbotService.startTree).toBe('function');
    expect(typeof chatbotService.invalidateConfigCache).toBe('function');
    expect(typeof chatbotService.invalidateFaqCategoryCache).toBe('function');
  });

  test('searchFaq returns empty for short text', async () => {
    const result = await chatbotService.searchFaq('c1', 'a');
    expect(result).toEqual([]);
  });

  test('searchFaq returns empty for null text', async () => {
    const result = await chatbotService.searchFaq('c1', null);
    expect(result).toEqual([]);
  });

  test('getSuggestions returns empty for empty text', async () => {
    const result = await chatbotService.getSuggestions('', 'c1');
    expect(result).toEqual([]);
  });

  test('matchKnowledgeBase returns null for empty text', async () => {
    const result = await chatbotService.matchKnowledgeBase('', 'c1');
    expect(result).toBeNull();
  });

  test('matchKnowledgeBase returns null for single char', async () => {
    const result = await chatbotService.matchKnowledgeBase('a', 'c1');
    expect(result).toBeNull();
  });

  test('processMessage returns error for null input', async () => {
    const result = await chatbotService.processMessage('conv-1', null, 'u1', 'c1');
    expect(result.content).toContain('nem dolgozható fel');
  });

  test('processMessage returns error for empty input', async () => {
    const result = await chatbotService.processMessage('conv-1', '', 'u1', 'c1');
    expect(result.content).toContain('nem dolgozható fel');
  });

  test('processMessage returns error for HTML-only input', async () => {
    const result = await chatbotService.processMessage('conv-1', '<br>', 'u1', 'c1');
    expect(result.content).toContain('nem dolgozható fel');
  });
});
