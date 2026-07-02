/**
 * Authorization for damage reports (audit finding #1).
 *
 * Damage reports carry employee salary + signature PII. Before the fix the
 * router had only authenticateToken — no permission check and no tenant
 * scoping — so ANY logged-in user (residents included) could read/edit/delete/
 * acknowledge ANY contractor's report by id (cross-tenant IDOR).
 *
 * This guards both layers:
 *  1. Permission gate — non-operators (residents) get 403 on every endpoint.
 *  2. Tenant scoping   — an operator of another contractor gets 404 on a
 *                        report they don't own; the owning operator gets 200.
 *
 * Strategy mirrors wellbeingPermissions.test.js: mount the REAL router + REAL
 * permission middleware + REAL controller, mock only auth (inject req.user)
 * and the service/DB layer.
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

// The report under test belongs to contractor 'cB'.
const REPORT = { id: 'rep-1', contractor_id: 'cB', report_number: 'DR-1', status: 'draft' };
jest.mock('../src/services/damageReport.service', () => ({
  getById: jest.fn().mockResolvedValue({ id: 'rep-1', contractor_id: 'cB', report_number: 'DR-1', status: 'draft' }),
  updateReport: jest.fn().mockResolvedValue({ id: 'rep-1' }),
  deleteReport: jest.fn().mockResolvedValue(true),
  acknowledgeReport: jest.fn().mockResolvedValue({ id: 'rep-1' }),
  getPaymentStatus: jest.fn().mockResolvedValue({ paid: 0 }),
  addDamageItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
  removeDamageItem: jest.fn().mockResolvedValue({ ok: true }),
  listReports: jest.fn().mockResolvedValue([]),
  createManual: jest.fn().mockResolvedValue({ id: 'rep-1' }),
  calculatePaymentPlan: jest.fn().mockReturnValue([]),
}));
jest.mock('../src/services/damageReportPdf.service', () => ({ generatePDF: jest.fn().mockResolvedValue(Buffer.from('pdf')) }));
jest.mock('../src/services/translation.service', () => ({
  getUserLanguage: jest.fn().mockResolvedValue('hu'),
  translateObject: jest.fn(async (o) => o),
  translateArray: jest.fn(async (a) => a),
}));
jest.mock('../src/database/connection', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), transaction: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const app = express();
app.use(express.json());
app.use('/damage-reports', require('../src/routes/damageReport.routes'));

// Principals
const resident  = { id: 'res-1', contractorId: 'cB', roles: ['accommodated_employee'], permissions: [] };
const operatorB = { id: 'opB',  contractorId: 'cB', roles: ['data_controller'], permissions: ['settings.edit'] };
const operatorA = { id: 'opA',  contractorId: 'cA', roles: ['data_controller'], permissions: ['settings.edit'] };
const superadmin = { id: 'sa',  contractorId: 'cX', roles: ['superadmin'], permissions: [] };

const call = (method, path, user, body = {}) =>
  request(app)[method](path).set('x-test-user', JSON.stringify(user)).send(body);

// Every endpoint on the router (with a body valid enough to reach the controller).
// Each row is [method, path, body] — always 3 columns so it.each doesn't treat a
// missing arg as a `done` callback.
const ENDPOINTS = [
  ['get',    '/damage-reports', {}],
  ['get',    '/damage-reports/rep-1', {}],
  ['put',    '/damage-reports/rep-1', { description: 'x' }],
  ['delete', '/damage-reports/rep-1', {}],
  ['post',   '/damage-reports/rep-1/damage-items', { name: 'a', cost: 1 }],
  ['delete', '/damage-reports/rep-1/damage-items/item-1', {}],
  ['get',    '/damage-reports/rep-1/pdf', {}],
  ['post',   '/damage-reports/rep-1/acknowledge', { signature_data: 'sig' }],
  ['get',    '/damage-reports/rep-1/payment-status', {}],
  ['post',   '/damage-reports/create-manual', { responsible_employee_id: 'e1', incident_date: '2026-01-01', description: 'x' }],
  ['post',   '/damage-reports/calculate-payment-plan', { total_cost: 100, monthly_salary: 1000 }],
];

// :id endpoints that must enforce tenant scoping.
const SCOPED = [
  ['get',    '/damage-reports/rep-1', {}],
  ['put',    '/damage-reports/rep-1', { description: 'x' }],
  ['delete', '/damage-reports/rep-1', {}],
  ['post',   '/damage-reports/rep-1/acknowledge', { signature_data: 'sig' }],
  ['get',    '/damage-reports/rep-1/payment-status', {}],
];

describe('damage-report authorization', () => {
  describe('permission gate: residents are blocked (403) everywhere', () => {
    it.each(ENDPOINTS)('%s %s -> 403 for resident', async (method, path, body) => {
      const res = await call(method, path, resident, body);
      expect(res.status).toBe(403);
    });
  });

  describe('tenant scoping on :id actions', () => {
    it.each(SCOPED)('%s %s -> 404 for an operator of another contractor', async (method, path, body) => {
      const res = await call(method, path, operatorA, body);
      expect(res.status).toBe(404);
    });

    it.each(SCOPED)('%s %s -> 2xx for the owning contractor operator', async (method, path, body) => {
      const res = await call(method, path, operatorB, body);
      expect(res.status).toBeLessThan(300);
    });

    it.each(SCOPED)('%s %s -> 2xx for superadmin (bypass)', async (method, path, body) => {
      const res = await call(method, path, superadmin, body);
      expect(res.status).toBeLessThan(300);
    });
  });

  it('unauthenticated -> 401', async () => {
    const res = await request(app).get('/damage-reports/rep-1').send();
    expect(res.status).toBe(401);
  });
});
