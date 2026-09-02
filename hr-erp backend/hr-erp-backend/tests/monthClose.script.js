/**
 * Month close + the one-live-row invariant (mig 148).
 *
 * Two halves of one problem. Before this, nothing set `finalized`, so an invoiced month
 * stayed recalculable from CURRENT occupancy/expenses/rates; and a re-bill left the
 * superseded run's rows behind, so a query filtering only on (accommodation, month)
 * could read a dead row. The second already caused a false PASS in a test and a
 * misreported July figure on prod.
 *
 * Sandbox only.
 *   DB_NAME=hr_erp_sandbox DB_USER=$(whoami) node tests/monthClose.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const engine = require('../src/services/billingEngine.service');
const ctrl = require('../src/controllers/billing.controller');

let failures = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail && !cond ? `   [${detail}]` : ''}`);
  if (!cond) failures++;
};
function mockRes() {
  return { statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; } };
}
const su = (id) => ({ user: { id, email: 'su@test.local', roles: ['superadmin'], contractorId: null }, params: {}, body: {} });

(async () => {
  const stamp = Date.now();
  let LL, CLIENT, ACC, emp = [], userId;
  const MONTH = '1911-05';

  try {
    if (!/sandbox/i.test(process.env.DB_NAME || '')) throw new Error('sandbox only');
    userId = (await pool.query('SELECT id FROM users LIMIT 1')).rows[0].id;

    LL = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('MC Szállásadó',$1,true) RETURNING id`, ['mc-ll-' + stamp])).rows[0].id;
    CLIENT = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('MC Megbízó',$1,true) RETURNING id`, ['mc-cl-' + stamp])).rows[0].id;
    await pool.query(`INSERT INTO client_billing_profiles (contractor_id) VALUES ($1) ON CONFLICT DO NOTHING`, [CLIENT]);
    ACC = (await pool.query(
      `INSERT INTO accommodations (name,type,capacity,status,current_contractor_id) VALUES ($1,'studio',10,'available',$2) RETURNING id`,
      ['MC Szálló ' + stamp, LL])).rows[0].id;
    await pool.query(
      `INSERT INTO accommodation_rent_rates (accommodation_id, rent_basis, rent_per_bed_night, valid_from)
       VALUES ($1,'per_bed_night',1000,DATE '1900-01-01')`, [ACC]);
    await pool.query(
      `INSERT INTO client_night_rates (contractor_id, accommodation_id, rate_per_night, valid_from, billing_basis)
       VALUES ($1,$2,4000,DATE '1900-01-01','per_person')`, [CLIENT, ACC]);

    for (let i = 0; i < 2; i++) {
      const e = (await pool.query(
        `INSERT INTO employees (contractor_id, billing_client_id, first_name, last_name, accommodation_id, arrival_date)
         VALUES ($1,$2,$3,'MC',$4,DATE '1911-01-01') RETURNING id`, [CLIENT, CLIENT, `MC${i}`, ACC])).rows[0].id;
      emp.push(e);
    }
    for (let d = 1; d <= 31; d++) {
      const date = `${MONTH}-${String(d).padStart(2, '0')}`;
      for (const e of emp) {
        await pool.query(
          `INSERT INTO occupancy_snapshots (snapshot_date, employee_id, accommodation_id, room_occupant_count)
           VALUES ($1,$2,$3,2) ON CONFLICT DO NOTHING`, [date, e, ACC]);
      }
    }

    const liveRows = async () => (await pool.query(
      `SELECT ab.id, ab.cost_amount FROM accommodation_billings ab
         JOIN billing_runs br ON br.id = ab.billing_run_id
        WHERE ab.accommodation_id=$1 AND ab.billing_month=$2 AND br.status <> 'cancelled'`, [ACC, MONTH])).rows;
    const allRows = async () => (await pool.query(
      `SELECT count(*)::int n FROM accommodation_billings WHERE accommodation_id=$1 AND billing_month=$2`, [ACC, MONTH])).rows[0].n;
    const runOf = async () => (await pool.query(
      `SELECT id, status, finalized_at FROM billing_runs WHERE billing_month=$1 AND status <> 'cancelled'`, [MONTH])).rows[0];

    // ── STALE ROWS ─────────────────────────────────────────────────────────
    await engine.calculateMonthlyBilling(MONTH, { runType: 'incoming' });
    check('SR-01 first run produces exactly one live row', (await liveRows()).length === 1);
    check('SR-02 ... and the table holds exactly that row (no leftovers)', (await allRows()) === 1);

    await engine.calculateMonthlyBilling(MONTH, { runType: 'incoming' });
    await engine.calculateMonthlyBilling(MONTH, { runType: 'incoming' });
    check('SR-03 after three re-bills there is STILL exactly one live row', (await liveRows()).length === 1);
    check('SR-04 ... and the superseded rows are GONE, not merely cancelled', (await allRows()) === 1,
      `table holds ${await allRows()}`);

    // The invariant the whole class of bug reduces to.
    const dupes = await pool.query(
      `SELECT count(*)::int n FROM (
         SELECT accommodation_id, COALESCE(partner_contractor_id,'00000000-0000-0000-0000-000000000000'::uuid) c, billing_month
           FROM accommodation_billings GROUP BY 1,2,3 HAVING count(*) > 1) x`);
    check('SR-05 NO (accommodation, client, month) has more than one row anywhere', dupes.rows[0].n === 0);

    // A naive query — the one that misreported July — can no longer read a dead row.
    const naive = await pool.query(
      `SELECT cost_amount FROM accommodation_billings WHERE accommodation_id=$1 AND billing_month=$2`, [ACC, MONTH]);
    check('SR-06 a query with NO run-status filter now returns exactly the live figure',
      naive.rows.length === 1 && Number(naive.rows[0].cost_amount) === Number((await liveRows())[0].cost_amount));

    // ── MONTH CLOSE ────────────────────────────────────────────────────────
    let run = await runOf();
    check('MC-01 a fresh run is not finalized', run.status === 'calculated' && run.finalized_at === null);

    const req1 = su(userId); req1.params = { id: run.id };
    const res1 = mockRes(); await ctrl.finalizeRun(req1, res1);
    check('MC-02 closing the month succeeds', res1.statusCode === 200 && res1.body?.data?.status === 'finalized');
    run = await runOf();
    check('MC-03 ... the run is finalized and stamped with who/when',
      run.status === 'finalized' && !!run.finalized_at);

    let refused = null;
    try { await engine.calculateMonthlyBilling(MONTH, { runType: 'incoming' }); }
    catch (e) { refused = e; }
    check('MC-04 a CLOSED month can never be re-billed', !!refused);
    check('MC-05 ... and the refusal is a clear Hungarian message, not a stack trace',
      !!refused && /le van zárva/.test(refused.message) && refused.code === 'MONTH_FINALIZED', refused && refused.message);
    check('MC-06 ... and the closed figures are untouched', (await liveRows()).length === 1);

    const res2 = mockRes(); await ctrl.finalizeRun(su(userId, run.id) && Object.assign(su(userId), { params: { id: run.id } }), res2);
    check('MC-07 closing an already-closed month is refused', res2.statusCode === 409);

    // ── REOPEN ─────────────────────────────────────────────────────────────
    const reqNoReason = Object.assign(su(userId), { params: { id: run.id }, body: {} });
    const res3 = mockRes(); await ctrl.reopenRun(reqNoReason, res3);
    check('MC-08 reopening WITHOUT a reason is refused', res3.statusCode === 400 && /indoklás/.test(res3.body.message));
    check('MC-09 ... and the month is still closed', (await runOf()).status === 'finalized');

    const reqReason = Object.assign(su(userId), { params: { id: run.id }, body: { reason: 'Hibás létszám a 12. napon, javítás után újraszámolás.' } });
    const res4 = mockRes(); await ctrl.reopenRun(reqReason, res4);
    check('MC-10 reopening WITH a reason succeeds', res4.statusCode === 200);
    run = await runOf();
    check('MC-11 ... the run is recalculable again and the finalize stamp is cleared',
      run.status === 'calculated' && run.finalized_at === null);

    const ev = await pool.query(
      `SELECT action, reason, acted_by FROM billing_month_lock_events WHERE billing_month=$1 ORDER BY acted_at`, [MONTH]);
    check('MC-12 both the close and the reopen are logged (who/when/why)',
      ev.rows.length === 2 && ev.rows[0].action === 'finalize' && ev.rows[1].action === 'reopen'
      && /Hibás létszám/.test(ev.rows[1].reason) && ev.rows[1].acted_by === userId);

    await engine.calculateMonthlyBilling(MONTH, { runType: 'incoming' });
    check('MC-13 after reopening, the month re-bills normally again', (await liveRows()).length === 1);
    check('MC-14 ... still exactly one row in the table', (await allRows()) === 1);

    // The DB refuses a reason-less reopen even if a controller ever forgets.
    let dbRefused = false;
    try {
      await pool.query(
        `INSERT INTO billing_month_lock_events (billing_month, action) VALUES ($1,'reopen')`, [MONTH]);
    } catch (e) { dbRefused = e.code === '23514'; }
    check('MC-15 the DATABASE also refuses a reason-less reopen record', dbRefused);

    const res5 = mockRes();
    await ctrl.reopenRun(Object.assign(su(userId), { params: { id: (await runOf()).id }, body: { reason: 'x' } }), res5);
    check('MC-16 reopening a month that is not closed is refused', res5.statusCode === 409);
  } catch (err) {
    console.error('SUITE ERROR:', err.message);
    failures++;
  } finally {
    const q = (sql, p) => pool.query(sql, p).catch(() => {});
    await q('DELETE FROM billing_month_lock_events WHERE billing_month=$1', [MONTH]);
    await q('DELETE FROM accommodation_billings WHERE accommodation_id=$1', [ACC]);
    await q('DELETE FROM billing_runs WHERE billing_month=$1', [MONTH]);
    await q('DELETE FROM occupancy_snapshots WHERE accommodation_id=$1', [ACC]);
    await q('DELETE FROM accommodation_rent_rates WHERE accommodation_id=$1', [ACC]);
    await q('DELETE FROM client_night_rates WHERE contractor_id=$1', [CLIENT]);
    await q('DELETE FROM employees WHERE id = ANY($1::uuid[])', [emp]);
    await q('DELETE FROM accommodations WHERE id=$1', [ACC]);
    await q('DELETE FROM client_billing_profiles WHERE contractor_id=$1', [CLIENT]);
    await q('DELETE FROM contractors WHERE id = ANY($1::uuid[])', [[LL, CLIENT].filter(Boolean)]);
    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
    await pool.end?.();
    process.exit(failures === 0 ? 0 : 1);
  }
})();
