/**
 * REPORTS — every report type generated on seeded data, then reconciled against the
 * underlying rows, plus the profit dashboard's arithmetic identity.
 *
 * "Reconciled" means an INDEPENDENT count/sum written here from the source tables,
 * not a re-read of the generator's own output. A report that silently drops rows,
 * or emits a labelled column that is always blank, fails here.
 *
 * The profit identity being asserted (DEEP_AUDIT #5, fixed 2026-07-19):
 *     profit = income − (expenses + rent)   and   profit ≡ billing engine margin_amount
 */
const { DATA_GENERATORS } = require('../../../src/services/report-scheduler.service');

/** Each report type + the independent SQL that says how many rows it MUST contain. */
const TYPES = [
  { type: 'employees',      sheet: 'Munkavállalók', sql: `SELECT COUNT(*)::int c FROM employees` },
  { type: 'accommodations', sheet: 'Szálláshelyek', sql: `SELECT COUNT(*)::int c FROM accommodations WHERE is_active = true` },
  { type: 'tickets',        sheet: 'Hibajegyek',    sql: `SELECT COUNT(*)::int c FROM tickets` },
  { type: 'contractors',    sheet: 'Alvállalkozók', sql: `SELECT COUNT(*)::int c FROM contractors` },
  { type: 'occupancy',      sheet: 'Kihasználtság', sql: `SELECT COUNT(*)::int c FROM accommodations WHERE is_active = true` },
  {
    type: 'cost_centers', sheet: 'Havi költségek',
    // the generator emits one "no data" placeholder row when the current month is empty
    sql: `SELECT GREATEST(COUNT(*),1)::int c FROM (
            SELECT 1 FROM accommodation_expenses ae
             WHERE ae.deleted_at IS NULL AND ae.billing_month = to_char(CURRENT_DATE,'YYYY-MM')
             GROUP BY ae.accommodation_id, ae.category) g`,
  },
];

module.exports = {
  area: 'REPORTS',
  title: 'all 6 generators reconciled to source rows · profit identity · capacity columns',

  async setup(ctx) {
    const profit = require('../../../src/services/profit.service');
    const out = {};
    for (const t of TYPES) out[t.type] = await DATA_GENERATORS[t.type]([]);
    const p = (await profit.getByAccommodation({ month: ctx.month })).data;
    return { generated: out, profit: p, profitSvc: profit };
  },

  cases: [
    ...TYPES.map((t, i) => ({
      id: `REP-${String(i + 1).padStart(2, '0')}`,
      name: `report "${t.type}" — row count reconciles with the source table, sheet + columns present`,
      expected: { rows_match_source: true, sheet: t.sheet, has_columns: true, blank_rows: 0 },
      hint: `report-scheduler.service.js → DATA_GENERATORS.${t.type}`,
      run: async (ctx, st) => {
        const g = st.generated[t.type];
        const src = (await ctx.query(t.sql)).rows[0].c;
        const cols = g.records.length ? Object.keys(g.records[0]) : [];
        // a row where EVERY column is empty means the generator emitted a shell
        const blank = g.records.filter((r) => Object.values(r).every((v) => v === '' || v === null || v === undefined)).length;
        return {
          rows_match_source: g.records.length === src, sheet: g.sheetName,
          has_columns: cols.length > 0, blank_rows: blank,
          _rows: g.records.length, _source: src, _columns: cols.length,
        };
      },
    })),
    {
      id: 'REP-07',
      name: 'profit dashboard identity — profit = income − (expenses + rent) on every seeded site',
      expected: { rows_violating_identity: [] },
      hint: 'profit.service.js: rent = cost_amount − operating expenses (DEEP_AUDIT #5)',
      run: async (ctx, st) => {
        const bad = [];
        for (const r of st.profit.by_accommodation) {
          const expect = Math.round((r.income - r.expenses.total - r.rent) * 100) / 100;
          if (Math.abs(expect - r.profit) > 0.01) bad.push(`${r.accommodation_name}: ${r.profit} ≠ ${expect}`);
        }
        return { rows_violating_identity: bad, _sites: st.profit.by_accommodation.length };
      },
    },
    {
      id: 'REP-08',
      name: 'profit ≡ billing engine margin — per accommodation and in total',
      expected: { mismatched_sites: [], summary_matches: true },
      run: async (ctx, st) => {
        const margins = (await ctx.query(
          `SELECT ab.accommodation_id, SUM(ab.margin_amount)::numeric AS margin
             FROM accommodation_billings ab JOIN billing_runs br ON br.id = ab.billing_run_id
            WHERE ab.billing_month=$1 AND ab.status <> 'cancelled' AND br.status <> 'cancelled' AND br.run_type='incoming'
            GROUP BY ab.accommodation_id`, [ctx.month])).rows;
        const byAcc = new Map(st.profit.by_accommodation.map((r) => [r.accommodation_id, r]));
        const bad = [];
        let total = 0;
        for (const m of margins) {
          const row = byAcc.get(m.accommodation_id);
          total += Number(m.margin);
          if (!row) { bad.push(`${m.accommodation_id}: missing from the dashboard`); continue; }
          if (Math.abs(Number(m.margin) - row.profit) > 0.01) bad.push(`${row.accommodation_name}: engine ${Number(m.margin)} vs dashboard ${row.profit}`);
        }
        return {
          mismatched_sites: bad,
          summary_matches: Math.abs(st.profit.summary.total_profit - Math.round(total * 100) / 100) < 0.01,
        };
      },
    },
    {
      id: 'REP-09',
      name: 'mixed-client site — dashboard totals reconcile with both invoices',
      expected: { income: 630000, expenses: 100000, rent: 600000, profit: -70000 },
      hint: 'A 180 000 + B 450 000 income; rent 600 000; expense 100 000 → −70 000 = sum of both margins',
      run: async (ctx, st) => {
        const r = st.profit.by_accommodation.find((x) => x.accommodation_id === ctx.ids.acc.mixed);
        return r ? { income: r.income, expenses: r.expenses.total, rent: r.rent, profit: r.profit } : { missing: true };
      },
    },
    {
      id: 'REP-10',
      name: 'capacity columns — committed / lekötetlen / empty bed-nights on the Autoliv block',
      expected: { physical_beds: 100, committed_beds: 60, uncommitted_beds: 40, empty_bed_nights: 180, occupied_bed_nights: 1200 },
      hint: 'lekötetlen = physical − committed: 100 physical beds, 60 contracted to the megbízó',
      run: async (ctx, st) => {
        const r = st.profit.by_accommodation.find((x) => x.accommodation_id === ctx.ids.acc.autoliv);
        return r ? r.capacity : { missing: true };
      },
    },
    {
      id: 'REP-11',
      name: 'compensation appears on the dashboard as a pass-through, never inside profit',
      expected: { compensation_amount: 57000, profit_excludes_compensation: true },
      run: async (ctx, st) => {
        const r = st.profit.by_accommodation.find((x) => x.accommodation_id === ctx.ids.acc.comp);
        return r
          ? { compensation_amount: r.compensation_amount, profit_excludes_compensation: r.profit === 60000 }
          : { missing: true };
      },
    },
    {
      id: 'REP-12',
      name: 'operating-costs totals reconcile with accommodation_expenses rows',
      expected: { matches_source: true },
      run: async (ctx) => {
        const svc = require('../../../src/services/operatingCosts.service');
        const res = await svc.getByAccommodation({ month: ctx.month });
        const rows = res.data?.by_accommodation || res.by_accommodation || [];
        const src = (await ctx.query(
          `SELECT COALESCE(SUM(amount),0)::numeric t FROM accommodation_expenses
            WHERE billing_month=$1 AND deleted_at IS NULL`, [ctx.month])).rows[0].t;
        const reported = rows.reduce((s, r) => s + Number(r.total ?? r.amount ?? r.expenses?.total ?? 0), 0);
        return { matches_source: Math.abs(reported - Number(src)) < 0.01, _reported: reported, _source: Number(src) };
      },
    },

    /* ── documented report defects ── */
    {
      id: 'REP-13',
      name: 'employees report — Email/Telefon come from the EMPLOYEE record, not the login',
      gap: 'DEEP_AUDIT #14 — report-scheduler.service.js:32-33 selects u.email/u.phone; company_email/personal_email are never read',
      expected: { email: 'report.subject@functest.local', phone: '+36 30 000 1234' },
      hint: 'the correct COALESCE(e.company_email, u.email) pattern already exists elsewhere in the codebase',
      run: async (ctx, st) => {
        const row = st.generated.employees.records.find((r) => r['Törzsszám'] === `${ctx.tag}-RPT-1`);
        return row ? { email: row['Email'], phone: row['Telefon'] } : { missing: true };
      },
    },
    {
      id: 'REP-14',
      name: 'cost_centers report honours its configured filters',
      gap: 'DEEP_AUDIT #17 — generateCostSummaryData() takes no filters argument but is called generator(filters)',
      expected: { filter_changed_output: true },
      run: async (ctx) => {
        const unfiltered = await DATA_GENERATORS.cost_centers([]);
        const filtered = await DATA_GENERATORS.cost_centers([{ field: 'category', operator: 'equals', value: '__ft_nonexistent__' }]);
        return {
          filter_changed_output: JSON.stringify(filtered.records) !== JSON.stringify(unfiltered.records),
          _unfiltered_rows: unfiltered.records.length, _filtered_rows: filtered.records.length,
        };
      },
    },
    {
      id: 'REP-15',
      name: 'occupancy report "as of" uses the LOCAL date, not UTC',
      gap: 'DEEP_AUDIT #18 — report-scheduler.service.js:187 uses new Date().toISOString().slice(0,10)',
      expected: { tz_probe_occupied: 1 },
      hint: 'frozen at 2026-06-15 00:30 Europe/Budapest = 2026-06-14 22:30Z; a worker arriving 2026-06-15 is present locally but not under UTC',
      run: async (ctx) => {
        const Real = Date;
        const FIXED = Real.parse(ctx.ids.tzFrozenISO);
        class Frozen extends Real {
          constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
          static now() { return FIXED; }
        }
        global.Date = Frozen;
        let records;
        try { ({ records } = await DATA_GENERATORS.occupancy([])); }
        finally { global.Date = Real; }
        const row = records.find((r) => r['Szálláshely'] === `${ctx.tag} TzProbe`);
        return row ? { tz_probe_occupied: row['Foglalt'] } : { missing: true };
      },
    },
  ],
};
