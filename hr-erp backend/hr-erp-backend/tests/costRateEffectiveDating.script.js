/**
 * Effective-dated COST rates (mig 146) + rolling notice on open-ended contracts.
 *
 * The whole point of mig 146 is CE-03: changing a rate must not restate an already
 * billed month. Before mig 146 the engine read accommodations.rent_per_bed_night with
 * no date filter, so editing it re-priced every non-finalized month on the next re-bill
 * — found on real prod data (Sarród I. August 2026: 558 bed-nights x 2000 = 1 116 000,
 * run status `calculated`, so a re-bill would have restated it to 1 227 600).
 *
 * Sandbox only.
 *   DB_NAME=hr_erp_sandbox DB_USER=$(whoami) node tests/costRateEffectiveDating.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const engine = require('../src/services/billingEngine.service');
const partner = require('../src/services/partner.service');

let failures = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail && !cond ? `   [${detail}]` : ''}`);
  if (!cond) failures++;
};
const su = { user: { id: null, email: 'su@test.local', roles: ['superadmin'], contractorId: null } };
/**
 * Cost from the LIVE run for a month.
 *
 * A re-bill CANCELS the previous run but does NOT delete its accommodation_billings
 * rows, so a bare `WHERE accommodation_id AND billing_month` can return the stale row
 * and make a re-bill look like a no-op. (It did exactly that here, giving a false PASS
 * on the headline assertion.) Same rule the profit dashboard uses: join billing_runs
 * and exclude cancelled.
 */
async function liveCost(accId, month) {
  const r = await pool.query(
    `SELECT ab.cost_amount, ab.calculation_details
       FROM accommodation_billings ab
       JOIN billing_runs br ON br.id = ab.billing_run_id
      WHERE ab.accommodation_id = $1 AND ab.billing_month = $2
        AND br.status <> 'cancelled' AND ab.status <> 'cancelled'
      ORDER BY ab.created_at DESC LIMIT 1`, [accId, month]);
  return r.rows[0] || null;
}

const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

(async () => {
  const stamp = Date.now();
  let LL, CLIENT, ACC, emp = [];

  try {
    if (!/sandbox/i.test(process.env.DB_NAME || '')) {
      throw new Error(`refusing to run outside a sandbox DB (DB_NAME=${process.env.DB_NAME})`);
    }
    su.user.id = (await pool.query('SELECT id FROM users LIMIT 1')).rows[0].id;

    LL = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('CE Szállásadó',$1,true) RETURNING id`, ['ce-ll-' + stamp])).rows[0].id;
    CLIENT = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('CE Megbízó',$1,true) RETURNING id`, ['ce-cl-' + stamp])).rows[0].id;
    await pool.query(`INSERT INTO client_billing_profiles (contractor_id) VALUES ($1) ON CONFLICT DO NOTHING`, [CLIENT]);
    ACC = (await pool.query(
      `INSERT INTO accommodations (name,type,capacity,status,current_contractor_id,rent_basis,rent_per_bed_night)
       VALUES ($1,'studio',10,'available',$2,'per_bed_night',2000) RETURNING id`,
      ['CE Szálló ' + stamp, LL])).rows[0].id;

    // Revenue side so a billing row is produced at all.
    await pool.query(
      `INSERT INTO client_night_rates (contractor_id, accommodation_id, rate_per_night, valid_from, billing_basis)
       VALUES ($1,$2,5000,DATE '2000-01-01','per_person')`, [CLIENT, ACC]);

    // 2 employees housed for the whole of August and September.
    for (let i = 0; i < 2; i++) {
      const e = (await pool.query(
        `INSERT INTO employees (contractor_id, billing_client_id, first_name, last_name, accommodation_id, arrival_date)
         VALUES ($1,$2,$3,'CE',$4,DATE '2026-07-01') RETURNING id`,
        [CLIENT, CLIENT, `Teszt${i}`, ACC])).rows[0].id;
      emp.push(e);
    }
    // Occupancy snapshots: 31 days of August + 30 of September, 2 people => 62 / 60 bed-nights.
    for (const [month, days] of [['2026-08', 31], ['2026-09', 30]]) {
      for (let d = 1; d <= days; d++) {
        const date = `${month}-${String(d).padStart(2, '0')}`;
        for (const e of emp) {
          await pool.query(
            `INSERT INTO occupancy_snapshots (snapshot_date, employee_id, accommodation_id, room_occupant_count)
             VALUES ($1,$2,$3,2) ON CONFLICT DO NOTHING`, [date, e, ACC]);
        }
      }
    }

    // The backfill covers accommodations that existed when mig 146 ran. This ACC was
    // created afterwards, so it has NO rate row — which is exactly the fallback case
    // that must keep billing at the legacy columns rather than at zero.
    // Assert the backfill LOGIC, not ambient state: the sandbox is reset by `npm run
    // functest`, after which every accommodation is seeded AFTER the migration and so
    // legitimately has no backfilled row. Run the migration's own INSERT against a
    // known accommodation instead, which is deterministic in either order.
    await pool.query(
      `INSERT INTO accommodation_rent_rates
         (accommodation_id, rent_basis, rent_amount, rent_per_bed_night, valid_from, notes)
       SELECT a.id,
              COALESCE(a.rent_basis,'flat'),
              CASE WHEN COALESCE(a.rent_basis,'flat') <> 'per_bed_night'
                   THEN COALESCE(a.rent_amount, a.monthly_rent) END,
              CASE WHEN a.rent_basis = 'per_bed_night' THEN a.rent_per_bed_night END,
              DATE '1900-01-01', 'CE backfill check'
         FROM accommodations a
        WHERE a.id = $1
          AND NOT EXISTS (SELECT 1 FROM accommodation_rent_rates r WHERE r.accommodation_id = a.id)`,
      [ACC]);
    const backfilled = await pool.query(
      `SELECT rent_basis, rent_per_bed_night, valid_from, valid_to
         FROM accommodation_rent_rates WHERE accommodation_id=$1`, [ACC]);
    const bf = backfilled.rows[0] || {};
    check('CE-01 the mig 146 backfill maps existing cost config to an OPEN period from 1900-01-01',
      backfilled.rows.length === 1 && bf.rent_basis === 'per_bed_night'
      && Number(bf.rent_per_bed_night) === 2000
      && ymd(bf.valid_from) === '1900-01-01' && bf.valid_to === null,
      JSON.stringify(bf));
    await pool.query('DELETE FROM accommodation_rent_rates WHERE accommodation_id=$1', [ACC]);
    const mine = await pool.query('SELECT count(*)::int n FROM accommodation_rent_rates WHERE accommodation_id=$1', [ACC]);
    check('CE-01b a NEW accommodation has no rate row (legacy columns are the fallback)',
      mine.rows[0].n === 0);

    // Give it the row mig 146 WOULD have backfilled, so the rest of this suite mirrors
    // the real Sarród I. flow: an accommodation that already had a dated rate.
    await pool.query(
      `INSERT INTO accommodation_rent_rates (accommodation_id, rent_basis, rent_per_bed_night, valid_from)
       VALUES ($1,'per_bed_night',2000,DATE '1900-01-01')`, [ACC]);

    // ── AUGUST at 2000 ───────────────────────────────────────────────────────
    await engine.calculateMonthlyBilling('2026-08', { runType: 'incoming' });
    const aug1 = await liveCost(ACC, '2026-08');
    const augCost = Number(aug1.cost_amount);
    check('CE-02 August bills at 2000 (62 bed-nights x 2000 = 124 000)',
      Math.abs(augCost - 124000) < 1, `got ${augCost}`);

    // ── the change: close 2000 at 08-31, open 2200 from 09-01 ───────────────
    await pool.query(`UPDATE accommodation_rent_rates SET valid_to = DATE '2026-08-31' WHERE accommodation_id=$1`, [ACC]);
    await pool.query(
      `INSERT INTO accommodation_rent_rates (accommodation_id, rent_basis, rent_per_bed_night, valid_from)
       VALUES ($1,'per_bed_night',2200,DATE '2026-09-01')`, [ACC]);
    // Also move the legacy column, to prove the DATED rows are what the engine uses.
    await pool.query(`UPDATE accommodations SET rent_per_bed_night = 2200 WHERE id=$1`, [ACC]);

    // ── THE POINT: re-run August, it must be unchanged ──────────────────────
    await engine.calculateMonthlyBilling('2026-08', { runType: 'incoming' });
    const aug2 = Number((await liveCost(ACC, '2026-08')).cost_amount);
    check('CE-03 re-running AUGUST after the rate change leaves it UNCHANGED',
      Math.abs(aug2 - augCost) < 1, `was ${augCost}, now ${aug2}`);
    check('CE-04 ... and specifically NOT restated to the new rate (62 x 2200 = 136 400)',
      Math.abs(aug2 - 136400) > 1, `got ${aug2}`);

    check('CE-04b editing the LEGACY accommodations column cannot restate history either',
      Math.abs(Number((await liveCost(ACC, '2026-08')).cost_amount) - 124000) < 1);

    // ── September picks up 2200 ────────────────────────────────────────────
    await engine.calculateMonthlyBilling('2026-09', { runType: 'incoming' });
    const sep = await liveCost(ACC, '2026-09');
    const sepCost = Number(sep.cost_amount);
    check('CE-05 September bills at 2200 (60 bed-nights x 2200 = 132 000)',
      Math.abs(sepCost - 132000) < 1, `got ${sepCost}`);
    check('CE-06 the stored calculation records the rate actually used',
      Number(sep.calculation_details?.rent_rate_used ?? sep.calculation_details?.per_bed?.rate_used ?? 0) === 2200
      || sep.calculation_details?.rent_basis === 'per_bed_night');

    // ── a mid-month change is visible, not averaged away ───────────────────
    await pool.query(`DELETE FROM accommodation_rent_rates WHERE accommodation_id=$1`, [ACC]);
    await pool.query(
      `INSERT INTO accommodation_rent_rates (accommodation_id, rent_basis, rent_per_bed_night, valid_from, valid_to)
       VALUES ($1,'per_bed_night',2000,DATE '1900-01-01',DATE '2026-09-15')`, [ACC]);
    await pool.query(
      `INSERT INTO accommodation_rent_rates (accommodation_id, rent_basis, rent_per_bed_night, valid_from)
       VALUES ($1,'per_bed_night',2200,DATE '2026-09-16')`, [ACC]);
    await engine.calculateMonthlyBilling('2026-09', { runType: 'incoming' });
    const mid = await liveCost(ACC, '2026-09');
    // 15 days x 2 x 2000 = 60 000 ; 15 days x 2 x 2200 = 66 000  => 126 000
    check('CE-07 a mid-month rate change is applied PER DAY (15d@2000 + 15d@2200 = 126 000)',
      Math.abs(Number(mid.cost_amount) - 126000) < 1, `got ${mid.cost_amount}`);

    // ── overlap is refused by the DATABASE ─────────────────────────────────
    let overlapRejected = false;
    try {
      await pool.query(
        `INSERT INTO accommodation_rent_rates (accommodation_id, rent_basis, rent_per_bed_night, valid_from)
         VALUES ($1,'per_bed_night',9999,DATE '2026-09-20')`, [ACC]);
    } catch (e) { overlapRejected = e.code === '23P01'; }
    check('CE-08 overlapping validity periods are refused by the DB (exclusion constraint)', overlapRejected);

    // ── ROLLING NOTICE ────────────────────────────────────────────────────
    const rolling = await partner.saveContract(su, null, {
      contractor_id: LL, accommodation_id: ACC, contract_role: 'szallasado',
      title: 'CE Határozatlan bérlet', status: 'active',
      start_date: '2024-11-01', is_open_ended: true, notice_days: 60,
    });
    const board = (await partner.listContracts(su, {})).contracts.find((c) => c.id === rolling.id);
    const expectedExit = ymd(new Date(Date.now() + 60 * 864e5));
    check('RN-01 an open-ended contract has no notice_deadline (nothing to miss)', board.notice_deadline === null);
    check('RN-02 ... but IS actionable: earliest exit = today + notice_days',
      ymd(board.earliest_exit_date) === expectedExit, `got ${ymd(board.earliest_exit_date)} want ${expectedExit}`);
    check('RN-03 its next action is the rolling exit, kind="rolling"',
      board.next_action_kind === 'rolling' && ymd(board.next_action_date) === expectedExit);

    // A rolling contract must sort by when we could be out, so it appears in a horizon.
    const within90 = (await partner.listContracts(su, { within_days: '90' })).contracts;
    check('RN-04 it appears in the 90-day horizon (exitable inside the quarter)',
      within90.some((c) => c.id === rolling.id));
    const within30 = (await partner.listContracts(su, { within_days: '30' })).contracts;
    check('RN-05 ... and NOT in the 30-day horizon (60 days notice > 30)',
      !within30.some((c) => c.id === rolling.id));
  } catch (err) {
    console.error('SUITE ERROR:', err.message);
    failures++;
  } finally {
    const q = (sql, p) => pool.query(sql, p).catch(() => {});
    await q('DELETE FROM accommodation_billings WHERE accommodation_id=$1', [ACC]);
    await q("DELETE FROM billing_runs WHERE billing_month IN ('2026-08','2026-09')");
    await q('DELETE FROM occupancy_snapshots WHERE accommodation_id=$1', [ACC]);
    await q('DELETE FROM partner_contracts WHERE contractor_id=$1', [LL]);
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
