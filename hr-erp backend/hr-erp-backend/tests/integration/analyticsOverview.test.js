// BI Insights overview — read-only aggregate analytics. Asserts the endpoint
// returns the full tile shape (works even on sparse data; values may be 0).
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-insights';

const MARK = 'ZInsightsTest';
let token, userId, contractorId;

beforeAll(async () => {
  const u = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active)
     VALUES ($1, 'x', 'Ins', 'Tester', true) RETURNING id`,
    [`${MARK.toLowerCase()}@example.com`]
  );
  userId = u.rows[0].id;
  const c = await query(`INSERT INTO contractors (name, slug) VALUES ($1, $2) RETURNING id`,
    [`${MARK} Co`, `${MARK.toLowerCase()}-co`]);
  contractorId = c.rows[0].id;
  const role = await query(`SELECT id FROM roles WHERE slug = 'superadmin' LIMIT 1`);
  await query(`INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3)`,
    [userId, role.rows[0].id, contractorId]);
  token = jwt.sign({ userId, email: `${MARK.toLowerCase()}@example.com`, contractorId: null, roles: ['superadmin'] },
    process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await query('DELETE FROM user_roles WHERE user_id = $1', [userId]).catch(() => {});
  await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  await query('DELETE FROM contractors WHERE id = $1', [contractorId]).catch(() => {});
});

describe('GET /analytics/overview', () => {
  test('returns the full insights shape (200)', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const d = res.body.data;
    // KPIs
    expect(d.kpis).toEqual(expect.objectContaining({
      activeEmployees: expect.any(Number),
      occupancyPct: expect.any(Number),
      totalBeds: expect.any(Number),
      occupiedBeds: expect.any(Number),
      openTickets: expect.any(Number),
      expiring30d: expect.any(Number),
    }));
    expect(d.kpis.occupancyPct).toBeGreaterThanOrEqual(0);
    expect(d.kpis.occupancyPct).toBeLessThanOrEqual(100);
    // Expiry horizon — 3 non-overlapping buckets
    expect(d.expiryHorizon).toHaveLength(3);
    expect(d.expiryHorizon[0]).toEqual(expect.objectContaining({ horizon: '0–30', visa: expect.any(Number), contract: expect.any(Number) }));
    // Ticket age — 4 buckets + slaBreached
    expect(d.ticketAge.buckets).toHaveLength(4);
    expect(typeof d.ticketAge.slaBreached).toBe('number');
    // Throughput + workforce + utilization are arrays
    expect(Array.isArray(d.throughput)).toBe(true);
    expect(Array.isArray(d.workforce.byNationality)).toBe(true);
    expect(Array.isArray(d.workforce.byAccommodation)).toBe(true);
    expect(Array.isArray(d.utilization)).toBe(true);
  });

  test('requires auth (401 or 403)', async () => {
    const res = await request(app).get('/api/v1/analytics/overview');
    expect([401, 403]).toContain(res.status);
  });
});
