/**
 * Regression: a MONTH-TO-DATE draft must cover the same period on both sides.
 *
 * The per_bed_night REVENUE branch is day-driven — it bills the contracted block for
 * every day of the month, which is right at month end (the block is paid for whether or
 * not the beds are slept in). But a draft taken mid-month billed the days that had not
 * happened yet, while COST only ever counted days with snapshots. Taking a draft on the
 * 8th of a 31-day month therefore invoiced 31 days of revenue against 8 days of cost and
 * showed a wildly flattering margin.
 *
 * Now revenue stops at the last day the occupancy job actually covered. The cut-off is
 * "no data", NOT "nobody home": a covered day with zero occupants still bills the block,
 * because that is precisely what an occupancy guarantee is for (asserted below).
 *
 * Shape mirrors the live Sarród I. contract: 31 contracted beds, 18 residents,
 * used 3500 / empty 2400, cost 2000 per occupied bed-night.
 */
require('dotenv').config();
const { query } = require('../../src/database/connection');
const occ = require('../../src/services/occupancyTracking.service');
const engine = require('../../src/services/billingEngine.service');

const TAG = 'ZMonthToDate';
const MONTH = '1907-07';        // 31 days
const DAYS_IN_MONTH = 31;
const COVERED = 8;              // the occupancy job has only reached the 8th
const OCCUPANTS = 18;
const CONTRACTED = 31;
const RATE_USED = 3500;
const RATE_EMPTY = 2400;
const COST_PER_BED = 2000;

const ids = {};

async function cleanup() {
  await query(`DELETE FROM occupancy_snapshots WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)`, [TAG]);
  await query(`DELETE FROM employee_accommodation_history WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)`, [TAG]);
  await query(`DELETE FROM accommodation_billings WHERE billing_month=$1`, [MONTH]);
  await query(`DELETE FROM billing_runs WHERE billing_month=$1`, [MONTH]);
  await query(`DELETE FROM client_night_rates WHERE notes=$1`, [TAG]);
  await query(`DELETE FROM employees WHERE last_name=$1`, [TAG]);
  await query(`DELETE FROM accommodations WHERE name LIKE $1`, [TAG + '%']);
  await query(`DELETE FROM client_billing_profiles WHERE contractor_id IN (SELECT id FROM contractors WHERE slug=$1)`, ['zmtd-client']);
  await query(`DELETE FROM contractors WHERE slug=$1`, ['zmtd-client']);
}

const bill = async () => (await query(
  `SELECT ab.* FROM accommodation_billings ab JOIN billing_runs br ON br.id=ab.billing_run_id
    WHERE ab.billing_month=$1 AND ab.accommodation_id=$2 AND br.status<>'cancelled'`,
  [MONTH, ids.acc])).rows[0];

beforeAll(async () => {
  await cleanup();
  const status = (await query(`SELECT id FROM employee_status_types WHERE slug='active'`)).rows[0]?.id || null;

  ids.client = (await query(`INSERT INTO contractors (name,slug) VALUES ($1,$2) RETURNING id`, [`${TAG} Client`, 'zmtd-client'])).rows[0].id;
  await query(`INSERT INTO client_billing_profiles (contractor_id,invoicing_enabled,legal_type) VALUES ($1,true,'company')`, [ids.client]);

  ids.acc = (await query(
    `INSERT INTO accommodations (name,capacity,status,is_active,rent_basis,rent_per_bed_night)
     VALUES ($1,40,'occupied',true,'per_bed_night',$2) RETURNING id`, [`${TAG}-Site`, COST_PER_BED])).rows[0].id;

  const emps = (await query(
    `INSERT INTO employees (first_name,last_name,status_id,accommodation_id,billing_client_id)
     SELECT 'E'||g,$1,$2,$3,$4 FROM generate_series(1,$5) g RETURNING id`,
    [TAG, status, ids.acc, ids.client, OCCUPANTS])).rows.map((r) => r.id);
  // Bounded stay: an open-ended check_out makes a resident cover EVERY later date, so a
  // parallel suite's recordDailySnapshot sweeps this accommodation into its own billing
  // run — and then trips the accommodation FK when this suite's afterAll deletes it.
  await query(
    `INSERT INTO employee_accommodation_history (employee_id,accommodation_id,check_in_date,check_out_date)
     SELECT id,$2,$3::date,$4::date FROM UNNEST($1::uuid[]) id`, [emps, ids.acc, `${MONTH}-01`, '1907-08-01']);

  await query(
    `INSERT INTO client_night_rates (contractor_id,accommodation_id,billing_basis,rate_used,rate_empty,
       occupancy_floor_pct,contracted_beds,vat_rate,vat_exempt,currency,valid_from,notes)
     VALUES ($1,$2,'per_bed_night',$3,$4,0,$5,0.27,false,'HUF','1900-01-01',$6)`,
    [ids.client, ids.acc, RATE_USED, RATE_EMPTY, CONTRACTED, TAG]);

  // A second, unrelated site that stays occupied all 8 days. The engine reads "how far
  // did the occupancy job get" from the last snapshot date across the WHOLE month, so a
  // realistic month needs at least one site that is still populated — otherwise an empty
  // estate is indistinguishable from a cron that never ran (see the note in the engine).
  ids.keepAlive = (await query(
    `INSERT INTO accommodations (name,capacity,status,is_active) VALUES ($1,5,'occupied',true) RETURNING id`,
    [`${TAG}-KeepAlive`])).rows[0].id;
  const ka = (await query(
    `INSERT INTO employees (first_name,last_name,status_id,accommodation_id) VALUES ('K',$1,$2,$3) RETURNING id`,
    [TAG, status, ids.keepAlive])).rows[0].id;
  await query(
    `INSERT INTO employee_accommodation_history (employee_id,accommodation_id,check_in_date,check_out_date)
     VALUES ($1,$2,$3::date,$4::date)`, [ka, ids.keepAlive, `${MONTH}-01`, '1907-08-01']);

  // The occupancy job has only run for days 1..8 — the month is still in progress.
  for (let d = 1; d <= COVERED; d++) await occ.recordDailySnapshot(`${MONTH}-${String(d).padStart(2, '0')}`);
  ids.summary = await engine.calculateMonthlyBilling(MONTH, { notes: TAG });
}, 60000);

afterAll(cleanup);

describe('a mid-month draft bills the same number of days on both sides', () => {
  test('the run reports itself as month-to-date, 8 of 31 days', () => {
    expect(ids.summary.billable_days).toBe(COVERED);
    expect(ids.summary.days_in_month).toBe(DAYS_IN_MONTH);
    expect(ids.summary.month_to_date).toBe(true);
  });

  test('REVENUE covers 8 days, not 31', async () => {
    const b = await bill();
    const pb = b.calculation_details.per_bed;
    // per night: 18 occupied × 3500 + 13 empty × 2400 = 94 200
    const perNight = OCCUPANTS * RATE_USED + (CONTRACTED - OCCUPANTS) * RATE_EMPTY;
    expect(perNight).toBe(94200);
    expect(pb.days_billed).toBe(COVERED);
    expect(pb.month_to_date).toBe(true);
    expect(Number(b.total_amount)).toBeCloseTo(perNight * COVERED, 2);      // 753 600
    // the bug: 31 days would have been 2 920 200
    expect(Number(b.total_amount)).not.toBeCloseTo(perNight * DAYS_IN_MONTH, 0);
  });

  test('COST covers the same 8 days', async () => {
    const b = await bill();
    expect(Number(b.cost_amount)).toBeCloseTo(OCCUPANTS * COST_PER_BED * COVERED, 2);  // 288 000
    expect(b.calculation_details.rent_bed_nights).toBe(OCCUPANTS * COVERED);           // 144
  });

  test('bed-nights on both sides describe the same 8 nights', async () => {
    const d = (await bill()).calculation_details;
    expect(d.per_bed.occupied_bed_nights).toBe(OCCUPANTS * COVERED);   // revenue side: 144
    expect(d.rent_bed_nights).toBe(OCCUPANTS * COVERED);               // cost side:    144
  });

  test('margin is the 8-day figure, not a 31-day revenue against an 8-day cost', async () => {
    const b = await bill();
    expect(Number(b.margin_amount)).toBeCloseTo(753600 - 288000, 2);   // 465 600
  });

  test('a COVERED day with zero occupants still bills the guaranteed block', async () => {
    // Everyone checks out of the site under test on the 5th; days 5..8 are still covered
    // by the job (the keep-alive site keeps producing snapshots) but this site is empty.
    await query(
      `UPDATE employee_accommodation_history SET check_out_date=$2::date
        WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)
          AND accommodation_id = $3`, [TAG, `${MONTH}-05`, ids.acc]);
    for (let d = 1; d <= COVERED; d++) await query(
      `DELETE FROM occupancy_snapshots WHERE snapshot_date=$1::date AND accommodation_id=$2`,
      [`${MONTH}-${String(d).padStart(2, '0')}`, ids.acc]);
    for (let d = 1; d <= COVERED; d++) await occ.recordDailySnapshot(`${MONTH}-${String(d).padStart(2, '0')}`);
    await engine.calculateMonthlyBilling(MONTH, { notes: `${TAG} empty-tail` });

    const b = await bill();
    const pb = b.calculation_details.per_bed;
    // Days 1-4 occupied (18), days 5-8 empty (0) — but the site's rate is still valid,
    // so the block is billed on all 8: 4×94 200 + 4×(31×2400) = 376 800 + 297 600.
    expect(pb.days_billed).toBe(COVERED);
    expect(Number(b.total_amount)).toBeCloseTo(4 * 94200 + 4 * (CONTRACTED * RATE_EMPTY), 2);
    // Cost follows real occupancy only — 4 days × 18.
    expect(Number(b.cost_amount)).toBeCloseTo(4 * OCCUPANTS * COST_PER_BED, 2);
  });
});
