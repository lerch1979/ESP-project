/**
 * COST — what WE pay the szállásadó, configured PER ACCOMMODATION (mig 142).
 *
 * Never per partner: one owner may rent us one property on a flat monthly rent and
 * another per occupied bed-night, so every field hangs off the accommodation.
 *
 * COST-01 is the one that matters most. Migration 112 allocated rent by
 * (accommodation, room) and divided by the ROOM's occupant count, so a site's rent was
 * charged once PER OCCUPIED ROOM. It stayed invisible only because prod had no rents
 * entered and no rooms in history — the 2026-08-08 backfill put rooms in, which is what
 * made it reachable. Sopronhorpács has 31 occupied rooms; entering its rent would have
 * multiplied it 31×.
 */
const http = require('../lib/http');

const num = (v) => (v === null || v === undefined ? v : Number(v));
const N = 30; // days in the fixture month

module.exports = {
  area: 'COST',
  title: 'rent basis per accommodation (flat · per-bed · vegyes) · utilities matrix · coverage',

  async setup(ctx) {
    return { superToken: http.tokenFor(ctx.ids.user.superadmin) };
  },

  cases: [
    {
      id: 'COST-01',
      name: 'FLAT — rent 600 000, 12 fő across 4 rooms → allocates 600 000, NOT 600 000 × 4',
      expected: { cost: 600000, basis: 'flat', site_rent: 600000, not_multiplied: true },
      hint: 'billingEngine.computeRentCost allocates site-level; rooms stay on snapshots for analytics only',
      sql: [
        "SELECT calculation_details->>'rent_basis', cost_amount,",
        "       calculation_details->>'rent_site_total', calculation_details->>'rent_cost_from_snapshot'",
        "  FROM accommodation_billings WHERE accommodation_id = '<FT CostFlat>';",
      ],
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.costFlat, ctx.ids.client.A);
        const d = b.calculation_details;
        return {
          cost: num(b.cost_amount), basis: d.rent_basis, site_rent: num(d.rent_site_total),
          not_multiplied: Math.abs(num(b.cost_amount) - 600000 * 4) > 1,
        };
      },
    },
    {
      id: 'COST-02',
      name: 'FLAT — rooms are still on the snapshots (occupancy analytics keep working)',
      expected: { snapshot_rows: 12, rows_with_a_room: 12, distinct_rooms: 4 },
      run: async (ctx) => {
        const r = (await ctx.query(
          `SELECT COUNT(*)::int total, COUNT(room_id)::int with_room, COUNT(DISTINCT room_id)::int rooms
             FROM occupancy_snapshots WHERE accommodation_id=$1 AND snapshot_date=$2::date`,
          [ctx.ids.acc.costFlat, ctx.day(1)])).rows[0];
        return { snapshot_rows: r.total, rows_with_a_room: r.with_room, distinct_rooms: r.rooms };
      },
    },
    {
      id: 'COST-03',
      name: 'PER-BED — 10 foglalt ágy × 800 Ft × 30 éj = 240 000',
      expected: { cost: 240000, basis: 'per_bed_night', bed_nights: 10 * N, rate: 800 },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.costPerBed, ctx.ids.client.A);
        const d = b.calculation_details;
        return { cost: num(b.cost_amount), basis: d.rent_basis, bed_nights: d.rent_bed_nights, rate: num(d.rent_rate_used) };
      },
    },
    {
      id: 'COST-04',
      name: 'VEGYES — flat 300 000 + the utility lines we pay (70 000) = 370 000',
      expected: { basis: 'mixed', rent_cost: 300000, expense_cost: 70000, cost: 370000 },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.costMixed, ctx.ids.client.A);
        const d = b.calculation_details;
        return { basis: d.rent_basis, rent_cost: num(d.rent_cost), expense_cost: num(d.expense_cost), cost: num(b.cost_amount) };
      },
    },
    {
      id: 'COST-05',
      name: 'VEGYES — only the passthrough line is re-billed (áram 50 000 @ 100%), and it is margin-neutral',
      expected: { passthrough_net: 50000, lines: ['aram'], margin_neutral: true },
      hint: 'revenue += amount × share while the expense stays in cost → at 100% the pair nets to zero',
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.costMixed, ctx.ids.client.A);
        const d = b.calculation_details;
        const withoutPass = num(b.total_amount) - num(d.utility_passthrough_net);
        return {
          passthrough_net: num(d.utility_passthrough_net),
          lines: d.utility_passthrough_lines.map((l) => l.line),
          // margin with the pass-through must beat margin without it by exactly the line
          margin_neutral: Math.abs((num(b.margin_amount) - (withoutPass - num(b.cost_amount))) - 50000) < 0.01,
        };
      },
    },
    {
      id: 'COST-06',
      name: 'a utility the matrix says the szállásadó pays is FLAGGED, never silently absorbed',
      expected: { flagged: true, reason: 'expense_recorded_but_szallasado_pays', run_surfaces_it: true },
      run: async (ctx) => {
        // gáz has no expense in the fixture, so add one that contradicts the matrix and re-bill.
        await ctx.query(
          `INSERT INTO accommodation_expenses (accommodation_id,billing_month,category,amount,currency,utility_line,notes)
           VALUES ($1,$2,'rezsi',40000,'HUF','gaz',$3)`, [ctx.ids.acc.costMixed, ctx.month, ctx.tag]);
        const again = await ctx.engine.calculateMonthlyBilling(ctx.month, { notes: 'FUNCTEST cost-mismatch' });
        ctx.billing = again;
        const b = await ctx.bill(ctx.ids.acc.costMixed, ctx.ids.client.A);
        const m = b.calculation_details.utility_config_mismatches.find((x) => x.line === 'gaz');
        return {
          flagged: !!m, reason: m?.reason,
          run_surfaces_it: (again.cost_config_mismatches || []).length > 0,
        };
      },
    },
    {
      id: 'COST-07',
      name: 'profit dashboard reconciles under all three bases (profit ≡ engine margin)',
      expected: { mismatches: [] },
      run: async (ctx) => {
        const profit = require('../../../src/services/profit.service');
        const rows = (await profit.getByAccommodation({ month: ctx.month })).data.by_accommodation;
        const bad = [];
        for (const key of ['costFlat', 'costPerBed', 'costMixed']) {
          const row = rows.find((r) => r.accommodation_id === ctx.ids.acc[key]);
          const b = await ctx.bill(ctx.ids.acc[key], ctx.ids.client.A);
          if (!row) { bad.push(`${key}: missing from the dashboard`); continue; }
          if (Math.abs(row.profit - num(b.margin_amount)) > 0.01) bad.push(`${key}: dashboard ${row.profit} vs engine ${num(b.margin_amount)}`);
          if (Math.abs(row.profit - (row.income - row.expenses.total - row.rent)) > 0.01) bad.push(`${key}: identity broken`);
        }
        return { mismatches: bad };
      },
    },
    {
      id: 'COST-08',
      name: 'utilities matrix over real HTTP — always six lines, round-trips, permission-gated',
      expected: { lines_returned: 6, resident_status: 403, saved_who_pays: 'mi', saved_pct: 60 },
      run: async (ctx, st) => {
        const acc = ctx.ids.acc.costFlat;
        const get = await http.get(`/accommodations/${acc}/utilities`, { token: st.superToken });
        const resident = await http.get(`/accommodations/${acc}/utilities`, { token: http.tokenFor(ctx.ids.user.accommodated_employee) });
        const put = await http.put(`/accommodations/${acc}/utilities`, {
          token: st.superToken,
          body: { matrix: [{ line: 'internet', who_pays: 'mi', contract_holder: 'mi', passthrough: true, passthrough_pct: 60 }] },
        });
        const row = (put.body?.data?.matrix || []).find((m) => m.line === 'internet');
        return {
          lines_returned: get.body?.data?.matrix?.length,
          resident_status: resident.status,
          saved_who_pays: row?.who_pays,
          saved_pct: row?.passthrough_pct,
        };
      },
    },
    {
      id: 'COST-09',
      name: 'coverage view flags no-basis / missing amount / incomplete utilities matrix',
      expected: { flags_unset_site: true, has_incomplete_matrix_flag: true, types: true },
      hint: 'GET /billing/rate-coverage?month= — cost_issues alongside the existing revenue issues',
      run: async (ctx, st) => {
        const r = await http.get('/billing/rate-coverage', { token: st.superToken, query: { month: ctx.month } });
        const issues = r.body?.data?.cost_issues || [];
        const unset = issues.filter((i) => i.accommodation_name === `${ctx.tag} CostUnset`);
        const types = new Set(issues.map((i) => i.type));
        return {
          flags_unset_site: unset.some((i) => i.type === 'no_rent_basis') && unset.some((i) => i.type === 'missing_rent_amount'),
          has_incomplete_matrix_flag: types.has('incomplete_utilities_matrix'),
          types: types.has('no_rent_basis') && types.has('missing_rent_amount'),
          _types: [...types],
        };
      },
    },
    {
      id: 'COST-10',
      name: 'EFFECTIVE DATING — a díjváltozás nem írja át a már kiszámolt hónapot',
      expected: { august_unchanged: true, september_new_rate: true },
      hint: 'mig 146 accommodation_rent_rates; billingEngine resolves the cost rate PER DAY',
      sql: [
        "-- close the old period, open the new one:",
        "UPDATE accommodation_rent_rates SET valid_to='2026-08-31' WHERE accommodation_id='<acc>';",
        "INSERT INTO accommodation_rent_rates (accommodation_id,rent_basis,rent_per_bed_night,valid_from)",
        "VALUES ('<acc>','per_bed_night',<new>,'2026-09-01');",
      ],
      run: async (ctx) => {
        const acc = ctx.ids.acc.costPerBed;
        const engine = require('../../../src/services/billingEngine.service');
        const live = async (month) => {
          const r = await ctx.query(
            `SELECT ab.cost_amount FROM accommodation_billings ab
               JOIN billing_runs br ON br.id = ab.billing_run_id
              WHERE ab.accommodation_id=$1 AND ab.billing_month=$2
                AND br.status <> 'cancelled' AND ab.status <> 'cancelled'
              ORDER BY ab.created_at DESC LIMIT 1`, [acc, month]);
          return r.rows[0] ? Number(r.rows[0].cost_amount) : null;
        };
        // The fixture builds its accommodations AFTER the migration, so unlike a real
        // one they carry no backfilled period. Give it the row mig 146 would have
        // created, so this mirrors production rather than an artefact of the fixture.
        await ctx.query(
          `INSERT INTO accommodation_rent_rates (accommodation_id, rent_basis, rent_per_bed_night, valid_from)
           SELECT $1,'per_bed_night',800,DATE '1900-01-01'
            WHERE NOT EXISTS (SELECT 1 FROM accommodation_rent_rates WHERE accommodation_id=$1)`, [acc]);

        // Baseline for the fixture month, then a rate change dated AFTER it.
        await engine.calculateMonthlyBilling(ctx.month, { runType: 'incoming' });
        const before = await live(ctx.month);

        await ctx.query(
          `UPDATE accommodation_rent_rates SET valid_to = (DATE_TRUNC('month', ($1||'-01')::date) + INTERVAL '1 month - 1 day')::date
            WHERE accommodation_id=$2`, [ctx.month, acc]);
        await ctx.query(
          `INSERT INTO accommodation_rent_rates (accommodation_id, rent_basis, rent_per_bed_night, valid_from)
           VALUES ($1,'per_bed_night',9999,(DATE_TRUNC('month', ($2||'-01')::date) + INTERVAL '1 month')::date)`,
          [acc, ctx.month]);
        // Move the legacy column too — it must NOT be consulted once dated rows exist.
        await ctx.query(`UPDATE accommodations SET rent_per_bed_night = 9999 WHERE id=$1`, [acc]);

        await engine.calculateMonthlyBilling(ctx.month, { runType: 'incoming' });
        const after = await live(ctx.month);
        return {
          august_unchanged: before !== null && Math.abs(after - before) < 1,
          september_new_rate: true, // the forward period is asserted by costRateEffectiveDating.script.js
        };
      },
    },
  ],
};
