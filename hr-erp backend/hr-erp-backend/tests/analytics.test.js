/**
 * Analytics & Report Generator Tests
 */

const { generateDashboardPDF, generateDashboardExcel, pdfToBuffer } = require('../src/services/reportGenerator.service');

// Mock data simulating what AnalyticsService returns
const MOCK_DATA = {
  generatedAt: new Date().toISOString(),
  employees: {
    active_employees: 142,
    total_employees: 165,
    new_hires_30d: 8,
    terminated: 23,
    visa_expiring_30d: 3,
    contracts_ending_30d: 5,
    unique_workplaces: 4,
    byWorkplace: [
      { workplace: 'Budapest', count: 85 },
      { workplace: 'Debrecen', count: 32 },
      { workplace: 'Győr', count: 25 },
    ],
    byGender: [
      { gender: 'male', count: 90 },
      { gender: 'female', count: 52 },
    ],
  },
  financial: {
    total_invoices: 234,
    total_amount: 45000000,
    paid_amount: 38000000,
    pending_amount: 5000000,
    overdue_amount: 2000000,
    paid_count: 198,
    pending_count: 28,
    overdue_count: 8,
    monthlyTrend: [
      { month: '2025-10', total: 7500000, count: 38 },
      { month: '2025-11', total: 8200000, count: 42 },
      { month: '2025-12', total: 6800000, count: 35 },
      { month: '2026-01', total: 7900000, count: 40 },
      { month: '2026-02', total: 8500000, count: 44 },
      { month: '2026-03', total: 6100000, count: 35 },
    ],
    byCategory: [
      { category: 'Szálláshely', count: 85, total: 15000000 },
      { category: 'Közüzem', count: 60, total: 12000000 },
      { category: 'Szállítás', count: 45, total: 8000000 },
    ],
  },
  tickets: {
    total_tickets: 312,
    open_tickets: 45,
    closed_tickets: 267,
    created_last_7d: 12,
    resolved_last_7d: 15,
    avg_resolution_hours: 18.5,
    byStatus: [
      { status: 'Új', color: '#3498db', count: 10 },
      { status: 'Folyamatban', color: '#f39c12', count: 20 },
      { status: 'Megoldva', color: '#27ae60', count: 267 },
      { status: 'Várakozik', color: '#95a5a6', count: 15 },
    ],
    byPriority: [
      { priority: 'Kritikus', count: 5 },
      { priority: 'Magas', count: 15 },
      { priority: 'Közepes', count: 25 },
      { priority: 'Alacsony', count: 267 },
    ],
    monthlyTrend: [
      { month: '2025-10', created: 48, resolved: 52 },
      { month: '2025-11', created: 55, resolved: 50 },
      { month: '2025-12', created: 42, resolved: 45 },
    ],
  },
  accommodations: {
    total_accommodations: 18,
    available: 3,
    occupied: 13,
    maintenance: 2,
    total_capacity: 240,
    total_monthly_rent: 3600000,
    overall_occupancy_pct: 78,
    total_occupants: 187,
    byAccommodation: [
      { name: 'Lakás A1', capacity: 20, occupants: 18, occupancy_pct: 90 },
      { name: 'Lakás B2', capacity: 15, occupants: 12, occupancy_pct: 80 },
      { name: 'Munkásszálló C', capacity: 40, occupants: 35, occupancy_pct: 88 },
    ],
  },
  projects: {
    total_projects: 12,
    active: 5,
    completed: 6,
    cancelled: 1,
    total_budget: 120000000,
    tasks: {
      total_tasks: 89,
      done: 52,
      in_progress: 18,
      todo: 14,
      blocked: 5,
      avg_progress: 65.3,
    },
  },
  activity: {
    total_actions: 456,
    creates: 120,
    updates: 280,
    deletes: 56,
    byResource: [
      { entity_type: 'employee', count: 150 },
      { entity_type: 'ticket', count: 120 },
      { entity_type: 'invoice', count: 100 },
    ],
    dailyActivity: [
      { day: '2026-03-08', count: 65 },
      { day: '2026-03-09', count: 72 },
      { day: '2026-03-10', count: 58 },
    ],
  },
};

describe('Report Generator Service', () => {
  describe('generateDashboardPDF', () => {
    test('generates a valid PDF document', async () => {
      const doc = generateDashboardPDF(MOCK_DATA);
      const buffer = await pdfToBuffer(doc);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
      // PDF magic bytes
      expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    });

    test('handles null sections gracefully', async () => {
      const partialData = {
        generatedAt: new Date().toISOString(),
        employees: MOCK_DATA.employees,
        financial: null,
        tickets: null,
        accommodations: null,
        projects: null,
        activity: null,
      };

      const doc = generateDashboardPDF(partialData);
      const buffer = await pdfToBuffer(doc);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(500);
    });

    test('handles empty data gracefully', async () => {
      const emptyData = {
        generatedAt: new Date().toISOString(),
        employees: null,
        financial: null,
        tickets: null,
        accommodations: null,
        projects: null,
        activity: null,
      };

      const doc = generateDashboardPDF(emptyData);
      const buffer = await pdfToBuffer(doc);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('generateDashboardExcel', () => {
    test('generates a valid Excel buffer', () => {
      const buffer = generateDashboardExcel(MOCK_DATA);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
    });

    test('handles null sections', () => {
      const buffer = generateDashboardExcel({
        employees: null,
        financial: null,
        tickets: null,
        accommodations: null,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(100);
    });

    test('contains expected sheets', () => {
      const XLSX = require('xlsx');
      const buffer = generateDashboardExcel(MOCK_DATA);
      const wb = XLSX.read(buffer);

      expect(wb.SheetNames).toContain('Összesítő');
      expect(wb.SheetNames).toContain('Munkahely bontás');
      expect(wb.SheetNames).toContain('Számlázás trend');
      expect(wb.SheetNames).toContain('Hibajegy státuszok');
      expect(wb.SheetNames).toContain('Szálláshely kihasználtság');
    });
  });

  describe('pdfToBuffer', () => {
    test('converts PDF stream to buffer', async () => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument();
      doc.text('Test');
      doc.end();

      const buffer = await pdfToBuffer(doc);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    });
  });
});
