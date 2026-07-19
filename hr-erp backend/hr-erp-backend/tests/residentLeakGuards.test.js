/**
 * Regression (DEEP_AUDIT findings 1-4): the four resident-reachable data leaks.
 *
 * Before the fix these read routes had only `authenticateToken` (no permission
 * gate, no tenant filter), so a resident JWT could read every tenant's
 * compensations, fines/salary-deductions, invoice-drafts, and (via a
 * client-supplied ?contractorId) any contractor's wellbeing pulse.
 *
 * This asserts, per endpoint:
 *   • a RESIDENT (no permissions) → 403
 *   • a SUPERADMIN → not 403 (staff access preserved)
 *   • the tenant scope passed to the query layer is the SERVER-SIDE contractor id
 *     (never a client-supplied one) for a non-superadmin operator.
 *
 * Strategy mirrors damageReportAuthz.test.js: real router + real permission
 * middleware + real controller; mock only auth (inject req.user), logger, the
 * service/DB layer, and the PDF streamer.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ success: false });
    req.user = JSON.parse(raw);
    next();
  },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

// Services (clean returns) — capture the scope arg so we can assert server-side scoping.
const mockCompSvc = {
  listCompensations: jest.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }),
  getCompensation: jest.fn().mockResolvedValue({ id: 'x', accommodation_id: 'a' }),
  format: jest.fn((x) => x),
};
jest.mock('../src/services/compensation.service', () => mockCompSvc);
const mockFineSvc = {
  listResidentsFor: jest.fn().mockResolvedValue([]),
  listSalaryDeductions: jest.fn().mockResolvedValue([]),
};
jest.mock('../src/services/fine.service', () => mockFineSvc);
jest.mock('../src/services/inspectionPDF.service', () => ({
  generateCompensationNotice: jest.fn().mockResolvedValue({ pipe: (res) => res.end() }),
}));
// invoice-drafts + analytics query the DB directly.
const mockDbQuery = jest.fn(async (sql) =>
  /COUNT\(/i.test(sql) ? { rows: [{ count: '0', total: 0 }] } : { rows: [] });
jest.mock('../src/database/connection', () => ({ query: mockDbQuery, transaction: jest.fn() }));
jest.mock('../src/services/analytics.service', () => ({ getOperationalInsights: jest.fn().mockResolvedValue({}) }));

const app = express();
app.use(express.json());
app.use('/compensations', require('../src/routes/compensation.routes'));
app.use('/fines', require('../src/routes/fine.routes'));
app.use('/invoice-drafts', require('../src/routes/invoiceDraft.routes'));
app.use('/analytics', require('../src/routes/analytics.routes'));

const resident   = { id: 'res-1', contractorId: 'cB', roles: ['accommodated_employee'], permissions: [] };
const superadmin = { id: 'sa-1',  contractorId: 'cA', roles: ['superadmin'], permissions: [] };
const operatorB  = { id: 'op-B',  contractorId: 'cB', roles: ['data_controller'], permissions: ['settings.edit', 'wellbeing.admin.view'] };

const as = (u) => JSON.stringify(u);
const ENDPOINTS = [
  ['get', '/compensations'],
  ['get', '/compensations/comp-1'],
  ['get', '/compensations/comp-1/pdf'],
  ['get', '/fines/compensations/comp-1/residents'],
  ['get', '/fines/salary-deductions'],
  ['get', '/invoice-drafts'],
  ['get', '/invoice-drafts/stats'],
  ['get', '/invoice-drafts/draft-1'],
  ['get', '/analytics/pulse/overview'],
  ['get', '/analytics/pulse/trend'],
  ['get', '/analytics/pulse/alerts'],
  ['get', '/analytics/pulse/housing'],
  ['get', '/analytics/pulse/categories'],
  ['get', '/analytics/pulse/export'],
];

describe('DEEP_AUDIT 1-4 — resident is blocked (403) on every leak endpoint', () => {
  for (const [m, path] of ENDPOINTS) {
    it(`${m.toUpperCase()} ${path} → 403 for a resident`, async () => {
      const res = await request(app)[m](path).set('x-test-user', as(resident));
      expect(res.status).toBe(403);
    });
  }
});

describe('DEEP_AUDIT 1-4 — superadmin still allowed (not 403)', () => {
  for (const [m, path] of ENDPOINTS) {
    it(`${m.toUpperCase()} ${path} → not 403 for superadmin`, async () => {
      const res = await request(app)[m](path).set('x-test-user', as(superadmin));
      expect(res.status).not.toBe(403);
    });
  }
});

describe('DEEP_AUDIT 1-4 — tenant scope is SERVER-SIDE (non-superadmin operator)', () => {
  beforeEach(() => { mockCompSvc.listCompensations.mockClear(); mockFineSvc.listSalaryDeductions.mockClear(); mockDbQuery.mockClear(); });

  it('compensations list scopes by the caller contractor', async () => {
    await request(app).get('/compensations').set('x-test-user', as(operatorB));
    const [, scope] = mockCompSvc.listCompensations.mock.calls[0];
    expect(scope).toEqual({ all: false, contractorId: 'cB' });
  });

  it('salary-deductions scopes by the caller contractor', async () => {
    await request(app).get('/fines/salary-deductions').set('x-test-user', as(operatorB));
    const [, scope] = mockFineSvc.listSalaryDeductions.mock.calls[0];
    expect(scope).toEqual({ all: false, contractorId: 'cB' });
  });

  it('invoice-drafts list SQL carries the caller contractor id, not a client value', async () => {
    await request(app).get('/invoice-drafts?status=pending').set('x-test-user', as(operatorB));
    const listCall = mockDbQuery.mock.calls.find(([sql]) => /FROM invoice_drafts d/.test(sql) && /contractor_id/.test(sql));
    expect(listCall).toBeDefined();
    expect(listCall[1]).toContain('cB');
  });

  it('pulse ignores a client-supplied ?contractorId (uses server-side id) for non-superadmin', async () => {
    await request(app).get('/analytics/pulse/trend?contractorId=cEVIL').set('x-test-user', as(operatorB));
    const call = mockDbQuery.mock.calls.find(([sql]) => /v_pulse_contractor_daily/.test(sql));
    expect(call[1]).toContain('cB');
    expect(call[1]).not.toContain('cEVIL');
  });
});
