/**
 * Phase 0 regression — DEEP_AUDIT findings 6 (reads), 7, 8, 11, 12 + the
 * /admin/documents/expiring role-check gap + the module-scope choke point.
 *
 * These findings were all inert only because every staff account is a superadmin.
 * This suite exercises them as a NON-superadmin tenant-scoped caller, which is what
 * an external sales agent (or any limited internal role) will be.
 *
 * Pure Node, real DB, cleans up after itself.
 *   node tests/phase0TenantScope.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');

const employeeCtrl = require('../src/controllers/employee.controller');
const taskCtrl = require('../src/controllers/task.controller');
const timesheetCtrl = require('../src/controllers/timesheet.controller');
const invoiceCtrl = require('../src/controllers/invoice.controller');
const inspectionCtrl = require('../src/controllers/inspection.controller');
const empDocsCtrl = require('../src/controllers/employeeDocuments.controller');
const { checkModuleScope } = require('../src/middleware/moduleScope');

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader() {}, send() {},
  };
}
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

// A tenant-scoped staff caller for contractor X (NOT superadmin) — the shape that makes
// every one of these findings live.
const staffOf = (contractorId) => ({
  user: { id: null, email: 'scoped@test.local', contractorId, roles: ['data_controller'], permissions: [] },
  query: {}, params: {}, body: {},
});

(async () => {
  const stamp = Date.now();
  let A, B, empA, empB, taskA, taskB, invA, invB, roomB, accB, projB, ccA, ccB;

  try {
    // ── two tenants, each with their own data ──────────────────────────────
    A = (await pool.query(
      `INSERT INTO contractors (name, slug, is_active) VALUES ('ZZ Phase0 A', $1, true) RETURNING id`,
      ['zz-p0-a-' + stamp])).rows[0].id;
    B = (await pool.query(
      `INSERT INTO contractors (name, slug, is_active) VALUES ('ZZ Phase0 B', $1, true) RETURNING id`,
      ['zz-p0-b-' + stamp])).rows[0].id;

    empA = (await pool.query(
      `INSERT INTO employees (contractor_id, first_name, last_name, tax_id) VALUES ($1,'AA','TenantA','AAA111') RETURNING id`,
      [A])).rows[0].id;
    empB = (await pool.query(
      `INSERT INTO employees (contractor_id, first_name, last_name, tax_id) VALUES ($1,'BB','TenantB','BBB222') RETURNING id`,
      [B])).rows[0].id;

    accB = (await pool.query(
      `INSERT INTO accommodations (name, type, capacity, status, current_contractor_id)
       VALUES ($1,'studio',4,'available',$2) RETURNING id`, ['ZZ P0 Acc B ' + stamp, B])).rows[0].id;
    roomB = (await pool.query(
      `INSERT INTO accommodation_rooms (accommodation_id, room_number, beds, is_active)
       VALUES ($1,'B-101',4,true) RETURNING id`, [accB])).rows[0].id;

    projB = (await pool.query(
      `INSERT INTO projects (name, contractor_id) VALUES ($1,$2) RETURNING id`,
      ['ZZ P0 Proj B ' + stamp, B])).rows[0].id;
    taskA = (await pool.query(
      `INSERT INTO tasks (title, contractor_id, status) VALUES ('ZZ P0 task A',$1,'todo') RETURNING id`, [A])).rows[0].id;
    taskB = (await pool.query(
      `INSERT INTO tasks (title, contractor_id, status, project_id) VALUES ('ZZ P0 task B',$1,'todo',$2) RETURNING id`,
      [B, projB])).rows[0].id;

    ccA = (await pool.query(
      `INSERT INTO cost_centers (contractor_id, name) VALUES ($1,$2) RETURNING id`,
      [A, 'ZZ P0 CC A ' + stamp])).rows[0].id;
    ccB = (await pool.query(
      `INSERT INTO cost_centers (contractor_id, name) VALUES ($1,$2) RETURNING id`,
      [B, 'ZZ P0 CC B ' + stamp])).rows[0].id;
    invA = (await pool.query(
      `INSERT INTO invoices (contractor_id, invoice_number, vendor_name, amount, invoice_date, cost_center_id)
       VALUES ($1,$2,'V-A',1000,CURRENT_DATE,$3) RETURNING id`,
      [A, 'ZZP0-A-' + stamp, ccA])).rows[0].id;
    invB = (await pool.query(
      `INSERT INTO invoices (contractor_id, invoice_number, vendor_name, amount, invoice_date, cost_center_id)
       VALUES ($1,$2,'V-B',2000,CURRENT_DATE,$3) RETURNING id`,
      [B, 'ZZP0-B-' + stamp, ccB])).rows[0].id;

    await pool.query(
      `INSERT INTO employee_documents (employee_id, document_type, file_name, file_path, document_number, expiry_date)
       VALUES ($1,'passport','b.pdf','/tmp/b.pdf','SECRET-B', CURRENT_DATE + 10)`, [empB]);

    // ── #6 reads — employees list + detail ────────────────────────────────
    {
      const req = staffOf(A); req.query = { limit: 500 };
      const res = mockRes();
      await employeeCtrl.getEmployees(req, res);
      const rows = res.body?.data?.employees || res.body?.data || [];
      const ids = rows.map((r) => r.id);
      check('#6 employees list excludes the other tenant', !ids.includes(empB));
      check('#6 employees list still returns own tenant', ids.includes(empA));
    }
    {
      const req = staffOf(A); req.params = { id: empB };
      const res = mockRes();
      await employeeCtrl.getEmployeeById(req, res);
      check('#6 employee detail of another tenant -> 404', res.statusCode === 404);
    }

    // ── #8 tasks — list by project, detail, and contractor reassignment ───
    {
      const req = staffOf(A); req.params = { projectId: projB }; req.query = {};
      const res = mockRes();
      await taskCtrl.getAll(req, res);
      const rows = res.body?.data?.tasks || res.body?.data || [];
      check("#8 another tenant's project tasks are not listed",
        !rows.map((r) => r.id).includes(taskB));
    }
    {
      const req = staffOf(A); req.params = { id: taskB };
      const res = mockRes();
      await taskCtrl.getById(req, res);
      check('#8 task detail of another tenant -> 404', res.statusCode === 404);
    }
    {
      const req = staffOf(A);
      req.params = { id: taskA };
      req.body = { title: 'moved', contractor_id: B };
      const res = mockRes();
      await taskCtrl.update(req, res);
      const after = (await pool.query('SELECT contractor_id FROM tasks WHERE id=$1', [taskA])).rows[0];
      check('#8 cannot move own task into another tenant -> 403', res.statusCode === 403);
      check('#8 ... and the row is unchanged', after.contractor_id === A);
    }

    // ── #8 timesheets — the sharpest instance ────────────────────────────
    {
      const req = staffOf(A); req.params = { taskId: taskB };
      const res = mockRes();
      await timesheetCtrl.getByTask(req, res);
      check("#8 timesheets for another tenant's task -> 404", res.statusCode === 404);
    }

    // ── #7 invoices — list + detail ──────────────────────────────────────
    {
      const req = staffOf(A); req.query = { limit: 500 };
      const res = mockRes();
      await invoiceCtrl.getAll(req, res);
      const rows = res.body?.data?.invoices || res.body?.data || [];
      const ids = rows.map((r) => r.id);
      check('#7 invoice list excludes the other tenant', !ids.includes(invB));
      check('#7 invoice list still returns own tenant', ids.includes(invA));
    }
    {
      const req = staffOf(A); req.params = { id: invB };
      const res = mockRes();
      await invoiceCtrl.getById(req, res);
      check('#7 invoice detail of another tenant -> 404', res.statusCode === 404);
    }

    // ── #11 room inspection history ──────────────────────────────────────
    {
      const req = staffOf(A); req.params = { id: roomB };
      const res = mockRes();
      await inspectionCtrl.roomHistory(req, res);
      check("#11 another tenant's room inspection history -> 404", res.statusCode === 404);
    }

    // ── /admin/documents/expiring ────────────────────────────────────────
    {
      const req = staffOf(A); req.query = { days: '30' };
      const res = mockRes();
      await empDocsCtrl.expiring(req, res);
      const docs = res.body?.data?.documents || [];
      check('admin expiring-docs excludes the other tenant',
        !docs.some((d) => d.document_number === 'SECRET-B'));
    }

    // ── module-scope choke point (fail-closed allow-list) ────────────────
    {
      const ext = (url) => checkModuleScope({
        user: { email: 'agent@ext.local', roles: ['kulso_ertekesito'] },
        originalUrl: url,
      });
      check('module scope: /sales allowed', ext('/api/v1/sales/leads') === null);
      check('module scope: /auth/me allowed', ext('/api/v1/auth/me') === null);
      check('module scope: /employees denied', ext('/api/v1/employees')?.status === 403);
      check('module scope: /analytics/overview denied', ext('/api/v1/analytics/overview')?.status === 403);
      check('module scope: /profit denied', ext('/api/v1/profit/by-accommodation')?.status === 403);
      check('module scope: unknown NEW route denied by default',
        ext('/api/v1/some-route-added-next-year')?.status === 403);
      check('module scope: query string does not bypass',
        ext('/api/v1/employees?x=/sales')?.status === 403);
      check('module scope: prefix confusion does not bypass',
        ext('/api/v1/salesforce-export')?.status === 403);
      check('module scope: ordinary staff unaffected',
        checkModuleScope({ user: { roles: ['data_controller'] }, originalUrl: '/api/v1/employees' }) === null);
    }
  } catch (err) {
    console.error('SUITE ERROR:', err);
    failures++;
  } finally {
    // cleanup — children first
    const q = (sql, p) => pool.query(sql, p).catch(() => {});
    await q('DELETE FROM employee_documents WHERE employee_id = ANY($1::uuid[])', [[empA, empB].filter(Boolean)]);
    await q('DELETE FROM timesheets WHERE task_id = ANY($1::uuid[])', [[taskA, taskB].filter(Boolean)]);
    await q('DELETE FROM tasks WHERE id = ANY($1::uuid[])', [[taskA, taskB].filter(Boolean)]);
    await q('DELETE FROM projects WHERE id = $1', [projB]);
    await q('DELETE FROM invoices WHERE id = ANY($1::uuid[])', [[invA, invB].filter(Boolean)]);
    await q('DELETE FROM cost_centers WHERE id = ANY($1::uuid[])', [[ccA, ccB].filter(Boolean)]);
    await q('DELETE FROM accommodation_rooms WHERE id = $1', [roomB]);
    await q('DELETE FROM accommodations WHERE id = $1', [accB]);
    await q('DELETE FROM employees WHERE id = ANY($1::uuid[])', [[empA, empB].filter(Boolean)]);
    await q('DELETE FROM contractors WHERE id = ANY($1::uuid[])', [[A, B].filter(Boolean)]);

    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
    await pool.end?.();
    process.exit(failures === 0 ? 0 : 1);
  }
})();
