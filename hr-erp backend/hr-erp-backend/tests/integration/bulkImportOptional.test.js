// Bulk employee import — visa/nationality/contract must be OPTIONAL.
// Proves an EU worker with blank visa/nationality/contract imports fine (→ NULL),
// and that a non-EU row lands in the correct DB fields (nationality upper-cased,
// contract end_date parsed) — the columns the visa-monitor reads.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');

// CI's test env ships no .env, so JWT_SECRET can be undefined. Provide a stable
// fallback AFTER requiring the app (dotenv has already run) so that both our
// jwt.sign() below and the app's jwt.verify() (read dynamically per request) use
// the same secret. Locally this is a no-op (the real secret is already set).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-bulkimport';

const MARK = 'ZBulkOptTest';
let authToken;
let seededUserId;
let seededContractorId;

function xlsxBuffer(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

beforeAll(async () => {
  // The test DB ships with no users, so seed a superadmin + craft a token
  // (authenticateToken DB-loads the user and reads roles from user_roles).
  const u = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active)
     VALUES ($1, 'x', 'Bulk', 'Tester', true) RETURNING id`,
    [`${MARK.toLowerCase()}-admin@example.com`]
  );
  seededUserId = u.rows[0].id;
  const c = await query(
    `INSERT INTO contractors (name, slug) VALUES ($1, $2) RETURNING id`,
    [`${MARK} Co`, `${MARK.toLowerCase()}-co`]
  );
  seededContractorId = c.rows[0].id;
  const role = await query(`SELECT id FROM roles WHERE slug = 'superadmin' LIMIT 1`);
  await query(
    `INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3)`,
    [seededUserId, role.rows[0].id, seededContractorId]
  );
  authToken = jwt.sign(
    { userId: seededUserId, email: `${MARK.toLowerCase()}-admin@example.com`, contractorId: null, roles: ['superadmin'] },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await query('DELETE FROM employees WHERE last_name LIKE $1', [`${MARK}%`]).catch(() => {});
  if (seededUserId) {
    await query('DELETE FROM user_roles WHERE user_id = $1', [seededUserId]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [seededUserId]).catch(() => {});
  }
  if (seededContractorId) {
    await query('DELETE FROM contractors WHERE id = $1', [seededContractorId]).catch(() => {});
  }
});

describe('bulk employee import — optional visa/nationality/contract', () => {
  test('EU worker with BLANK visa/nationality/contract imports successfully (→ NULL)', async () => {
    const buf = xlsxBuffer([{
      'Vezetéknév': `${MARK}EU`,
      'Keresztnév': 'NoVisa',
      'Vízum lejárat': '',
      'Nemzetiség': '',
      'Szerződés lejárat': '',
    }]);

    const res = await request(app)
      .post('/api/v1/employees/bulk')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', buf, 'optional.xlsx');

    expect(res.status).toBe(200);

    const r = await query(
      `SELECT visa_expiry::text AS visa_expiry, nationality, end_date::text AS end_date
         FROM employees WHERE last_name = $1`,
      [`${MARK}EU`]
    );
    expect(r.rows.length).toBe(1);          // imported despite all three blank
    expect(r.rows[0].visa_expiry).toBeNull();
    expect(r.rows[0].nationality).toBeNull();
    expect(r.rows[0].end_date).toBeNull();
  });

  test('non-EU row: nationality upper-cased, visa + contract dates land in the right fields', async () => {
    const buf = xlsxBuffer([{
      'Vezetéknév': `${MARK}NonEU`,
      'Keresztnév': 'HasVisa',
      'Vízum lejárat': '2027-03-15',
      'Nemzetiség': 'ph',               // lower-case in → should store 'PH'
      'Szerződés lejárat': '2026-12-31',
    }]);

    const res = await request(app)
      .post('/api/v1/employees/bulk')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', buf, 'filled.xlsx');

    expect(res.status).toBe(200);

    const r = await query(
      `SELECT visa_expiry::text AS visa_expiry, nationality, end_date::text AS end_date
         FROM employees WHERE last_name = $1`,
      [`${MARK}NonEU`]
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].nationality).toBe('PH');         // upper-cased
    expect(r.rows[0].visa_expiry).toBe('2027-03-15'); // visa → visa_expiry
    expect(r.rows[0].end_date).toBe('2026-12-31');    // contract → end_date
  });
});
