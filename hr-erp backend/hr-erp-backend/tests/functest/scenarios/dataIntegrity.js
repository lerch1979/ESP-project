/**
 * DATA-CHANGE INTEGRITY — seed an action, then assert the DOWNSTREAM effect.
 *
 * The question each case asks is "did the change propagate", not "did the write
 * return 200". DATA-01..05 walk the housing lifecycle through the REAL application
 * paths — room move, consolidation approve, hire, termination — and check that each one
 * reaches employee_accommodation_history and therefore the occupancy snapshot, which is
 * the sole input to billing. DATA-21/22 assert the two invariants that keep the chain
 * alive: no employee covers a day twice, and the roster always matches its history.
 */
const http = require('../lib/http');

module.exports = {
  area: 'DATA',
  title: 'housing change → snapshots · transfer pro-rata · expiry · hygiene fine · GDPR erasure',

  async setup(ctx) {
    return {
      expiry: require('../../../src/services/expiryMonitor.service'),
      hygiene: require('../../../src/services/hygieneFine.service'),
      gdpr: require('../../../src/services/gdprAnonymization.service'),
      accHistory: require('../../../src/services/accommodationHistory.service'),
      superToken: http.tokenFor(ctx.ids.user.superadmin),
      state: {},
    };
  },

  cases: [
    {
      id: 'DATA-01',
      name: 'room move via the real API → the next occupancy snapshot shows the NEW room',
      expected: { status: 200, snapshot_room_is_new: true, open_history_rows: 1, history_room_is_new: true },
      hint: 'accommodationHistory.syncAssignment runs in the same transaction as the employees UPDATE (employee.controller.js → updateEmployee)',
      sql: [
        "-- the feed the snapshot reads:",
        "SELECT accommodation_id, room_id, check_in_date, check_out_date, reason",
        "  FROM employee_accommodation_history WHERE employee_id = '<the moved employee>' ORDER BY check_in_date;",
      ],
      run: async (ctx, st) => {
        const [, r2] = ctx.ids.room.roomMove;
        // Move them the way the admin UI does — PUT /employees/:id, not a raw UPDATE.
        const res = await http.put(`/employees/${ctx.ids.emp.roomMove}`, {
          token: st.superToken, body: { room_id: r2 },
        });
        // The move is effective today; the fixture month is in the past, so re-open the
        // stay from day 30 to observe the same-transaction history write on a billed day.
        await ctx.query(
          `UPDATE employee_accommodation_history SET check_in_date = $2::date
            WHERE employee_id = $1 AND check_out_date IS NULL`, [ctx.ids.emp.roomMove, ctx.day(30)]);
        await ctx.query(
          `UPDATE employee_accommodation_history SET check_out_date = $2::date
            WHERE employee_id = $1 AND check_out_date IS NOT NULL`, [ctx.ids.emp.roomMove, ctx.day(30)]);
        await ctx.occ.recordDailySnapshot(ctx.day(30));
        const snap = (await ctx.query(
          `SELECT room_id FROM occupancy_snapshots WHERE employee_id=$1 AND snapshot_date=$2::date`,
          [ctx.ids.emp.roomMove, ctx.day(30)])).rows[0];
        const open = (await ctx.query(
          `SELECT room_id FROM employee_accommodation_history WHERE employee_id=$1 AND check_out_date IS NULL`,
          [ctx.ids.emp.roomMove])).rows;
        st.state.roomMoveTo = r2;
        return {
          status: res.status,
          snapshot_room_is_new: snap?.room_id === r2,
          open_history_rows: open.length,
          history_room_is_new: open[0]?.room_id === r2,
        };
      },
    },
    {
      id: 'DATA-02',
      name: 'consolidation approve → history followed every applied room change',
      expected: { moves_applied_gt0: true, rows_not_matching_employee: [], reasons: ['consolidation'] },
      hint: 'consolidationEngine.applyGroup writes accommodationHistory inside its own transaction (the CONSOLIDATION area already approved this site)',
      sql: [
        "SELECT s.entity_id, h.room_id, h.reason FROM agent_suggestions s",
        "  JOIN employee_accommodation_history h ON h.employee_id = s.entity_id AND h.check_out_date IS NULL",
        " WHERE s.agent_name='room_consolidation' AND s.status='applied';",
      ],
      run: async (ctx) => {
        // In a full run CONS-08 has already approved the solvable site, and re-generating
        // would find it solved. When this area runs alone (--only=DATA) nothing has been
        // applied yet, so approve a site here — the scenario must not depend on run order.
        const already = (await ctx.query(
          `SELECT COUNT(*)::int c FROM agent_suggestions WHERE agent_name='room_consolidation' AND status='applied'`)).rows[0].c;
        if (already === 0) {
          const engine = require('../../../src/services/consolidationEngine.service');
          const run = await engine.generateRun(null);
          const site = (await engine.getSuggestions(run.run_id))[0]?.payload?.accommodation_id;
          if (site) await engine.applyGroup(run.run_id, site, null);
        }
        const applied = (await ctx.query(
          `SELECT s.entity_id, e.room_id AS emp_room, h.room_id AS hist_room, h.reason
             FROM agent_suggestions s
             JOIN employees e ON e.id = s.entity_id
             LEFT JOIN employee_accommodation_history h
               ON h.employee_id = s.entity_id AND h.check_out_date IS NULL
            WHERE s.agent_name='room_consolidation' AND s.status='applied'`)).rows;
        return {
          moves_applied_gt0: applied.length > 0,
          rows_not_matching_employee: applied
            .filter((r) => r.hist_room !== r.emp_room)
            .map((r) => `${r.entity_id}: history ${r.hist_room} vs employees ${r.emp_room}`),
          reasons: [...new Set(applied.map((r) => r.reason))],
        };
      },
    },
    {
      id: 'DATA-03',
      name: 'hire via the real API → an open history row exists immediately',
      expected: { status: 201, open_rows: 1, accommodation_matches: true, reason: 'hire' },
      run: async (ctx, st) => {
        const res = await http.post('/employees', {
          token: st.superToken,
          body: { first_name: 'FTHire', last_name: ctx.tag, accommodation_id: ctx.ids.acc.t1, contractor_id: ctx.ids.client.T1 },
        });
        const id = res.body?.data?.employee?.id;
        st.state.hiredId = id;
        if (!id) return { status: res.status, open_rows: 0, error: res.body?.message };
        const rows = (await ctx.query(
          `SELECT accommodation_id, reason FROM employee_accommodation_history
            WHERE employee_id=$1 AND check_out_date IS NULL`, [id])).rows;
        return {
          status: res.status, open_rows: rows.length,
          accommodation_matches: rows[0]?.accommodation_id === ctx.ids.acc.t1,
          reason: rows[0]?.reason,
        };
      },
    },
    {
      id: 'DATA-04',
      name: 'termination via the real API → the stay ends, the bed stops counting today',
      expected: { status: 200, open_rows: 0, covers_today: 0 },
      hint: 'check_out_date is the first day they are NOT there, so tonight\'s snapshot already frees the bed. A same-day hire+termination leaves no row at all — they never occupied one.',
      run: async (ctx, st) => {
        if (!st.state.hiredId) return { error: 'the hire scenario (DATA-03) did not create an employee' };
        const res = await http.del(`/employees/${st.state.hiredId}`, { token: st.superToken });
        const rows = (await ctx.query(
          `SELECT COUNT(*) FILTER (WHERE check_out_date IS NULL)::int AS open_rows,
                  COUNT(*) FILTER (WHERE check_in_date <= CURRENT_DATE
                                     AND (check_out_date IS NULL OR check_out_date > CURRENT_DATE))::int AS covers_today
             FROM employee_accommodation_history WHERE employee_id=$1`, [st.state.hiredId])).rows[0];
        return { status: res.status, open_rows: rows.open_rows, covers_today: rows.covers_today };
      },
    },
    {
      id: 'DATA-05',
      name: 'termination of a LONG-STANDING resident closes the stay instead of deleting it',
      expected: { status: 200, open_rows: 0, closed_rows: 1, covers_today: 0 },
      hint: 'the same-day case in DATA-04 removes the row; a stay that already ran must be CLOSED so past billing keeps its days',
      run: async (ctx, st) => {
        // Someone who checked in a week ago — the ordinary termination shape.
        const res0 = await http.post('/employees', {
          token: st.superToken,
          body: { first_name: 'FTLeaver', last_name: ctx.tag, accommodation_id: ctx.ids.acc.t1, contractor_id: ctx.ids.client.T1 },
        });
        const id = res0.body?.data?.employee?.id;
        if (!id) return { error: `hire failed: ${res0.body?.message}` };
        await ctx.query(
          `UPDATE employee_accommodation_history SET check_in_date = CURRENT_DATE - 7
            WHERE employee_id = $1 AND check_out_date IS NULL`, [id]);
        const res = await http.del(`/employees/${id}`, { token: st.superToken });
        const rows = (await ctx.query(
          `SELECT COUNT(*) FILTER (WHERE check_out_date IS NULL)::int AS open_rows,
                  COUNT(*) FILTER (WHERE check_out_date IS NOT NULL)::int AS closed_rows,
                  COUNT(*) FILTER (WHERE check_in_date <= CURRENT_DATE
                                     AND (check_out_date IS NULL OR check_out_date > CURRENT_DATE))::int AS covers_today
             FROM employee_accommodation_history WHERE employee_id=$1`, [id])).rows[0];
        return { status: res.status, open_rows: rows.open_rows, closed_rows: rows.closed_rows, covers_today: rows.covers_today };
      },
    },
    {
      id: 'DATA-06',
      name: 'no employee ever has two history rows covering the same day',
      expected: { overlapping_pairs: [] },
      hint: 'recordDailySnapshot inserts ON CONFLICT (snapshot_date, employee_id) — a double-covered day would abort the snapshot for EVERYONE',
      run: async (ctx, st) => {
        const rows = await st.accHistory.findOverlaps();
        return { overlapping_pairs: rows.map((r) => `${r.employee_id}: [${r.a_in}→${r.a_out || '∞'}] vs [${r.b_in}→${r.b_out || '∞'}]`) };
      },
    },
    {
      id: 'DATA-07',
      name: 'the roster and its history agree — every housed employee has a matching open row',
      expected: { employees_out_of_sync: 0 },
      hint: 'this is the invariant the frozen-roster bug violated; the backfill script asserts the same thing',
      run: async (ctx) => ({
        employees_out_of_sync: (await ctx.query(
          `SELECT COUNT(*)::int c FROM employees e
            WHERE e.end_date IS NULL AND e.accommodation_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM employee_accommodation_history h
                 WHERE h.employee_id = e.id AND h.check_out_date IS NULL
                   AND h.accommodation_id = e.accommodation_id
                   AND h.room_id IS NOT DISTINCT FROM e.room_id)`)).rows[0].c,
      }),
    },
    {
      id: 'DATA-08',
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
      id: 'DATA-09',
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
      id: 'DATA-10',
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
      id: 'DATA-11',
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
      id: 'DATA-12',
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
      id: 'DATA-13',
      name: 'expiry monitor — an expiry 400 days out is NOT alerted (outside every window)',
      expected: { alerts: 0 },
      run: async (ctx) => ({
        alerts: (await ctx.query(
          `SELECT COUNT(*)::int c FROM expiry_alert_log WHERE entity_id=$1`, [ctx.ids.emp.expiryFar])).rows[0].c,
      }),
    },
    {
      id: 'DATA-14',
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
      id: 'DATA-15',
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
      id: 'DATA-16',
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
      id: 'DATA-17',
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
      id: 'DATA-18',
      name: 'hygiene fine — a room with only ONE failing inspection is never fined',
      expected: { fines: 0 },
      run: async (ctx) => ({
        fines: (await ctx.query(
          `SELECT COUNT(*)::int c FROM compensations WHERE room_id=$1 AND type='fine'`, [ctx.ids.room.hygOk])).rows[0].c,
      }),
    },
    {
      id: 'DATA-19',
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
      id: 'DATA-20',
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
      id: 'DATA-21',
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
      id: 'DATA-22',
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
      id: 'DATA-23',
      name: 'GDPR erasure is not repeatable — a second request is refused',
      expected: { ok: false, error: 'already_anonymized' },
      run: async (ctx, st) => {
        const again = await st.gdpr.anonymizeEmployee(ctx.ids.emp.gdpr, { reason: 'functest-repeat' });
        return { ok: again.ok, error: again.error };
      },
    },
  ],
};
