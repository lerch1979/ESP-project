/**
 * BILLING — every formula path, with numbers you can check on paper.
 *
 * These do NOT re-implement the engine. The fixture seeds occupancy, the runner
 * executes the REAL `calculateMonthlyBilling`, and each case reads the resulting
 * `accommodation_billings` row back out of the database. Month = 1903-06, 30 days,
 * so every per-night figure × 30 is the monthly figure.
 *
 * Cross-checked against the owner's worked examples (cap 100 / 3500 / 1500 / 90%):
 *   95 occupied → 95×3500 + 5×1500 = 340 000/éj
 *   80 occupied → floor lifts to 90 → 90×3500 + 10×1500 = 330 000/éj
 *   92 occupied → 92×3500 + 8×1500 = 334 000/éj
 *   Autoliv, 60 beds @ 90%, 40 occupied → 54×3500 + 6×1500 = 198 000/éj
 */
const N = 30; // days in 1903-06

const num = (v) => (v === null || v === undefined ? v : Number(v));
const money = (b) => ({ net: num(b.total_amount), vat: num(b.vat_amount), gross: num(b.gross_amount) });
const full = (b) => ({ ...money(b), cost: num(b.cost_amount), margin: num(b.margin_amount) });

module.exports = {
  area: 'BILLING',
  title: 'formula paths · VAT · invoicing · legal type · mixed clients · compensation',

  cases: [
    {
      id: 'BILL-01',
      name: 'per_person — 2 fő × 30 éj × 3500 (+ rent 300 000 → margin)',
      expected: { net: 210000, vat: 56700, gross: 266700, cost: 300000, margin: -90000, employee_days: 60 },
      hint: 'billingEngine.service.js → computeGroupRevenue, per_person branch',
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.pp, ctx.ids.client.A);
        return { ...full(b), employee_days: b.total_employee_days };
      },
    },
    {
      id: 'BILL-02',
      name: 'flat — fully covered month bills the whole 300 000 (headcount-independent)',
      expected: { net: 300000, vat: 81000, gross: 381000, basis: 'flat' },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.flatFull, ctx.ids.client.A);
        return { ...money(b), basis: b.calculation_details.billing_basis };
      },
    },
    {
      id: 'BILL-03',
      name: 'flat — prorated 15/30 covered days of 900 000',
      expected: { net: 450000, vat: 121500, gross: 571500, cost: 150000, margin: 300000 },
      hint: 'flat = Σ per covered day of flat_amount/days_in_month; check_out is the first ABSENT day',
      run: async (ctx) => full(await ctx.bill(ctx.ids.acc.flatPro, ctx.ids.client.A)),
    },
    {
      id: 'BILL-04',
      name: 'VAT taxable — 27% gross math on a per_person line',
      expected: { net: 210000, vat: 56700, gross: 266700, vat_exempt: false },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.pp, ctx.ids.client.A);
        return { ...money(b), vat_exempt: b.calculation_details.vat_exempt };
      },
    },
    {
      id: 'BILL-05',
      name: 'VAT áfamentes — 0 VAT, gross = net',
      expected: { net: 105000, vat: 0, gross: 105000, vat_exempt: true },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.exempt, ctx.ids.client.A);
        return { ...money(b), vat_exempt: b.calculation_details.vat_exempt };
      },
    },
    {
      id: 'BILL-06',
      name: 'legal type company → normal invoice, payroll_handoff false',
      expected: { payroll_handoff: false, legal_type: 'company', note: null },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.pp, ctx.ids.client.A);
        return { payroll_handoff: b.payroll_handoff, legal_type: b.calculation_details.legal_type, note: b.calculation_details.payroll_handoff_note };
      },
    },
    {
      id: 'BILL-07',
      name: 'legal type private → payroll_handoff marker, NO payroll calculation anywhere',
      expected: { net: 120000, vat: 32400, payroll_handoff: true, note: /Bérszámfejtendő magánszemély/, deductions_created: 0, payments_created: 0 },
      hint: 'standing rule: we never compute net-to-person or tax — see PROJECT_STATE decisions log',
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.priv, ctx.ids.client.PRIV);
        // The engine must not have produced a single payroll artefact for this run.
        const ded = await ctx.query(
          `SELECT COUNT(*)::int c FROM salary_deductions WHERE created_at > NOW() - INTERVAL '10 minutes'`).catch(() => ({ rows: [{ c: 0 }] }));
        const pay = await ctx.query(
          `SELECT COUNT(*)::int c FROM compensation_payments WHERE created_at > NOW() - INTERVAL '10 minutes'`).catch(() => ({ rows: [{ c: 0 }] }));
        return {
          ...money(b), payroll_handoff: b.payroll_handoff, note: b.calculation_details.payroll_handoff_note,
          deductions_created: ded.rows[0].c, payments_created: pay.rows[0].c,
        };
      },
    },
    {
      id: 'BILL-08',
      name: 'invoicing OFF → client skipped entirely (no billing row at all)',
      expected: { rows_for_that_client: 0, skipped_clients: 1 },
      run: async (ctx) => ({
        rows_for_that_client: (await ctx.bills(ctx.ids.acc.off, ctx.ids.client.OFF)).length,
        skipped_clients: ctx.billing.skipped_clients,
      }),
    },

    /* ── per_bed_night: the owner's worked examples ── */
    {
      id: 'BILL-09',
      name: 'per_bed used+empty — cap 100 / 3500 / 1500 / 90%, 95 foglalt → 340 000/éj',
      expected: { net: 340000 * N, vat: 91800 * N, avg_full_beds: 95, reduced_bed_nights: 5 * N, capacity: 100 },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.bed95, ctx.ids.client.BED);
        const p = b.calculation_details.per_bed;
        return { net: num(b.total_amount), vat: num(b.vat_amount), avg_full_beds: p.avg_full_beds, reduced_bed_nights: p.reduced_bed_nights, capacity: p.capacity };
      },
    },
    {
      id: 'BILL-10',
      name: 'per_bed occupancy FLOOR — 80 foglalt lifts to the 90-bed guarantee → 330 000/éj',
      expected: { net: 330000 * N, avg_full_beds: 90, avg_occupied_beds: 80, reduced_bed_nights: 10 * N },
      hint: 'full = max(occupied, ceil(capacity × occupancy_floor_pct))',
      run: async (ctx) => {
        const p = (await ctx.bill(ctx.ids.acc.bed80, ctx.ids.client.BED)).calculation_details.per_bed;
        const b = await ctx.bill(ctx.ids.acc.bed80, ctx.ids.client.BED);
        return { net: num(b.total_amount), avg_full_beds: p.avg_full_beds, avg_occupied_beds: p.avg_occupied_beds, reduced_bed_nights: p.reduced_bed_nights };
      },
    },
    {
      id: 'BILL-11',
      name: 'per_bed above the floor — 92 foglalt → 334 000/éj',
      expected: { net: 334000 * N, avg_full_beds: 92, reduced_bed_nights: 8 * N },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.bed92, ctx.ids.client.BED);
        const p = b.calculation_details.per_bed;
        return { net: num(b.total_amount), avg_full_beds: p.avg_full_beds, reduced_bed_nights: p.reduced_bed_nights };
      },
    },
    {
      id: 'BILL-12',
      name: 'Autoliv — 60 lekötött ágy @ 90%, 40 foglalt → 198 000/éj (billed at the 54 floor)',
      expected: { net: 198000 * N, vat: 53460 * N, avg_full_beds: 54, occupied_bed_nights: 40 * N, reduced_bed_nights: 6 * N },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.autoliv, ctx.ids.client.BED);
        const p = b.calculation_details.per_bed;
        return { net: num(b.total_amount), vat: num(b.vat_amount), avg_full_beds: p.avg_full_beds, occupied_bed_nights: p.occupied_bed_nights, reduced_bed_nights: p.reduced_bed_nights };
      },
    },
    {
      id: 'BILL-13',
      name: 'per_bed used-only (floor 0, rate_empty 0) → plain per-occupied-bed: 42 × 3000 × 30',
      expected: { net: 42 * 3000 * N, vat: 42 * 3000 * N * 0.27, rate_empty: 0, floor_pct: 0 },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.bedDeg, ctx.ids.client.BED2);
        const p = b.calculation_details.per_bed;
        return { net: num(b.total_amount), vat: num(b.vat_amount), rate_empty: num(p.rate_empty), floor_pct: num(p.floor_pct) };
      },
    },
    {
      id: 'BILL-14',
      name: 'per_bed capacity fallback — contracted_beds NULL → the site\'s 60 PHYSICAL beds',
      expected: { net: 198000 * N, capacity: 60, contracted_beds: null, physical_beds: 60 },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.bedFall, ctx.ids.client.BED2);
        const p = b.calculation_details.per_bed;
        return { net: num(b.total_amount), capacity: p.capacity, contracted_beds: p.contracted_beds, physical_beds: p.physical_beds };
      },
    },
    {
      id: 'BILL-15',
      name: 'per_bed over-occupancy — 65 fő in a 60-bed block: all at rate_used, empties clamped to 0',
      expected: { net: 65 * 3500 * N, reduced_bed_nights: 0, avg_full_beds: 65 },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.bedOver, ctx.ids.client.BED2);
        const p = b.calculation_details.per_bed;
        return { net: num(b.total_amount), reduced_bed_nights: p.reduced_bed_nights, avg_full_beds: p.avg_full_beds };
      },
    },

    /* ── one accommodation, two megbízók ── */
    {
      id: 'BILL-16',
      name: 'mixed site — two megbízók → TWO separate invoices on one accommodation',
      expected: { rows: 2, distinct_clients: 2, distinct_runs: 1 },
      hint: 'the engine groups by (accommodation_id, billing_client_id)',
      run: async (ctx) => {
        const rows = await ctx.bills(ctx.ids.acc.mixed);
        return {
          rows: rows.length,
          distinct_clients: new Set(rows.map((r) => r.partner_contractor_id)).size,
          distinct_runs: new Set(rows.map((r) => r.billing_run_id)).size,
        };
      },
    },
    {
      id: 'BILL-17',
      name: 'mixed site — megbízó A @ 3000: 180 000 net, rent+expense share 280 000',
      expected: { net: 180000, cost: 280000, margin: -100000, employee_days: 60 },
      hint: 'rent 600 000 / 30 / 5 occupants = 4 000 Ft/fő/nap; expense 100 000 split 60:90 employee-days',
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.mixed, ctx.ids.client.A);
        return { ...full(b), employee_days: b.total_employee_days };
      },
    },
    {
      id: 'BILL-18',
      name: 'mixed site — megbízó B @ 5000: 450 000 net, own cost share, own margin',
      expected: { net: 450000, cost: 420000, margin: 30000, employee_days: 90 },
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.mixed, ctx.ids.client.B);
        return { ...full(b), employee_days: b.total_employee_days };
      },
    },

    /* ── compensation pass-through ── */
    {
      id: 'BILL-19',
      name: 'compensation → separate line on the WORKER\'s megbízó, excluded from housing net/margin',
      expected: { housing_net: 60000, compensation: 57000, margin: 60000, lines: 2 },
      hint: 'issued 50 000 + escalated 7 000 = 57 000; margin must ignore the pass-through',
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.comp, ctx.ids.client.A);
        return {
          housing_net: num(b.total_amount), compensation: num(b.compensation_amount),
          margin: num(b.margin_amount), lines: b.calculation_details.compensation_lines.length,
        };
      },
    },
    {
      id: 'BILL-20',
      name: 'compensation status filter — issued+escalated billed; DISPUTED and waived excluded',
      expected: { billed: ['FT-C001', 'FT-C004'], total: 57000 },
      hint: 'billable = issued/notified/partial_paid/escalated; disputed only bills once resolved',
      run: async (ctx) => {
        const b = await ctx.bill(ctx.ids.acc.comp, ctx.ids.client.A);
        const lines = b.calculation_details.compensation_lines;
        return { billed: lines.map((l) => l.compensation_number).sort(), total: lines.reduce((s, l) => s + Number(l.amount), 0) };
      },
    },
    {
      id: 'BILL-21',
      name: 'compensation with no resolvable megbízó → surfaced in the run summary, never dropped',
      expected: { unattached: 1, reason: 'no_megbizo', amount: 20000 },
      run: async (ctx) => {
        const d = ctx.billing.unattached_compensation_detail.find((x) => x.compensation_number === 'FT-C005');
        return { unattached: ctx.billing.unattached_compensations, reason: d?.reason, amount: d?.amount };
      },
    },

    /* ── run-level guarantees ── */
    {
      id: 'BILL-22',
      name: 'run summary — partner count, unbilled groups, intentional skips',
      expected: { partner_count: 5, groups_no_billing_client: 2, skipped_clients: 1, status: 'calculated', run_type: 'incoming' },
      hint: 'megbízók A, B, PRIV, BED, BED2 = 5; no-client groups = the orphan claimant + the room-move site',
      run: async (ctx) => ({
        partner_count: ctx.billing.partner_count,
        groups_no_billing_client: ctx.billing.groups_no_billing_client,
        skipped_clients: ctx.billing.skipped_clients,
        status: ctx.billing.status,
        run_type: ctx.billing.run_type,
      }),
    },
    {
      id: 'BILL-23',
      name: 're-running the month is idempotent — prior run cancelled, identical totals',
      expected: { prior_cancelled: 'cancelled', totals_identical: true, active_runs: 1 },
      hint: 'billing_runs has a unique index on (billing_month, run_type) WHERE status <> cancelled',
      run: async (ctx) => {
        const before = ctx.billing;
        const again = await ctx.engine.calculateMonthlyBilling(ctx.month, { notes: 'FUNCTEST rerun' });
        const prior = (await ctx.query(`SELECT status FROM billing_runs WHERE id=$1`, [before.run_id])).rows[0];
        const active = (await ctx.query(
          `SELECT COUNT(*)::int c FROM billing_runs WHERE billing_month=$1 AND status <> 'cancelled'`, [ctx.month])).rows[0].c;
        ctx.billing = again; // later areas read the live run
        return {
          prior_cancelled: prior.status,
          totals_identical: Number(again.total_amount) === Number(before.total_amount)
            && again.billing_count === before.billing_count
            && Number(again.total_compensation) === Number(before.total_compensation),
          active_runs: active,
        };
      },
    },
  ],
};
