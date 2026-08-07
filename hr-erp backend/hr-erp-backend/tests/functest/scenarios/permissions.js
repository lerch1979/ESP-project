/**
 * PERMISSIONS / DATA ISOLATION — over the REAL HTTP surface with REAL logins.
 *
 * Every request here goes through the actual express app against the sandbox DB with a
 * genuine signed JWT, so `authenticateToken` performs its real user lookup, the real
 * role→permission SQL runs, and each controller executes its real query. Nothing is
 * mocked (the existing `residentLeakGuards.test.js` mocks auth + DB + services — that
 * proves the middleware is wired, not that a real login is refused).
 *
 * The role matrix is not a hand-copied allow-list: for each endpoint we take the
 * permission its ROUTE declares, ask the DATABASE whether that role holds it, and check
 * the HTTP response agrees. Three independent sources have to line up, so the test fails
 * if a route's gate is changed without the permission model, or vice versa.
 *
 * 403 = denied. Anything else (200/400/404/500) = the gate let the caller through.
 */
const http = require('../lib/http');

const ROLES = ['superadmin', 'admin', 'data_controller', 'property_owner', 'contractor',
               'property_inspector', 'maintenance_worker', 'task_owner', 'accommodated_employee'];

/** endpoint → the permission its route file declares (src/routes/*.routes.js). */
const GATED = [
  { p: '/employees', perm: 'employees.view' },
  { p: '/accommodations', perm: 'accommodations.view' },
  { p: '/tickets', perm: 'tickets.view' },
  { p: '/documents', perm: 'documents.view' },
  { p: '/expenses', perm: 'settings.view' },
  { p: '/invoices', perm: 'settings.view' },
  { p: '/salary/stats', perm: 'settings.view' },
  { p: '/profit/by-accommodation', perm: 'settings.view', q: { month: '1903-06' } },
  { p: '/operating-costs/by-accommodation', perm: 'settings.view', q: { month: '1903-06' } },
  { p: '/compensations', perm: 'settings.edit' },
  { p: '/fines/salary-deductions', perm: 'settings.edit' },
  { p: '/invoice-drafts', perm: 'settings.edit' },
  { p: '/reports/filter-options', perm: 'reports.view' },
  { p: '/consolidation/runs', perm: 'employees.view' },
  { p: '/analytics/pulse/overview', perm: 'wellbeing.admin.view' },
  { p: '/scheduled-reports', perm: 'reports.schedule' },
];

/** DEEP_AUDIT rows 1–4: the endpoints an ordinary resident login could read. */
const LEAKS = [
  '/compensations', '/fines/salary-deductions', '/invoice-drafts', '/invoice-drafts/stats',
  '/analytics/pulse/overview', '/analytics/pulse/trend', '/analytics/pulse/alerts',
  '/analytics/pulse/housing', '/analytics/pulse/categories', '/analytics/pulse/export',
];

module.exports = {
  area: 'PERMISSIONS',
  title: 'per-role CAN/CANNOT · resident leak guards · cross-tenant isolation',

  async setup(ctx) {
    // Real permission grants, straight from the DB — the expectation source.
    const rows = (await ctx.query(
      `SELECT r.slug AS role, p.slug AS perm
         FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id`)).rows;
    const held = new Map(ROLES.map((r) => [r, new Set()]));
    for (const row of rows) if (held.has(row.role)) held.get(row.role).add(row.perm);

    const token = {};
    for (const r of ROLES) token[r] = http.tokenFor(ctx.ids.user[r]);
    token.t2_operator = http.tokenFor(ctx.ids.user.t2_operator);
    return { held, token };
  },

  cases: [
    {
      id: 'PERM-01',
      name: 'DEEP_AUDIT 1–4 — a real resident login is 403 on every leak endpoint',
      expected: { not_403: [] },
      hint: 'compensations / fines / invoice-drafts / analytics pulse — see docs/DEEP_AUDIT_2026-07.md rows 1-4',
      run: async (ctx, st) => {
        const bad = [];
        for (const p of LEAKS) {
          const r = await http.get(p, { token: st.token.accommodated_employee });
          if (r.status !== 403) bad.push(`${p} → ${r.status}`);
        }
        return { not_403: bad };
      },
    },
    {
      id: 'PERM-02',
      name: 'the same endpoints stay OPEN to a superadmin (the fix did not over-block)',
      expected: { wrongly_403: [] },
      run: async (ctx, st) => {
        const bad = [];
        for (const p of LEAKS) {
          const r = await http.get(p, { token: st.token.superadmin });
          if (r.status === 403) bad.push(p);
        }
        return { wrongly_403: bad };
      },
    },
    {
      id: 'PERM-03',
      name: 'a resident holds NO staff permission at all → 403 on every gated staff endpoint',
      expected: { reachable: [] },
      run: async (ctx, st) => {
        const reachable = [];
        for (const e of GATED) {
          const r = await http.get(e.p, { token: st.token.accommodated_employee, query: e.q });
          if (r.status !== 403) reachable.push(`${e.p} → ${r.status}`);
        }
        return { reachable };
      },
    },
    ...ROLES.map((role) => ({
      id: `PERM-${String(4 + ROLES.indexOf(role)).padStart(2, '0')}`,
      name: `role "${role}" — HTTP access matches the permission model exactly`,
      expected: { mismatches: [] },
      hint: 'route-declared permission vs role_permissions vs actual HTTP status — all three must agree',
      run: async (ctx, st) => {
        const mismatches = [];
        for (const e of GATED) {
          const shouldPass = role === 'superadmin' || st.held.get(role).has(e.perm);
          const r = await http.get(e.p, { token: st.token[role], query: e.q });
          const didPass = r.status !== 403;
          if (didPass !== shouldPass) {
            mismatches.push(`${e.p} (${e.perm}): model says ${shouldPass ? 'ALLOW' : 'DENY'}, http said ${r.status}`);
          }
        }
        return { mismatches };
      },
    })),

    /* ── cross-tenant isolation ── */
    {
      id: 'PERM-13',
      name: 'cross-tenant WRITE — tenant-1 operator cannot mutate a tenant-2 employee',
      expected: { row_changed: false, status: 403 },
      hint: 'updateEmployee now refuses a foreign contractor_id before building the UPDATE (superadmin bypasses; NULL-owned rows stay writable)',
      run: async (ctx, st) => {
        const probe = 'FUNCTEST-CROSSTENANT-PROBE';
        const before = (await ctx.query(`SELECT notes FROM employees WHERE id=$1`, [ctx.ids.emp.t2])).rows[0].notes;
        const r = await http.put(`/employees/${ctx.ids.emp.t2}`, { token: st.token.data_controller, body: { notes: probe } });
        const after = (await ctx.query(`SELECT notes FROM employees WHERE id=$1`, [ctx.ids.emp.t2])).rows[0].notes;
        if (after === probe) await ctx.query(`UPDATE employees SET notes=$2 WHERE id=$1`, [ctx.ids.emp.t2, before]);
        return { row_changed: after === probe, status: r.status };
      },
    },
    {
      id: 'PERM-14',
      name: 'cross-tenant READ — tenant-1 operator listing employees sees no tenant-2 rows',
      gap: 'DEEP_AUDIT #6 — employee.controller.js has no contractor_id filter in list or detail',
      expected: { foreign_ids_returned: 0 },
      hint: 'to close: scope getEmployees/getEmployeeById by req.user.contractorId (superadmin bypass)',
      sql: ["SELECT id, contractor_id FROM employees WHERE last_name='FT' AND employee_number IS NULL LIMIT 5;"],
      run: async (ctx, st) => {
        const r = await http.get('/employees', { token: st.token.data_controller, query: { limit: 500 } });
        const foreign = (await ctx.query(`SELECT id FROM employees WHERE contractor_id=$1`, [ctx.ids.client.T2])).rows.map((x) => x.id);
        return { foreign_ids_returned: http.leaks(r.body, foreign).length, _status: r.status };
      },
    },
    {
      id: 'PERM-15',
      name: 'cross-tenant READ — finance endpoints scope to the caller\'s contractor',
      gap: 'DEEP_AUDIT #7 — expenses / operating-costs / profit reads have no owner filter (accommodation_id is OPTIONAL, so omitting it returns every tenant)',
      expected: { endpoints_returning_foreign_data: [] },
      hint: 'probed with a REAL tenant-2 expense (777 000 Ft on FT TenantTwoSite, month 1903-07) — a scoped endpoint cannot return it',
      sql: ["SELECT a.name, ae.billing_month, ae.amount FROM accommodation_expenses ae JOIN accommodations a ON a.id=ae.accommodation_id WHERE a.name='FT TenantTwoSite';"],
      run: async (ctx, st) => {
        const foreign = [ctx.ids.acc.t2, ctx.ids.expense_t2];
        const bad = [];
        const probes = [
          '/expenses',
          `/profit/by-accommodation?month=${ctx.ids.leakMonth}`,
          `/operating-costs/by-accommodation?month=${ctx.ids.leakMonth}`,
        ];
        for (const p of probes) {
          const r = await http.get(p, { token: st.token.data_controller });
          if (http.leaks(r.body, foreign).length > 0) bad.push(`${p} → ${r.status}`);
        }
        return { endpoints_returning_foreign_data: bad };
      },
    },
    {
      id: 'PERM-16',
      name: 'timesheets — one tenant cannot read another tenant\'s logged hours by task id',
      gap: 'DEEP_AUDIT #8 — timesheet.controller.js getByTask is WHERE ts.task_id = $1 with no tenant check, and returns each logger\'s email',
      expected: { rows_returned: 0, foreign_email_exposed: false },
      hint: 'probed with a REAL tenant-2 task carrying 7.5 logged hours, read by a tenant-1 data_controller (holds timesheets.view_all)',
      run: async (ctx, st) => {
        const r = await http.get(`/timesheets/task/${ctx.ids.task_t2}`, { token: st.token.data_controller });
        const rows = r.body?.data?.timesheets || r.body?.data?.rows || (Array.isArray(r.body?.data) ? r.body.data : []);
        return {
          rows_returned: Array.isArray(rows) ? rows.length : 0,
          foreign_email_exposed: JSON.stringify(r.body || {}).includes('t2-operator@functest.local'),
          _status: r.status,
        };
      },
    },
    {
      id: 'PERM-17',
      name: 'GET /rooms/:id/inspection-history requires a permission',
      gap: 'DEEP_AUDIT #11 — rooms.routes.js:10 has no checkPermission and filters only by room_id',
      expected: { resident_status: 403 },
      run: async (ctx, st) => {
        const r = await http.get(`/rooms/${ctx.ids.room.hyg}/inspection-history`, { token: st.token.accommodated_employee });
        return { resident_status: r.status };
      },
    },
    {
      id: 'PERM-18',
      name: 'GET /analytics/overview requires a permission',
      gap: 'DEEP_AUDIT #12 — analytics.routes.js:13 serves whole-company BI to any authenticated user',
      expected: { resident_status: 403 },
      run: async (ctx, st) => {
        const r = await http.get('/analytics/overview', { token: st.token.accommodated_employee });
        return { resident_status: r.status };
      },
    },
    {
      id: 'PERM-19',
      name: 'worker-specialization WRITES require a permission — a resident cannot create reference data',
      expected: { status: 403, row_created: false },
      hint: 'sent a fully VALID body, so a non-403 means the write actually landed — not a validation bounce',
      run: async (ctx, st) => {
        const { SPECIALIZATIONS } = require('../../../src/services/workerAssignment.service');
        const slug = (SPECIALIZATIONS[0]?.slug) || SPECIALIZATIONS[0];
        const r = await http.post('/worker-specializations', {
          token: st.token.accommodated_employee,
          body: { user_id: ctx.ids.user.t2_operator, specialization: slug, notes: 'FT probe' },
        });
        const created = (await ctx.query(
          `SELECT id FROM worker_specializations WHERE user_id=$1 AND notes='FT probe'`, [ctx.ids.user.t2_operator])).rows;
        for (const row of created) await ctx.query(`DELETE FROM worker_specializations WHERE id=$1`, [row.id]);
        return { status: r.status, row_created: created.length > 0 };
      },
    },
    {
      id: 'PERM-20',
      name: 'GTD metadata writes are gated — a resident cannot rewrite a ticket\'s GTD fields',
      expected: { status: 403, ticket_modified: false },
      hint: 'targets a REAL ticket, so a 200 means the resident actually mutated another tenant\'s row',
      run: async (ctx, st) => {
        const t = (await ctx.query(`SELECT id, gtd_context FROM tickets ORDER BY created_at LIMIT 1`)).rows[0];
        if (!t) return { status: null, ticket_modified: false, error: 'no ticket to probe' };
        const r = await http.patch(`/gtd/tickets/${t.id}/gtd`, {
          token: st.token.accommodated_employee, body: { gtd_context: 'FT-PROBE' } });
        const after = (await ctx.query(`SELECT gtd_context FROM tickets WHERE id=$1`, [t.id])).rows[0];
        if (after.gtd_context === 'FT-PROBE') {
          await ctx.query(`UPDATE tickets SET gtd_context=$2 WHERE id=$1`, [t.id, t.gtd_context]);
        }
        return { status: r.status, ticket_modified: after.gtd_context === 'FT-PROBE' };
      },
    },
    {
      id: 'PERM-21',
      name: 'an unauthenticated caller gets 401 everywhere (no anonymous surface)',
      expected: { non_401: [] },
      run: async () => {
        const bad = [];
        for (const e of GATED) {
          const r = await http.get(e.p, { query: e.q });
          if (r.status !== 401) bad.push(`${e.p} → ${r.status}`);
        }
        return { non_401: bad };
      },
    },
  ],
};
