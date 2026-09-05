/**
 * ROLES — the boundaries each role must not cross.
 *
 * Phase 4 gives everyone a role that shows only what belongs to them. Two of those
 * boundaries cannot be expressed as "which routes may I call", so they get scanning tests
 * rather than status-code assertions:
 *
 *   ROLE-01/02  szállásfelelős must never receive money, on ANY endpoint they can reach.
 *               Written before the fix, and it failed on the accommodation payload —
 *               which is the point: the route is legitimately theirs, the rent in it
 *               is not.
 *
 * The site manager sees ALL accommodations (they cover for each other), so there is no
 * row-scoping to assert here — the boundary is entirely about money.
 */
const http = require('../lib/http');
const { findMoney } = require('../lib/moneyScan');
const { query } = require('../../../src/database/connection');

/** The permission set proposed for szállásfelelős: rooms, people, tickets — no finance. */
const SITE_MANAGER_PERMS = [
  'dashboard.view',
  'accommodations.view', 'accommodations.edit', 'accommodations.create',
  'employees.view', 'employees.edit',
  'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.change_status',
  'documents.view', 'tasks.view',
];

module.exports = {
  area: 'ROLES',
  title: 'szerepkör-határok · a szállásfelelős SEMMILYEN végponton nem kap pénzügyi adatot',

  async setup(ctx) {
    // A real role with a real user, built the way production would build it.
    const role = (await query(
      `INSERT INTO roles (slug, name) VALUES ('ft_szallasfelelos','FT Szállásfelelős')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`)).rows[0].id;
    await query('DELETE FROM role_permissions WHERE role_id = $1', [role]);
    await query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE slug = ANY($2)`, [role, SITE_MANAGER_PERMS]);

    const u = (await query(
      `INSERT INTO users (first_name, last_name, email, password_hash, contractor_id)
       VALUES ('FT','Szállásfelelős','ft-site-manager@functest.local','x',$1)
       ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
       RETURNING id`, [ctx.ids.client.T1])).rows[0].id;
    await query('DELETE FROM user_roles WHERE user_id = $1', [u]);
    await query('INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1,$2,$3)',
      [u, role, ctx.ids.client.T1]);

    return {
      t: http.tokenFor(u), userId: u, roleId: role,
      admin: http.tokenFor(ctx.ids.user.superadmin),
      acc: ctx.ids.acc.pp, emp: ctx.ids.emp.pp?.[0], perms: SITE_MANAGER_PERMS,
    };
  },

  cases: [
    {
      id: 'ROLE-01',
      name: 'a szállásfelelős szálláshely-végpontjai NEM tartalmaznak bérleti díjat vagy költséget',
      expected: { list_leaks: 0, detail_leaks: 0, rooms_leaks: 0 },
      hint: 'accommodations.view is a permission they MUST hold; monthly_rent rides along in the same payload',
      run: async (ctx, s) => {
        const list = await http.get('/accommodations', { token: s.t });
        const detail = await http.get(`/accommodations/${s.acc}`, { token: s.t });
        const rooms = await http.get(`/accommodations/${s.acc}/rooms`, { token: s.t });
        const l1 = findMoney(list.body), l2 = findMoney(detail.body), l3 = findMoney(rooms.body);
        return {
          list_leaks: l1.length, detail_leaks: l2.length, rooms_leaks: l3.length,
          _found: [...l1, ...l2, ...l3].slice(0, 6).map((x) => `${x.key}=${x.value}`),
        };
      },
    },
    {
      id: 'ROLE-02',
      name: 'a szállásfelelős a munkavállaló- és hibajegy-végpontokon sem kap pénzt',
      expected: { employee_leaks: 0, ticket_leaks: 0 },
      hint: 'employees carry salary/compensation refs; tickets carry fines and damage amounts',
      run: async (ctx, s) => {
        const emps = await http.get('/employees?limit=20', { token: s.t });
        const tickets = await http.get('/tickets', { token: s.t });
        const le = findMoney(emps.body), lt = findMoney(tickets.body);
        return {
          employee_leaks: le.length, ticket_leaks: lt.length,
          _found: [...le, ...lt].slice(0, 6).map((x) => `${x.path}=${x.value}`),
        };
      },
    },
    {
      id: 'ROLE-03',
      name: 'a pénzügyi felületek 403-mal zárulnak — nem elrejtett menüpontok',
      expected: { billing: 403, profit: 403, salary: 403, expenses: 403, settlement: 403, rates: 403, operating: 403 },
      hint: 'the whole point of splitting finance.* out of settings.*',
      run: async (ctx, s) => {
        // Real mount paths, taken from server.js + each router — a 404 would pass a
        // "not 200" assertion while proving nothing about the gate.
        const paths = {
          billing: '/billing/rate-coverage',
          profit: '/profit/by-accommodation',
          salary: '/salary/stats',
          expenses: '/expenses',
          settlement: '/settlements/partners',
          rates: '/billing/rates',
          operating: '/operating-costs/by-accommodation',
        };
        const out = {};
        for (const [k, p] of Object.entries(paths)) out[k] = (await http.get(p, { token: s.t })).status;
        return out;
      },
    },
    {
      id: 'ROLE-04',
      name: 'a szállásfelelős NEM hozhat létre és nem módosíthat felhasználót',
      expected: { list: 403, create: 403, roles: 403 },
      hint: 'provisioning is superadmin + admin only; nobody self-registers a client or a site manager',
      run: async (ctx, s) => {
        const list = await http.get('/users', { token: s.t });
        const create = await http.post('/users', { token: s.t, body: {
          email: 'nope@functest.local', first_name: 'N', last_name: 'O', password: 'x' } });
        const roles = await http.get('/permissions/roles', { token: s.t });
        return { list: list.status, create: create.status, roles: roles.status };
      },
    },
  ],
};
