/**
 * Permission gating for the GDPR Art-9 health surfaces:
 * WellMind (/wellmind), CarePath (/carepath) and Wellbeing (/wellbeing).
 *
 * Regression guard for the audit fix (migration 129): residents must NOT be
 * able to reach any of these endpoints; authorized staff must; and the admin
 * analytics must ignore a caller-supplied ?contractorId (tenant isolation).
 *
 * Strategy: mount the REAL routers + REAL permission middleware, and mock only
 * (a) authentication — inject req.user from a header — and (b) the service/DB
 * layer, so we exercise the actual route gating, not the controllers' logic.
 */
const express = require('express');
const request = require('supertest');

// --- (a) Auth: inject req.user from the x-test-user header (JSON). ----------
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ success: false });
    req.user = JSON.parse(raw);
    next();
  },
}));

// --- (b) Service/DB layer: stub so passing the gate yields a non-403. -------
const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../src/database/connection', () => ({ query: (...a) => mockQuery(...a), transaction: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

jest.mock('../src/services/wellmind.service', () => new Proxy({}, { get: () => jest.fn().mockResolvedValue({}) }));
jest.mock('../src/services/carepath.service', () => new Proxy({}, { get: () => jest.fn().mockResolvedValue({}) }));
jest.mock('../src/services/wellbeingIntegration.service', () => new Proxy({}, { get: () => jest.fn().mockResolvedValue({}) }));

const app = express();
app.use(express.json());
app.use('/wellmind', require('../src/routes/wellmind.routes'));
app.use('/carepath', require('../src/routes/carepath.routes'));
app.use('/wellbeing', require('../src/routes/wellbeingIntegration.routes'));

// --- Test principals --------------------------------------------------------
const resident   = { id: 'res-1',  contractorId: 'c1', roles: ['accommodated_employee'], permissions: [] };
const staffSelf  = { id: 'usr-1',  contractorId: 'c1', roles: ['user'], permissions: ['wellbeing.self'] };
const admin      = { id: 'adm-1',  contractorId: 'c1', roles: ['admin'], permissions: [
  'wellbeing.self', 'blue_colibri.admin.view', 'blue_colibri.admin.manage', 'blue_colibri.team.view',
  'eap.admin.stats', 'eap.providers.manage', 'wellbeing.admin.view', 'wellbeing.admin.manage',
] };
const superadmin = { id: 'sa-1',   contractorId: 'c1', roles: ['superadmin'], permissions: [] };

const as = (user) => JSON.stringify(user);
const call = (method, path, user) =>
  request(app)[method](path).set('x-test-user', as(user)).send({});

// Endpoint catalogue
const SELF_SERVICE = [
  ['post', '/wellmind/pulse'],
  ['get',  '/wellmind/pulse/today'],
  ['post', '/wellmind/assessment'],
  ['get',  '/wellmind/my-dashboard'],
  ['get',  '/wellmind/interventions'],
  ['get',  '/carepath/categories'],
  ['post', '/carepath/cases'],
  ['get',  '/carepath/my-cases'],
  ['get',  '/carepath/my-bookings'],
  ['get',  '/wellbeing/my-referrals'],
  ['get',  '/wellbeing/notifications'],
];
const ADMIN = [
  ['get', '/wellmind/admin/dashboard'],
  ['get', '/wellmind/admin/risk-employees'],
  ['get', '/carepath/admin/usage-stats'],
  ['get', '/wellbeing/admin/conflicts/stats'],
  ['get', '/wellbeing/admin/predictive'],
];

beforeEach(() => mockQuery.mockClear());

describe('Health endpoints — residents are denied everywhere', () => {
  test.each([...SELF_SERVICE, ...ADMIN])('resident → 403 on %s %s', async (method, path) => {
    const res = await call(method, path, resident);
    expect(res.status).toBe(403);
  });
});

describe('Self-service — requires wellbeing.self', () => {
  test.each(SELF_SERVICE)('staff with wellbeing.self passes the gate on %s %s', async (method, path) => {
    const res = await call(method, path, staffSelf);
    expect(res.status).not.toBe(403); // gate passed (controller may 200/400, never 403)
  });

  test.each(ADMIN)('self-service-only staff is still denied admin endpoint %s %s', async (method, path) => {
    const res = await call(method, path, staffSelf);
    expect(res.status).toBe(403);
  });
});

describe('Admin analytics — requires the health-analytics permission', () => {
  test.each(ADMIN)('admin passes the gate on %s %s', async (method, path) => {
    const res = await call(method, path, admin);
    expect(res.status).not.toBe(403);
  });

  test.each([...SELF_SERVICE, ...ADMIN])('superadmin bypasses on %s %s', async (method, path) => {
    const res = await call(method, path, superadmin);
    expect(res.status).not.toBe(403);
  });
});

describe('Tenant isolation — ?contractorId override is ignored', () => {
  test('conflict stats query uses the token contractor, not the query param', async () => {
    const res = await request(app)
      .get('/wellbeing/admin/conflicts/stats?contractorId=EVIL-CONTRACTOR')
      .set('x-test-user', as(admin));
    expect(res.status).toBe(200);
    // The SQL must have been parameterised with the authenticated user's
    // contractor ('c1'), never the attacker-supplied 'EVIL-CONTRACTOR'.
    const paramsUsed = mockQuery.mock.calls.flatMap(c => c[1] || []);
    expect(paramsUsed).toContain('c1');
    expect(paramsUsed).not.toContain('EVIL-CONTRACTOR');
  });
});
