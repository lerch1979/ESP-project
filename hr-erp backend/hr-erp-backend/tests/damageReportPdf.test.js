/**
 * Damage Report PDF — Unit Tests
 * Tests: HTML template generation, translation loading
 */
const { buildHTML, SUPPORTED_LANGS } = require('../src/services/damageReportPdf.service');

const mockReport = {
  id: 'test-id',
  report_number: 'KJ-2026-03-0001',
  employee_first_name: 'Teszt',
  employee_last_name: 'Elek',
  employee_email: 'teszt@example.com',
  contractor_name: 'Test Kft.',
  incident_date: '2026-03-15',
  discovery_date: '2026-03-16',
  description: 'Törött ablak a 204-es szobában.',
  accommodation_id: 'Fertőd, Fő u. 1.',
  room_id: 'A-204',
  photo_urls: ['photo1.jpg', 'photo2.jpg'],
  damage_items: [
    { name: 'Ablak csere', cost: 45000, description: 'Biztonsági üveg' },
    { name: 'Munkaóra', cost: 15000, description: '1 óra' },
  ],
  total_cost: 60000,
  fault_percentage: 100,
  liability_type: 'negligence',
  employee_acknowledged: false,
  payment_plan: [],
  status: 'draft',
  created_at: '2026-03-16T10:00:00Z',
};

describe('Damage Report PDF', () => {

  describe('SUPPORTED_LANGS', () => {
    it('should support 5 languages', () => {
      expect(SUPPORTED_LANGS).toEqual(['hu', 'en', 'tl', 'uk', 'de']);
    });
  });

  describe('buildHTML', () => {
    it('should generate valid HTML for Hungarian', () => {
      const html = buildHTML(mockReport, 'hu');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('KÁRIGÉNY JEGYZŐKÖNYV');
      expect(html).toContain('KJ-2026-03-0001');
      expect(html).toContain('Teszt Elek');
      expect(html).toContain('Törött ablak');
    });

    it('should generate English version', () => {
      const html = buildHTML(mockReport, 'en');
      expect(html).toContain('DAMAGE REPORT');
      expect(html).toContain('KJ-2026-03-0001');
    });

    it('should generate Ukrainian (Cyrillic) version', () => {
      const html = buildHTML(mockReport, 'uk');
      expect(html).toContain('ЗВІТ ПРО ПОШКОДЖЕННЯ');
    });

    it('should generate German version', () => {
      const html = buildHTML(mockReport, 'de');
      expect(html).toContain('SCHADENSBERICHT');
    });

    it('should generate Tagalog version', () => {
      const html = buildHTML(mockReport, 'tl');
      expect(html).toContain('ULAT NG PINSALA');
    });

    it('should include all 9 sections', () => {
      const html = buildHTML(mockReport, 'hu');
      expect(html).toContain('1.');
      expect(html).toContain('2.');
      expect(html).toContain('3.');
      expect(html).toContain('4.');
      expect(html).toContain('5.');
      expect(html).toContain('6.');
      expect(html).toContain('7.');
      expect(html).toContain('8.');
      expect(html).toContain('9.');
    });

    it('should show photo count', () => {
      const html = buildHTML(mockReport, 'hu');
      expect(html).toContain('2'); // 2 photos
    });

    it('should include Section 6 settlement details when cost data is present', () => {
      // mockReport has total_cost / fault_percentage / liability_type set,
      // so the builder takes the cost-grid branch (not the placeholder).
      // Assert against the rendered grid. We mirror the builder's own
      // Intl.NumberFormat call so the test stays correct regardless of
      // whether ICU emits a regular space, NBSP, or NNBSP between the
      // thousands group — that detail varies by Node/ICU version.
      const html = buildHTML(mockReport, 'hu');
      const formattedAmount = new Intl.NumberFormat('hu-HU').format(60000);
      expect(html).toContain('Becsült kár összege');
      expect(html).toContain(formattedAmount);
      expect(html).toContain('Felróhatóság mértéke');
      expect(html).toContain('100%');
      expect(html).toContain('Gondatlanság');
    });

    it('should fall back to settlement placeholder text when no cost data', () => {
      // hasCostData = false branch in damageReportPdf.service.js — guards
      // legacy reports that pre-date the expanded cost grid.
      const minimal = {
        ...mockReport,
        total_cost: null,
        fault_percentage: null,
        employee_salary: null,
        liability_type: null,
      };
      const html = buildHTML(minimal, 'hu');
      expect(html).toContain('később kerül megállapításra');
    });

    it('should include legal references', () => {
      const html = buildHTML(mockReport, 'hu');
      expect(html).toContain('Mt. 166');
      expect(html).toContain('Mt. 177');
      expect(html).toContain('Ptk. 6:142');
    });

    it('should fallback to Hungarian for invalid language', () => {
      const html = buildHTML(mockReport, 'invalid');
      expect(html).toContain('KÁRIGÉNY JEGYZŐKÖNYV');
    });

    it('should include signature sections', () => {
      const html = buildHTML(mockReport, 'hu');
      expect(html).toContain('Munkavállaló');
      expect(html).toContain('Facility Manager');
      expect(html).toContain('Tanú');
    });
  });
});
