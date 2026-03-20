/**
 * AutoTranslate Service — Unit Tests
 * Tests: translation logic, caching, mock mode
 */

// Mock the database before importing service
jest.mock('../src/database/connection', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  pool: { connect: jest.fn() },
}));

const { query } = require('../src/database/connection');

// Set mock mode
process.env.GOOGLE_TRANSLATE_ENABLED = 'false';
process.env.GOOGLE_TRANSLATE_MOCK = 'true';

// Now require service (after mocks are set)
const autoTranslate = require('../src/services/autoTranslate.service');

describe('AutoTranslate Service', () => {

  beforeEach(() => {
    query.mockClear();
  });

  describe('translateText', () => {
    it('should return original text when source equals target language', async () => {
      const result = await autoTranslate.translateText('Hello', 'en', 'en');
      expect(result).toBe('Hello');
    });

    it('should return empty string for null input', async () => {
      const result = await autoTranslate.translateText(null, 'en', 'hu');
      expect(result).toBe('');
    });

    it('should return empty string for empty input', async () => {
      const result = await autoTranslate.translateText('', 'en', 'hu');
      expect(result).toBe('');
    });

    it('should return original text for unsupported target language', async () => {
      const result = await autoTranslate.translateText('Hello', 'en', 'xx');
      expect(result).toBe('Hello');
    });

    it('should return mock translation with language prefix', async () => {
      // Mock: no cache hit
      query.mockResolvedValueOnce({ rows: [] });
      // Mock: cache insert
      query.mockResolvedValueOnce({ rows: [] });

      const result = await autoTranslate.translateText('Hello world', 'en', 'hu');
      expect(result).toBe('[HU] Hello world');
    });

    it('should trim whitespace from input', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      query.mockResolvedValueOnce({ rows: [] });

      const result = await autoTranslate.translateText('  Hello  ', 'en', 'hu');
      expect(result).toBe('[HU] Hello');
    });

    it('should return cached translation when available', async () => {
      // Mock: cache hit
      query.mockResolvedValueOnce({ rows: [{ translated_text: 'Szia világ' }] });
      // Mock: cache hit update
      query.mockResolvedValueOnce({ rows: [] });

      const result = await autoTranslate.translateText('Hello world', 'en', 'hu');
      expect(result).toBe('Szia világ');
    });
  });

  describe('translateObject', () => {
    it('should translate specified fields', async () => {
      query.mockResolvedValue({ rows: [] }); // No cache

      const obj = { title: 'Hello', count: 5, language: 'en' };
      const result = await autoTranslate.translateObject(obj, 'language', 'hu', ['title']);

      expect(result.title).toBe('[HU] Hello');
      expect(result.count).toBe(5); // Unchanged
      expect(result._translated).toBe(true);
    });

    it('should return unchanged object when same language', async () => {
      const obj = { title: 'Hello', language: 'en' };
      const result = await autoTranslate.translateObject(obj, 'language', 'en', ['title']);

      expect(result.title).toBe('Hello');
    });

    it('should handle null object', async () => {
      const result = await autoTranslate.translateObject(null, 'language', 'hu', ['title']);
      expect(result).toBeNull();
    });
  });

  describe('translateArray', () => {
    it('should translate all items in array', async () => {
      query.mockResolvedValue({ rows: [] });

      const items = [
        { text: 'Hello', language: 'en' },
        { text: 'World', language: 'en' },
      ];
      const result = await autoTranslate.translateArray(items, 'language', 'hu', ['text']);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('[HU] Hello');
      expect(result[1].text).toBe('[HU] World');
    });

    it('should handle empty array', async () => {
      const result = await autoTranslate.translateArray([], 'language', 'hu', ['text']);
      expect(result).toEqual([]);
    });

    it('should handle null input', async () => {
      const result = await autoTranslate.translateArray(null, 'language', 'hu', ['text']);
      expect(result).toBeNull();
    });
  });
});
