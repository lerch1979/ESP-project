/**
 * DATA-CHANGE INTEGRITY — seed an action, then assert the DOWNSTREAM effect.
 *
 * The question each case asks is "did the change propagate", not "did the write
 * return 200". DATA-01 is the sharpest: it performs a room move the way every
 * application path performs one (UPDATE employees.room_id) and then checks whether
 * the occupancy snapshot — the sole input to billing — reflects it.
 */
const KNOWN_MOVE_GAP =
  'NOT WIRED — occupancy_snapshots is fed exclusively by employee_accommodation_history, ' +
  'and NOTHING in src/ ever writes that table (only migration 112\'s one-time backfill and the ' +
  'sandbox seed). Room moves, accommodation transfers, hires and terminations therefore never ' +
  'reach snapshots → billing bills a frozen roster.';

module.exports = {
  area: 'DATA',
  title: 'room move → snapshots · transfer pro-rata · expiry · hygiene fine · GDPR erasure',

  async setup(ctx) {
    return {
      expiry: require('../../../src/services/expiryMonitor.service'),
      hygiene: require('../../../src/services/hygieneFine.service'),
      gdpr: require('../../../src/services/gdprAnonymization.service'),
      state: {},
    };
  },

  cases: [
    {
      id: 'DATA-01',
      name: 'room move → the next occupancy snapshot shows the NEW room',
      gap: KNOWN_MOVE_GAP,
      expected: { snapshot_room_is_new: true },
      hint: 'to close: write employee_accommodation_history on room/accommodation change (consolidation apply, Excel room assignment, employee edit, hire/termination) — or derive snapshots from employees directly',
      sql: [
        "-- the feed table has no application writer:",
        "SELECT MIN(created_at), MAX(created_at), COUNT(*) FROM employee_accommodation_history;",
      ],
      run: async (ctx, st) => {
        const [r1, r2] = ctx.ids.room.roomMove;
        await ctx.query(`UPDATE employees SET room_id=$2 WHERE id=$1`, [ctx.ids.emp.roomMove, r2]);
        await ctx.occ.recordDailySnapshot(ctx.day(30));
        const snap = (await ctx.query(
          `SELECT room_id FROM occupancy_snapshots WHERE employee_id=$1 AND snapshot_date=$2::date`,
          [ctx.ids.emp.roomMove, ctx.day(30)])).rows[0];
        st.state.roomMoveTo = r2;
        return { snapshot_room_is_new: snap?.room_id === r2, _snapshot_room: snap?.room_id === r1 ? 'still the OLD room' : snap?.room_id };
      },
    },
    {
      id: 'DATA-02',
      name: 'mid-month transfer A→B — 15 occupancy days each, never 31 or 29',
      expected: { days_at_A: 15, days_at_B: 15, total: 30 },
      run: async (ctx) => {
        const q = async (acc) => (await ctx.query(
          `SELECT COUNT(*)::int c FROM occupancy_snapshots WHERE employee_id=$1 AND accommodation_id=$2`,
          [ctx.ids.emp.mover, acc])).rows[0].c;
        const a = await q(ctx.ids.acc.transferA);
        const b = await q(ctx.ids.acc.transferB);
        return { days_at_A: a, days_at_B: b, total: a + b };
      },
    },
    {
      id: 'DATA-03',
      name: 'same-day transfer — the handover day belongs to the NEW accommodation only',
      expected: { on_handover_day: 'TransferTo', rows_that_day: 1 },
      hint: 'check_out_date is the first day they are no longer there (migration 112 decision #5)',
      run: async (ctx) => {
        const rows = (await ctx.query(
          `SELECT a.name FROM occupancy_snapshots os JOIN accommodations a ON a.id = os.accommodation_id
            WHERE os.employee_id=$1 AND os.snapshot_date=$2::date`, [ctx.ids.emp.mover, ctx.day(16)])).rows;
        return { on_handover_day: rows[0]?.name?.replace(`${ctx.tag} `, ''), rows_that_day: rows.length };
      },
    },
    {
      id: 'DATA-04',
      name: 'transfer pro-rata — each site bills its own 15 days at 2000/fő/éj and its own rent share',
      expected: { net_A: 30000, net_B: 30000, cost_A: 150000, cost_B: 150000 },
      run: async (ctx) => {
        const a = await ctx.bill(ctx.ids.acc.transferA, ctx.ids.client.A);
        const b = await ctx.bill(ctx.ids.acc.transferB, ctx.ids.client.A);
        return {
          net_A: Number(a.total_amount), net_B: Number(b.total_amount),
          cost_A: Number(a.cost_amount), cost_B: Number(b.cost_amount),
        };
      },
    },

    /* ── expiry monitor ── */
    {
      id: 'DATA-05',
      name: 'expiry monitor — a visa expiring in 10 days fires in the 14-day bucket',
      expected: { alerts: 1, threshold_days: 14 },
      hint: 'baseline rule thresholds [60,30,14,7]; the bucket is the smallest T with daysUntil ≤ T',
      run: async (ctx, st) => {
        st.state.expiryRun = await st.expiry.runDaily({ force: true });
        const rows = (await ctx.query(
          `SELECT threshold_days FROM expiry_alert_log WHERE entity_id=$1 AND field='visa'`, [ctx.ids.emp.expiryVisa])).rows;
        return { alerts: rows.length, threshold_days: rows[0]?.threshold_days };
      },
    },
    {
      id: 'DATA-06',
      name: 'expiry monitor — contract (5 days → bucket 7) and document (45 days → bucket 60) also fire',
      expected: { contract_bucket: 7, document_bucket: 60 },
      run: async (ctx) => {
        const c = (await ctx.query(
          `SELECT threshold_days FROM expiry_alert_log WHERE entity_id=$1 AND field='contract'`, [ctx.ids.emp.expiryContract])).rows[0];
        const d = (await ctx.query(
          `SELECT threshold_days FROM expiry_alert_log WHERE entity_id=$1 AND field='document'`, [String(ctx.ids.docId)])).rows[0];
        return { contract_bucket: c?.threshold_days, document_bucket: d?.threshold_days };
      },
    },
    {
      id: 'DATA-07',
      name: 'expiry monitor — an expiry 400 days out is NOT alerted (outside every window)',
      expected: { alerts: 0 },
      run: async (ctx) => ({
        alerts: (await ctx.query(
          `SELECT COUNT(*)::int c FROM expiry_alert_log WHERE entity_id=$1`, [ctx.ids.emp.expiryFar])).rows[0].c,
      }),
    },
    {
      id: 'DATA-08',
      name: 'expiry monitor is idempotent — a second run creates no duplicate alerts',
      expected: { rows_unchanged: true, second_run_fired: 0 },
      run: async (ctx, st) => {
        const before = (await ctx.query(`SELECT COUNT(*)::int c FROM expiry_alert_log`)).rows[0].c;
        const again = await st.expiry.runDaily({ force: true });
        const after = (await ctx.query(`SELECT COUNT(*)::int c FROM expiry_alert_log`)).rows[0].c;
        return { rows_unchanged: before === after, second_run_fired: again.fired ?? 0 };
      },
    },

    /* ── hygiene house-rule fine ── */
    {
      id: 'DATA-09',
      name: 'hygiene fine — toggle OFF creates nothing, even with two failing inspections',
      expected: { skipped: true, reason: 'disabled', fines: 0 },
      run: async (ctx, st) => {
        await st.hygiene.updateConfig({ enabled: false, consecutive_fails: 2, fail_hygiene_max: 15, fine_amount: 10000 }, null);
        const res = await st.hygiene.runHygieneFines({ userId: null });
        const fines = (await ctx.query(
          `SELECT COUNT(*)::int c FROM compensations WHERE room_id=$1 AND type='fine'`, [ctx.ids.room.hyg])).rows[0].c;
        return { skipped: res.skipped, reason: res.reason, fines };
      },
    },
    {
      id: 'DATA-10',
      name: 'hygiene fine — 2 consecutive fails (7 pt) → exactly ONE fine, 10 000 Ft × 2 lakó',
      expected: { created: 1, fines_on_room: 1, amount_gross: 20000, residents: 2, per_resident: 10000 },
      hint: 'hygieneFine.service.js: latest N completed inspections all with hygiene_score ≤ fail_hygiene_max',
      run: async (ctx, st) => {
        await st.hygiene.updateConfig({ enabled: true }, null);
        const res = await st.hygiene.runHygieneFines({ userId: null });
        st.state.hygieneFirst = res;
        const fine = (await ctx.query(
          `SELECT id, amount_gross FROM compensations WHERE room_id=$1 AND type='fine'`, [ctx.ids.room.hyg])).rows;
        const residents = fine.length
          ? (await ctx.query(`SELECT amount_assigned FROM compensation_residents WHERE compensation_id=$1`, [fine[0].id])).rows
          : [];
        return {
          created: res.created, fines_on_room: fine.length,
          amount_gross: fine[0] ? Number(fine[0].amount_gross) : null,
          residents: residents.length,
          per_resident: residents[0] ? Number(residents[0].amount_assigned) : null,
        };
      },
    },
    {
      id: 'DATA-11',
      name: 'hygiene fine is idempotent — a second run creates 0 and reports skipped_existing',
      expected: { created: 0, skipped_existing: 1, fines_on_room: 1 },
      run: async (ctx, st) => {
        const res = await st.hygiene.runHygieneFines({ userId: null });
        const fines = (await ctx.query(
          `SELECT COUNT(*)::int c FROM compensations WHERE room_id=$1 AND type='fine'`, [ctx.ids.room.hyg])).rows[0].c;
        return { created: res.created, skipped_existing: res.skipped_existing, fines_on_room: fines };
      },
    },
    {
      id: 'DATA-12',
      name: 'hygiene fine — a room with only ONE failing inspection is never fined',
      expected: { fines: 0 },
      run: async (ctx) => ({
        fines: (await ctx.query(
          `SELECT COUNT(*)::int c FROM compensations WHERE room_id=$1 AND type='fine'`, [ctx.ids.room.hygOk])).rows[0].c,
      }),
    },
    {
      id: 'DATA-13',
      name: 'hygiene fine writes NO payment and NO salary deduction (deduction executor stays mothballed)',
      expected: { payments: 0, deductions: 0 },
      hint: 'the fine is a debt record + resident notification only — see PROJECT_STATE decisions log 2026-07-05',
      run: async (ctx) => {
        const fine = (await ctx.query(`SELECT id FROM compensations WHERE room_id=$1 AND type='fine'`, [ctx.ids.room.hyg])).rows[0];
        if (!fine) return { payments: null, deductions: null, error: 'no fine created' };
        const pay = await ctx.query(`SELECT COUNT(*)::int c FROM compensation_payments WHERE compensation_id=$1`, [fine.id]).catch(() => ({ rows: [{ c: 0 }] }));
        const ded = await ctx.query(
          `SELECT COUNT(*)::int c FROM salary_deductions sd
             JOIN compensation_residents cr ON cr.id = sd.compensation_resident_id WHERE cr.compensation_id=$1`, [fine.id])
          .catch(() => ({ rows: [{ c: 0 }] }));
        return { payments: pay.rows[0].c, deductions: ded.rows[0].c };
      },
    },

    /* ── GDPR erasure ── */
    {
      id: 'DATA-14',
      name: 'GDPR erasure — identifying fields nulled, surname pseudonymized, anonymized_at set',
      expected: { first_name: null, mothers_name: null, passport_number: null, social_security_number: null,
                  bank_account: null, personal_email: null, surname_pseudonymized: true, anonymized_at_set: true },
      run: async (ctx, st) => {
        st.state.erasure = await st.gdpr.anonymizeEmployee(ctx.ids.emp.gdpr, { reason: 'functest' });
        const e = (await ctx.query(
          `SELECT first_name, last_name, mothers_name, passport_number, social_security_number,
                  bank_account, personal_email, anonymized_at FROM employees WHERE id=$1`, [ctx.ids.emp.gdpr])).rows[0];
        return {
          first_name: e.first_name, mothers_name: e.mothers_name, passport_number: e.passport_number,
          social_security_number: e.social_security_number, bank_account: e.bank_account,
          personal_email: e.personal_email,
          surname_pseudonymized: !!e.last_name && e.last_name !== ctx.tag,
          anonymized_at_set: !!e.anonymized_at,
        };
      },
    },
    {
      id: 'DATA-15',
      name: 'GDPR erasure emits an itemized receipt (rowcounts + file outcomes + completeness)',
      expected: { ok: true, complete: true, has_rowcounts: true, files_failed: 0, receipt_persisted: true },
      run: async (ctx, st) => {
        const r = st.state.erasure;
        const log = (await ctx.query(
          `SELECT summary FROM anonymization_log WHERE employee_id=$1 AND dry_run = FALSE ORDER BY executed_at DESC LIMIT 1`,
          [ctx.ids.emp.gdpr])).rows[0];
        return {
          ok: r?.ok, complete: r?.receipt?.complete,
          has_rowcounts: Object.keys(r?.receipt?.db_rows_affected || {}).length > 0,
          files_failed: r?.receipt?.files_failed ?? null,
          receipt_persisted: !!log?.summary?.db_rows_affected,
        };
      },
    },
    {
      id: 'DATA-16',
      name: 'GDPR — INDEPENDENT sweep: the PII marker survives in zero text columns',
      expected: { columns_still_containing_marker: [] },
      hint: 'scans every text/varchar column of employees + users for the seeded marker, without trusting the receipt',
      run: async (ctx) => {
        const marker = ctx.ids.gdprMarker;
        const cols = (await ctx.query(
          `SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name IN ('employees','users')
              AND data_type IN ('text','character varying')`)).rows;
        const hits = [];
        for (const c of cols) {
          const r = await ctx.query(
            `SELECT COUNT(*)::int n FROM "${c.table_name}" WHERE "${c.column_name}"::text ILIKE $1`, [`%${marker}%`]).catch(() => null);
          if (r && r.rows[0].n > 0) hits.push(`${c.table_name}.${c.column_name} (${r.rows[0].n})`);
        }
        return { columns_still_containing_marker: hits, _columns_scanned: cols.length };
      },
    },
    {
      id: 'DATA-17',
      name: 'GDPR erasure is not repeatable — a second request is refused',
      expected: { ok: false, error: 'already_anonymized' },
      run: async (ctx, st) => {
        const again = await st.gdpr.anonymizeEmployee(ctx.ids.emp.gdpr, { reason: 'functest-repeat' });
        return { ok: again.ok, error: again.error };
      },
    },
  ],
};
