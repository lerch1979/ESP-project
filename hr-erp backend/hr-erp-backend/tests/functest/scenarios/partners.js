/**
 * PARTNERS — contacts, contracts and leases over the REAL HTTP surface (mig 144).
 *
 * The point of this area is the contract LIFECYCLE, and the sharpest case is PART-06:
 * a lease's NOTICE DEADLINE, not its expiry, is what determines whether we can still
 * get out of a site. A contract expiring in 100 days with a 90-day notice period has
 * 10 days of decision left, and a board sorted by expiry date would show it as
 * comfortably far away.
 *
 * PART-08 pins the reason a lease is a partner_contracts row rather than columns on
 * `accommodations`: one szállásadó rents us several properties on different terms.
 */
const http = require('../lib/http');

const ymd = (d) => {
  if (!d) return null;
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const plusDays = (n) => ymd(new Date(Date.now() + n * 864e5));

module.exports = {
  area: 'PARTNERS',
  title: 'kapcsolattartók · szerződések minden partnertípusra · bérlet · felmondási határidő',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    // A landlord with TWO properties on different terms.
    const landlord = ctx.ids.client.LANDLORD;
    const accs = (await ctx.query(
      `SELECT id, name FROM accommodations ORDER BY name LIMIT 2`)).rows;
    return { t, landlord, accA: accs[0].id, accB: accs[1].id, client: ctx.ids.client.A };
  },

  cases: [
    {
      id: 'PART-01',
      name: 'több kapcsolattartó rögzíthető egy partnerhez',
      expected: { count: 2, statuses: [201, 201] },
      hint: 'POST /partners/contacts with contractor_id',
      run: async (ctx, s) => {
        const a = await http.post('/partners/contacts', { token: s.t, body: { contractor_id: s.landlord, name: 'FT Kiss Anna', role_title: 'ügyvezető', is_primary: true } });
        const b = await http.post('/partners/contacts', { token: s.t, body: { contractor_id: s.landlord, name: 'FT Nagy Béla', role_title: 'gondnok' } });
        const list = await http.get('/partners/contacts', { token: s.t, query: { contractor_id: s.landlord } });
        return { count: (list.body.data || []).length, statuses: [a.status, b.status] };
      },
    },
    {
      id: 'PART-02',
      name: 'pontosan EGY elsődleges kapcsolattartó — az előléptetés lefokozza a korábbit',
      expected: { primaries: 1, promoted_is_primary: true },
      hint: 'partial unique index uq_partner_contacts_primary_contractor + same-transaction demotion',
      run: async (ctx, s) => {
        const list = await http.get('/partners/contacts', { token: s.t, query: { contractor_id: s.landlord } });
        const bela = (list.body.data || []).find((c) => c.name === 'FT Nagy Béla');
        await http.put(`/partners/contacts/${bela.id}`, { token: s.t, body: { contractor_id: s.landlord, name: 'FT Nagy Béla', is_primary: true } });
        const after = await http.get('/partners/contacts', { token: s.t, query: { contractor_id: s.landlord } });
        const prim = (after.body.data || []).filter((c) => c.is_primary);
        return { primaries: prim.length, promoted_is_primary: prim[0]?.name === 'FT Nagy Béla' };
      },
    },
    {
      id: 'PART-03',
      name: 'a kapcsolattartó pontosan egy félhez tartozhat (partner VAGY ingatlan)',
      expected: { status: 400 },
      hint: 'partner_contacts_party_chk + resolveParty',
      run: async (ctx, s) => {
        const r = await http.post('/partners/contacts', { token: s.t, body: { contractor_id: s.landlord, accommodation_id: s.accA, name: 'FT Kettős' } });
        return { status: r.status };
      },
    },
    {
      id: 'PART-04',
      name: 'szerződés mind a három partnertípusra rögzíthető',
      expected: { roles: ['alvallalkozo', 'megbizo', 'szallasado'] },
      hint: 'partner_contracts.contract_role megbizo|szallasado|alvallalkozo',
      run: async (ctx, s) => {
        await http.post('/partners/contracts', { token: s.t, body: { contractor_id: s.client, contract_role: 'megbizo', title: 'FT Keret', status: 'active', end_date: plusDays(400), notice_days: 60 } });
        await http.post('/partners/contracts', { token: s.t, body: { contractor_id: s.client, contract_role: 'alvallalkozo', title: 'FT Alváll', status: 'active', is_open_ended: true } });
        await http.post('/partners/contracts', { token: s.t, body: { contractor_id: s.landlord, accommodation_id: s.accA, contract_role: 'szallasado', title: 'FT Bérlet A', status: 'active', end_date: plusDays(100), notice_days: 90 } });
        const r = await ctx.query(`SELECT DISTINCT contract_role FROM partner_contracts WHERE title LIKE 'FT %' ORDER BY 1`);
        return { roles: r.rows.map((x) => x.contract_role) };
      },
    },
    {
      id: 'PART-05',
      name: 'ingatlanhoz kötött szerződés CSAK szállásadó lehet',
      expected: { status: 400 },
      hint: 'partner_contracts_lease_role_chk — a lease is by definition a landlord contract',
      run: async (ctx, s) => {
        const r = await http.post('/partners/contracts', { token: s.t, body: { contractor_id: s.client, accommodation_id: s.accA, contract_role: 'megbizo', title: 'FT Rossz bérlet' } });
        return { status: r.status };
      },
    },
    {
      id: 'PART-06',
      name: 'a felmondási határidő SZÁRMAZTATOTT és előbbre való, mint a lejárat',
      expected: { notice_in_days: 10, expiry_in_days: 100, next_action_kind: 'notice' },
      hint: 'notice_deadline GENERATED (end_date - notice_days); board sorts on LEAST(notice, expiry)',
      run: async (ctx, s) => {
        const list = await http.get('/partners/contracts', { token: s.t, query: { leases_only: 'true' } });
        const lease = (list.body.data?.contracts || []).find((c) => c.title === 'FT Bérlet A');
        const days = (d) => Math.round((new Date(ymd(d)) - new Date(ymd(new Date()))) / 864e5);
        return {
          notice_in_days: days(lease.notice_deadline),
          expiry_in_days: days(lease.end_date),
          next_action_kind: lease.next_action_kind,
        };
      },
    },
    {
      id: 'PART-07',
      name: 'a Szerződések tábla a legközelebbi TEENDŐ szerint rendez (felmondás a lejárat előtt)',
      expected: { first_is_lease: true },
      hint: 'ORDER BY next_action_date — a 100-day expiry with 90-day notice outranks a 400-day expiry',
      run: async (ctx, s) => {
        const list = await http.get('/partners/contracts', { token: s.t, query: {} });
        const ours = (list.body.data?.contracts || []).filter((c) => (c.title || '').startsWith('FT '));
        return { first_is_lease: ours[0]?.title === 'FT Bérlet A' };
      },
    },
    {
      id: 'PART-08',
      name: 'egy szállásadó több ingatlant is bérbe adhat ELTÉRŐ feltételekkel',
      expected: { leases: 2, distinct_notice_deadlines: true },
      hint: 'the reason a lease is NOT columns on accommodations (2026-08-08 cost decision, same logic)',
      run: async (ctx, s) => {
        await http.post('/partners/contracts', { token: s.t, body: { contractor_id: s.landlord, accommodation_id: s.accB, contract_role: 'szallasado', title: 'FT Bérlet B', status: 'active', end_date: plusDays(700), notice_days: 30 } });
        const r = await ctx.query(
          `SELECT notice_deadline FROM partner_contracts WHERE contractor_id = $1 AND accommodation_id IS NOT NULL`, [s.landlord]);
        const set = new Set(r.rows.map((x) => ymd(x.notice_deadline)));
        return { leases: r.rows.length, distinct_notice_deadlines: set.size === r.rows.length };
      },
    },
    {
      id: 'PART-09',
      name: 'dokumentum csatolható partnerhez ÉS ingatlanhoz',
      expected: { on_partner: 1, on_accommodation: 1 },
      hint: 'documents.contractor_id / .accommodation_id (mig 144) — closes the PROJECT_STATE:267 gap',
      run: async (ctx, s) => {
        await ctx.query(`INSERT INTO documents (title,file_path,file_name,contractor_id) VALUES ('FT Partner doc','/tmp/a','a.pdf',$1)`, [s.landlord]);
        await ctx.query(`INSERT INTO documents (title,file_path,file_name,accommodation_id) VALUES ('FT Ingatlan doc','/tmp/b','b.pdf',$1)`, [s.accA]);
        const a = await ctx.query(`SELECT count(*)::int n FROM documents WHERE contractor_id=$1`, [s.landlord]);
        const b = await ctx.query(`SELECT count(*)::int n FROM documents WHERE accommodation_id=$1`, [s.accA]);
        return { on_partner: a.rows[0].n, on_accommodation: b.rows[0].n };
      },
    },
    {
      id: 'PART-10',
      name: 'a lejárat-figyelő KÜLÖN riaszt a felmondási határidőre és a lejáratra',
      expected: { notice_alert: true, names_the_contract: true, links_to_contract: true },
      hint: 'expiryMonitor gatherItems: two partner_contract branches; field=notice has its own dedup cycle',
      run: async (ctx, s) => {
        await ctx.query(`DELETE FROM expiry_alert_log WHERE entity_type='partner_contract'`);
        const svc = require('../../../src/services/expiryMonitor.service');
        await svc.runDaily({ force: true });
        const log = await ctx.query(`SELECT field FROM expiry_alert_log WHERE entity_type='partner_contract'`);
        const n = await ctx.query(
          `SELECT title, link FROM notifications WHERE type='expiry_alert' AND title LIKE '%Felmondási%' ORDER BY created_at DESC LIMIT 1`);
        return {
          notice_alert: log.rows.some((r) => r.field === 'notice'),
          names_the_contract: /FT Bérlet/.test(n.rows[0]?.title || ''),
          links_to_contract: (n.rows[0]?.link || '').startsWith('/partners/contracts'),
        };
      },
    },
    {
      id: 'PART-11',
      name: 'a lejárat-figyelő nem riaszt kétszer ugyanarra a küszöbre',
      expected: { duplicated: false },
      hint: 'expiry_alert_log UNIQUE (entity_type, entity_id, field, expiry_date, threshold_days)',
      run: async (ctx) => {
        const before = (await ctx.query(`SELECT count(*)::int n FROM expiry_alert_log WHERE entity_type='partner_contract'`)).rows[0].n;
        const svc = require('../../../src/services/expiryMonitor.service');
        await svc.runDaily({ force: true });
        const after = (await ctx.query(`SELECT count(*)::int n FROM expiry_alert_log WHERE entity_type='partner_contract'`)).rows[0].n;
        return { duplicated: before !== after };
      },
    },
    {
      id: 'PART-13',
      name: 'aktivitás rögzíthető (jegyzet / hívás / találkozó) és a kapcsolattartóhoz köthető',
      expected: { status: 201, kind: 'call', has_contact: true },
      hint: 'POST /partners/activities (mig 145)',
      run: async (ctx, s) => {
        const list = await http.get('/partners/contacts', { token: s.t, query: { contractor_id: s.landlord } });
        const contactId = (list.body.data || [])[0]?.id;
        const r = await http.post('/partners/activities', { token: s.t, body: {
          contractor_id: s.landlord, kind: 'call', subject: 'FT Egyeztetés', body: 'Telefonon egyeztettünk.', contact_id: contactId,
        } });
        return { status: r.status, kind: r.body.data?.kind, has_contact: !!r.body.data?.contact_id };
      },
    },
    {
      id: 'PART-14',
      name: 'az utánkövetés VALÓDI feladatot hoz létre a Teendők között (nincs külön emlékeztető-motor)',
      expected: { task_exists: true, related_contractor_matches: true, status: 'todo', tagged: true },
      hint: 'partner_activities.follow_up_task_id -> tasks; tasks.related_contractor_id (mig 145)',
      run: async (ctx, s) => {
        const due = new Date(Date.now() + 3 * 864e5).toISOString();
        const r = await http.post('/partners/activities', { token: s.t, body: {
          contractor_id: s.landlord, kind: 'meeting', subject: 'FT Bejárás',
          follow_up_at: due, follow_up_priority: 'high',
        } });
        const taskId = r.body.data?.follow_up_task_id;
        const t = await ctx.query('SELECT status, related_contractor_id, tags FROM tasks WHERE id = $1', [taskId]);
        const row = t.rows[0] || {};
        return {
          task_exists: !!row.status,
          related_contractor_matches: row.related_contractor_id === s.landlord,
          status: row.status,
          tagged: Array.isArray(row.tags) && row.tags.includes('partner-utankovetes'),
        };
      },
    },
    {
      id: 'PART-15',
      name: 'a feladat lezárása látszik az aktivitás-idővonalon, és kiesik a nyitott utánkövetésekből',
      expected: { open_before: true, status_after: 'done', open_after: false },
      hint: 'listActivities joins tasks for live status; /partners/follow-ups filters status <> done',
      run: async (ctx, s) => {
        const before = await http.get('/partners/follow-ups', { token: s.t, query: {} });
        const openBefore = (before.body.data || []).some((x) => x.contractor_name);
        const t = await ctx.query(
          `SELECT id FROM tasks WHERE related_contractor_id = $1 AND tags @> ARRAY['partner-utankovetes'] LIMIT 1`, [s.landlord]);
        await ctx.query(`UPDATE tasks SET status='done' WHERE id=$1`, [t.rows[0].id]);
        const acts = await http.get('/partners/activities', { token: s.t, query: { contractor_id: s.landlord } });
        const withFu = (acts.body.data || []).find((a) => a.follow_up_task_id === t.rows[0].id);
        const after = await http.get('/partners/follow-ups', { token: s.t, query: {} });
        const openAfter = (after.body.data || []).some((x) => x.follow_up_task_id === t.rows[0].id);
        return { open_before: openBefore, status_after: withFu?.follow_up_status, open_after: openAfter };
      },
    },
    {
      id: 'PART-12',
      name: 'a partner törzsadat (adószám, cégjegyzékszám, bankszámla) rögzíthető',
      expected: { has_columns: true },
      hint: 'contractors.tax_number/company_reg_number/bank_account (mig 144) — supersedes owner_billing_info',
      run: async (ctx, s) => {
        await ctx.query(
          `UPDATE contractors SET tax_number='12345678-2-41', company_reg_number='01-09-999999', bank_account='11111111-22222222' WHERE id=$1`, [s.landlord]);
        const r = await ctx.query(`SELECT tax_number, company_reg_number, bank_account FROM contractors WHERE id=$1`, [s.landlord]);
        const row = r.rows[0];
        return { has_columns: !!(row.tax_number && row.company_reg_number && row.bank_account) };
      },
    },
    {
      id: 'PART-16',
      name: 'ROLLING NOTICE — a határozatlan idejű szerződés is cselekvésre késztet (legkorábbi kilépés)',
      expected: { kind: 'rolling', exit_in_days: 60, in_90d_horizon: true, in_30d_horizon: false },
      hint: 'earliest_exit_date = CURRENT_DATE + notice_days; next_action_kind = rolling',
      run: async (ctx, s) => {
        await http.post('/partners/contracts', { token: s.t, body: {
          contractor_id: s.landlord, contract_role: 'szallasado',
          title: 'FT Határozatlan', status: 'active', is_open_ended: true, notice_days: 60,
        } });
        const all = await http.get('/partners/contracts', { token: s.t, query: {} });
        const row = (all.body.data?.contracts || []).find((c) => c.title === 'FT Határozatlan');
        const days = Math.round((new Date(ymd(row.earliest_exit_date)) - new Date(ymd(new Date()))) / 864e5);
        const h90 = await http.get('/partners/contracts', { token: s.t, query: { within_days: '90' } });
        const h30 = await http.get('/partners/contracts', { token: s.t, query: { within_days: '30' } });
        const inH = (r) => (r.body.data?.contracts || []).some((c) => c.title === 'FT Határozatlan');
        return {
          kind: row.next_action_kind,
          exit_in_days: days,
          in_90d_horizon: inH(h90),
          in_30d_horizon: inH(h30),
        };
      },
    },
  ],
};
