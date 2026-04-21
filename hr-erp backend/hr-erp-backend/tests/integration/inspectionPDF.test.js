/**
 * PDF generation smoke tests. Uses jest.mock to stub the DB layer so we
 * don't depend on seeded data — the goal is to verify the PDFs render
 * without throwing, not to assert on byte-level content.
 */
const fs = require('fs');
const path = require('path');

jest.mock('../../src/database/connection', () => {
  const queryMock = jest.fn();
  return {
    query: queryMock,
    transaction: async (fn) => fn({ query: queryMock }),
    pool: { end: async () => {} },
  };
});

const { query } = require('../../src/database/connection');
const pdfSvc = require('../../src/services/inspectionPDF.service');

const FIXTURE = {
  id: '00000000-0000-0000-0000-000000000000',
  inspection_number: 'ELL-2026-04-0042',
  accommodation_id: 'a-1',
  accommodation_name: 'Sopron - Várkerület 10.',
  accommodation_address: '9400 Sopron, Várkerület 10.',
  inspector_id: 'u-1',
  inspector_name: 'Kovács János',
  inspector_email: 'kovacs.janos@hs.hu',
  inspection_type: 'monthly',
  scheduled_at: '2026-04-15T09:00:00Z',
  started_at:   '2026-04-15T09:12:00Z',
  completed_at: '2026-04-15T10:47:00Z',
  status: 'completed',
  gps_latitude: 47.684820,
  gps_longitude: 16.583140,
  digital_signature: 'SIGNED_BLOB',
  signature_timestamp: '2026-04-15T10:45:00Z',
  total_score: 78,
  technical_score: 40,
  hygiene_score: 24,
  aesthetic_score: 14,
  grade: 'good',
  general_notes: 'Az ingatlan általában rendben van, néhány tétel igényel karbantartást.',
  admin_review_notes: 'A súlyosnak minősített tételek prioritást élveznek.',
};

const SCORES = [
  { category_name: 'Műszaki',   item_name: 'Villany működik', score: 10, max_score: 10, severity: 'ok',       notes: null },
  { category_name: 'Műszaki',   item_name: 'Fűtés működik',   score:  2, max_score: 10, severity: 'critical', notes: 'Radiátor levegős' },
  { category_name: 'Higiénia',  item_name: 'Konyha tisztasága', score: 6, max_score: 10, severity: 'major',  notes: 'Zsíros' },
  { category_name: 'Esztétika', item_name: 'Bútorok épsége',  score:  6, max_score: 10, severity: 'major',    notes: 'Ágykeret törött' },
];

const TASKS = [
  { id: 't1', title: 'Radiátor légtelenítése',    priority: 'emergency', due_date: '2026-04-16', status: 'pending' },
  { id: 't2', title: 'Ágykeret cseréje',          priority: 'high',      due_date: '2026-04-22', status: 'pending' },
];

const DAMAGES = [
  { id: 'd1', description: 'Ágykeret lábán repedés', severity: 'major', estimated_cost: 35000, status: 'pending' },
];

const ROOMS = [
  { room_number: '101', floor: 1, beds: 4, technical_score: 44, hygiene_score: 27, aesthetic_score: 18, total_score: 89, grade: 'good',       trend: 'improving', score_change:  4, residents_snapshot: [{name:'A'}], notes: null },
  { room_number: '203', floor: 2, beds: 4, technical_score: 20, hygiene_score: 15, aesthetic_score:  8, total_score: 43, grade: 'poor',       trend: 'declining', score_change: -6, residents_snapshot: [{name:'B'}], notes: 'Ágykeret' },
];

/**
 * loadInspectionContext issues 6 queries in order:
 *   1) inspection join
 *   2) scores
 *   3) photos
 *   4) tasks
 *   5) damages
 *   6) rooms
 */
function primeQueries() {
  query.mockReset();
  query
    .mockResolvedValueOnce({ rows: [FIXTURE] })    // inspection row
    .mockResolvedValueOnce({ rows: SCORES })        // scores
    .mockResolvedValueOnce({ rows: [] })            // photos
    .mockResolvedValueOnce({ rows: TASKS })         // tasks
    .mockResolvedValueOnce({ rows: DAMAGES })       // damages
    .mockResolvedValueOnce({ rows: ROOMS });        // rooms
}

async function streamToFile(doc, out) {
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(out);
    doc.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  return fs.statSync(out).size;
}

describe('Inspection PDF service', () => {
  const tmp = '/tmp/inspection-pdf-tests';
  beforeAll(() => { if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true }); });

  test('generateLegalProtocol renders non-empty PDF', async () => {
    primeQueries();
    const doc = await pdfSvc.generateLegalProtocol(FIXTURE.id);
    const size = await streamToFile(doc, path.join(tmp, 'legal.pdf'));
    expect(size).toBeGreaterThan(5000);
  });

  test('generateOwnerReport renders non-empty PDF', async () => {
    primeQueries();
    const doc = await pdfSvc.generateOwnerReport(FIXTURE.id);
    const size = await streamToFile(doc, path.join(tmp, 'owner.pdf'));
    expect(size).toBeGreaterThan(5000);
  });

  test('generateInspectionReport renders non-empty PDF', async () => {
    primeQueries();
    const doc = await pdfSvc.generateInspectionReport(FIXTURE.id);
    const size = await streamToFile(doc, path.join(tmp, 'report.pdf'));
    expect(size).toBeGreaterThan(5000);
  });

  test('surfaces INSPECTION_NOT_FOUND when inspection missing', async () => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });
    await expect(pdfSvc.generateLegalProtocol('missing')).rejects.toThrow('INSPECTION_NOT_FOUND');
  });
});
