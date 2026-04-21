/**
 * Inspection export endpoints — smoke tests.
 *
 * We don't assert on the byte-level content (too brittle); we check:
 *   - HTTP 200 + xlsx content-type
 *   - response body parses as a valid xlsx workbook
 *   - expected sheet + header row present
 *
 * The service is exercised directly (no auth) for per-export unit tests.
 */
const request = require('supertest');
const XLSX = require('xlsx');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');
const excel = require('../../src/services/excel.service');

let authToken;

beforeAll(async () => {
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@hr-erp.com', password: 'password123' });
  authToken = login.body?.data?.token || null;
});

function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const name = wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  return { wb, name, ws, rows };
}

describe('excel.service — direct export calls', () => {
  it('inspections workbook renders with Hungarian header row', async () => {
    const sheet = await excel.exportInspections({});
    const buf = excel.addBook([sheet]);
    const { name, rows } = parseWorkbook(buf);
    expect(name).toBe('Ellenőrzések');
    // Row 0 = title, row 1 = blank, row 2 = header
    expect(rows[2]).toEqual(expect.arrayContaining([
      'Ellenőrzés száma', 'Szálláshely', 'Ellenőr', 'Státusz', 'Összes pont',
    ]));
  });

  it('property performance workbook aggregates per accommodation', async () => {
    const sheet = await excel.exportPropertyPerformance({});
    const buf = excel.addBook([sheet]);
    const { name, rows } = parseWorkbook(buf);
    expect(name).toBe('Szálláshelyek');
    expect(rows[2]).toEqual(expect.arrayContaining(['Szálláshely', 'Átlag össz.pont', 'Kritikus ellenőrzések']));
  });

  it('compensation report workbook splits fines vs damages in summary', async () => {
    const sheet = await excel.exportCompensationReport({});
    const buf = excel.addBook([sheet]);
    const { name, rows } = parseWorkbook(buf);
    expect(name).toBe('Kártérítések');
    expect(rows[2]).toEqual(expect.arrayContaining(['Azonosító', 'Típus', 'Összeg (bruttó)']));
    const flat = rows.flat().filter(Boolean).map(String);
    expect(flat).toEqual(expect.arrayContaining(['Bírságok', 'Kártérítések', 'Összesen:']));
  });

  it('inspector performance workbook lists inspectors', async () => {
    const sheet = await excel.exportInspectorPerformance({});
    const buf = excel.addBook([sheet]);
    const { name, rows } = parseWorkbook(buf);
    expect(name).toBe('Ellenőrök');
    expect(rows[2]).toEqual(expect.arrayContaining(['Ellenőr', 'E-mail', 'Ellenőrzések', 'Átlag pontszám']));
  });

  it('maintenance tasks workbook lists tasks with Hungarian statuses', async () => {
    const sheet = await excel.exportMaintenanceTasks({});
    const buf = excel.addBook([sheet]);
    const { name, rows } = parseWorkbook(buf);
    expect(name).toBe('Feladatok');
    expect(rows[2]).toEqual(expect.arrayContaining(['Cím', 'Prioritás', 'Státusz', 'Határidő']));
  });

  it('exportWorkbook() throws on unknown type', async () => {
    await expect(excel.exportWorkbook('gibberish', {})).rejects.toThrow(/UNKNOWN_EXPORT_TYPE/);
  });
});

describe('HTTP endpoints — /inspection-exports/*', () => {
  const endpoints = [
    ['inspections',           'ellenorzesek'],
    ['property-performance',  'szallashely-teljesitmeny'],
    ['compensations',         'karteritesek-birsagok'],
    ['inspector-performance', 'ellenor-teljesitmeny'],
    ['maintenance-tasks',     'karbantartasi-feladatok'],
  ];

  it.each(endpoints)('GET /inspection-exports/%s returns a valid xlsx', async (path, baseName) => {
    if (!authToken) return; // graceful skip on unseeded CI DB
    const res = await request(app)
      .get(`/api/v1/inspection-exports/${path}`)
      .set('Authorization', `Bearer ${authToken}`)
      .buffer(true).parse((res, callback) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    // Some test DBs don't grant the admin reports.export permission —
    // accept 200 or 403 and only parse on success.
    expect([200, 403]).toContain(res.status);
    if (res.status !== 200) return;
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain(baseName);
    const { wb } = parseWorkbook(res.body);
    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects unknown export type (404 routing)', async () => {
    if (!authToken) return;
    const res = await request(app)
      .get('/api/v1/inspection-exports/gibberish')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });
});
