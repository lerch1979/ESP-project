/**
 * Language Management — Unit Tests
 * Tests: supported languages, validation
 */
const { SUPPORTED_LANGUAGES } = require('../src/controllers/language.controller');

describe('Language Management', () => {

  describe('SUPPORTED_LANGUAGES', () => {
    it('should include 5 languages', () => {
      expect(SUPPORTED_LANGUAGES).toHaveLength(5);
    });

    it('should include hu, en, tl, uk, de', () => {
      expect(SUPPORTED_LANGUAGES).toContain('hu');
      expect(SUPPORTED_LANGUAGES).toContain('en');
      expect(SUPPORTED_LANGUAGES).toContain('tl');
      expect(SUPPORTED_LANGUAGES).toContain('uk');
      expect(SUPPORTED_LANGUAGES).toContain('de');
    });

    it('should not include unsupported languages', () => {
      expect(SUPPORTED_LANGUAGES).not.toContain('fr');
      expect(SUPPORTED_LANGUAGES).not.toContain('es');
      expect(SUPPORTED_LANGUAGES).not.toContain('xx');
    });
  });
});
