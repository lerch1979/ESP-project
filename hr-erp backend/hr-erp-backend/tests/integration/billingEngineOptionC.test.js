// Option-C billing engine: per-client night rate → revenue; rent + expenses →
// cost; margin = revenue − cost. Seeds a full scenario and asserts the math.
const jwt = require('jsonwebtoken');
const { query } = require('../../src/database/connection');
const occ = require('../../src/services/occupancyTracking.service');
const engine = require('../../src/services/billingEngine.service');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-billing';

const MARK = 'ZBillOptC';
const MONTH = '2026-04';
const DATES = ['2026-04-10', '2026-04-11', '2026-04-12']; // 3 days
let clientId, accId, e1, e2, rateId, expId;

beforeAll(async () => {
  const c = await query(`INSERT INTO contractors (name, slug) VALUES ($1,$2) RETURNING id`,
    [`${MARK} Client`, `${MARK.toLowerCase()}-client`]);
  clientId = c.rows[0].id;
  // accommodation: monthly_rent 1,800,000 → /30 days /2 occupants = 30,000/occupant-night cost
  const a = await query(
    `INSERT INTO accommodations (name, capacity, monthly_rent, status, is_active)
     VALUES ($1, 4, 1800000, 'active', true) RETURNING id`, [`${MARK} House`]);
  accId = a.rows[0].id;
  const mkEmp = async (fn) => {
    const r = await query(
      `INSERT INTO employees (first_name, last_name, accommodation_id, billing_client_id)
       VALUES ($1, 'Tester', $2, $3) RETURNING id`, [fn, accId, clientId]);
    return r.rows[0].id;
  };
  e1 = await mkEmp(`${MARK}A`);
  e2 = await mkEmp(`${MARK}B`);
  // stay history: both present from 04-10 (open-ended)
  for (const eid of [e1, e2]) {
    await query(
      `INSERT INTO employee_accommodation_history (employee_id, accommodation_id, room_id, check_in_date, check_out_date)
       VALUES ($1, $2, NULL, '2026-04-10', NULL)`, [eid, accId]);
  }
  // client rate: 50,000 / person / night
  const rr = await query(
    `INSERT INTO client_night_rates (contractor_id, accommodation_id, rate_per_night, valid_from)
     VALUES ($1, NULL, 50000, '2026-01-01') RETURNING id`, [clientId]);
  rateId = rr.rows[0].id;
  // operating expenses for the month: 60,000
  const ex = await query(
    `INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount)
     VALUES ($1, $2, 'rezsi', 60000) RETURNING id`, [accId, MONTH]);
  expId = ex.rows[0].id;
  // generate snapshots for the 3 days (recompute from current config)
  for (const d of DATES) await occ.recordDailySnapshot(d);
});

afterAll(async () => {
  await query(`DELETE FROM accommodation_billings WHERE accommodation_id = $1`, [accId]).catch(() => {});
  await query(`DELETE FROM billing_runs WHERE billing_month = $1 AND notes LIKE '%test-optc%'`, [MONTH]).catch(() => {});
  await query(`DELETE FROM occupancy_snapshots WHERE accommodation_id = $1`, [accId]).catch(() => {});
  await query(`DELETE FROM employee_accommodation_history WHERE accommodation_id = $1`, [accId]).catch(() => {});
  await query(`DELETE FROM client_night_rates WHERE id = $1`, [rateId]).catch(() => {});
  await query(`DELETE FROM accommodation_expenses WHERE id = $1`, [expId]).catch(() => {});
  await query(`DELETE FROM employees WHERE id = ANY($1::uuid[])`, [[e1, e2]]).catch(() => {});
  await query(`DELETE FROM accommodations WHERE id = $1`, [accId]).catch(() => {});
  await query(`DELETE FROM contractors WHERE id = $1`, [clientId]).catch(() => {});
});

describe('billingEngine option C — revenue / cost / margin', () => {
  test('computes the billing row correctly', async () => {
    const summary = await engine.calculateMonthlyBilling(MONTH, { notes: 'test-optc' });
    expect(summary.status).toBe('calculated');

    const r = await query(
      `SELECT total_employee_days, total_amount, cost_amount, margin_amount, partner_contractor_id
         FROM accommodation_billings WHERE billing_run_id = $1 AND accommodation_id = $2`,
      [summary.run_id, accId]
    );
    expect(r.rows).toHaveLength(1);
    const b = r.rows[0];
    // 2 employees × 3 days = 6 employee-days
    expect(b.total_employee_days).toBe(6);
    // revenue = 6 × 50,000 = 300,000
    expect(Number(b.total_amount)).toBe(300000);
    // cost = rent (6 × 30,000 = 180,000) + expenses (60,000) = 240,000
    expect(Number(b.cost_amount)).toBe(240000);
    // margin = 300,000 − 240,000 = 60,000
    expect(Number(b.margin_amount)).toBe(60000);
    // billed to the worker's billing_client
    expect(b.partner_contractor_id).toBe(clientId);
  });
});
