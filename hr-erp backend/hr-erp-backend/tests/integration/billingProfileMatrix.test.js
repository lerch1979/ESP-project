// Full billing package (Phase 1): per-client profile (invoicing on/off · legal
// type) + per-rate basis (per_person/flat) + VAT (taxable/exempt). Seeds the whole
// matrix — company/private × taxable/exempt × flat/per_person × invoicing on/off —
// runs one monthly billing, and asserts invoice net/VAT/gross, payroll_handoff,
// intentional skip, and profit reconciliation. Real DB; self-cleaning.
const { query } = require('../../src/database/connection');
const occ = require('../../src/services/occupancyTracking.service');
const engine = require('../../src/services/billingEngine.service');
const profit = require('../../src/services/profit.service');

const TAG = 'ZBillMtx';
const MONTH = '1902-06'; // far-past + unique so parallel test files never collide

const bills = {};        // accId -> billing row
let summary, accIds = {}, prof = {};

async function cleanup() {
  await query(`DELETE FROM occupancy_snapshots WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)`, [TAG]);
  await query(`DELETE FROM employee_accommodation_history WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)`, [TAG]);
  await query(`DELETE FROM accommodation_billings WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM billing_runs WHERE billing_month=$1`, [MONTH]);
  await query(`DELETE FROM client_night_rates WHERE notes=$1`, [TAG]);
  await query(`DELETE FROM client_billing_profiles WHERE contractor_id IN (SELECT id FROM contractors WHERE slug LIKE $1)`, ['zbillmtx-%']);
  await query(`DELETE FROM employees WHERE last_name=$1`, [TAG]);
  await query(`DELETE FROM accommodations WHERE name LIKE $1`, [TAG + '%']);
  await query(`DELETE FROM contractors WHERE slug LIKE $1`, ['zbillmtx-%']);
}

beforeAll(async () => {
  await cleanup();
  const status = (await query(`SELECT id FROM employee_status_types WHERE slug='active'`)).rows[0]?.id || null;
  const mkClient = async (slug, legal, invoicing) => {
    const id = (await query(`INSERT INTO contractors (name,slug) VALUES ($1,$2) RETURNING id`, [`${TAG} ${slug}`, `zbillmtx-${slug}`])).rows[0].id;
    await query(`INSERT INTO client_billing_profiles (contractor_id,invoicing_enabled,legal_type) VALUES ($1,$2,$3)`, [id, invoicing, legal]);
    return id;
  };
  prof.CO = await mkClient('co', 'company', true);
  prof.PR = await mkClient('pr', 'private', true);
  prof.OFF = await mkClient('off', 'company', false);

  const mkAcc = async (n) => (await query(`INSERT INTO accommodations (name,capacity,monthly_rent,status,is_active) VALUES ($1,10,300000,'active',true) RETURNING id`, [`${TAG}-${n}`])).rows[0].id;
  const mkEmp = async (acc, client) => (await query(
    `INSERT INTO employees (first_name,last_name,status_id,accommodation_id,billing_client_id) VALUES ('E',$1,$2,$3,$4) RETURNING id`,
    [TAG, status, acc, client])).rows[0].id;
  const hist = (e, acc, ci, co) => query(`INSERT INTO employee_accommodation_history (employee_id,accommodation_id,room_id,check_in_date,check_out_date) VALUES ($1,$2,NULL,$3,$4)`, [e, acc, ci, co]);
  const rate = (client, acc, basis, amount, exempt) => query(
    `INSERT INTO client_night_rates (contractor_id,accommodation_id,billing_basis,rate_per_night,flat_amount,vat_rate,vat_exempt,valid_from,notes)
     VALUES ($1,$2,$3,$4,$5,0.27,$6,'1900-01-01',$7)`,
    [client, acc, basis, basis === 'per_person' ? amount : null, basis === 'flat' ? amount : null, exempt, TAG]);

  accIds.a1 = await mkAcc('1'); await rate(prof.CO, accIds.a1, 'per_person', 3500, false); for (let i = 0; i < 2; i++) await hist(await mkEmp(accIds.a1, prof.CO), accIds.a1, '1902-06-01', null);
  accIds.a2 = await mkAcc('2'); await rate(prof.CO, accIds.a2, 'flat', 900000, false); await hist(await mkEmp(accIds.a2, prof.CO), accIds.a2, '1902-06-10', '1902-06-25');
  accIds.a3 = await mkAcc('3'); await rate(prof.CO, accIds.a3, 'per_person', 3500, true); await hist(await mkEmp(accIds.a3, prof.CO), accIds.a3, '1902-06-01', null);
  accIds.a4 = await mkAcc('4'); await rate(prof.PR, accIds.a4, 'per_person', 4000, false); await hist(await mkEmp(accIds.a4, prof.PR), accIds.a4, '1902-06-01', null);
  accIds.a5 = await mkAcc('5'); await rate(prof.PR, accIds.a5, 'flat', 300000, true); await hist(await mkEmp(accIds.a5, prof.PR), accIds.a5, '1902-06-01', null);
  accIds.a6 = await mkAcc('6'); await rate(prof.OFF, accIds.a6, 'per_person', 5000, false); await hist(await mkEmp(accIds.a6, prof.OFF), accIds.a6, '1902-06-01', null);

  for (let d = 1; d <= 30; d++) await occ.recordDailySnapshot(`1902-06-${String(d).padStart(2, '0')}`);
  summary = await engine.calculateMonthlyBilling(MONTH, { notes: TAG });

  for (const [k, acc] of Object.entries(accIds)) {
    bills[k] = (await query(
      `SELECT total_amount AS net, vat_amount, gross_amount, margin_amount, payroll_handoff, calculation_details
         FROM accommodation_billings WHERE accommodation_id=$1 AND billing_month=$2`, [acc, MONTH])).rows[0];
  }
}, 30000);

afterAll(cleanup);

describe('billing package Phase 1 — basis × VAT × legal type × invoicing', () => {
  test('company · per_person · taxable → net/VAT/gross, not payroll', () => {
    expect(Number(bills.a1.net)).toBe(210000);        // 60 person-nights × 3500
    expect(Number(bills.a1.vat_amount)).toBe(56700);  // 27%
    expect(Number(bills.a1.gross_amount)).toBe(266700);
    expect(bills.a1.payroll_handoff).toBe(false);
  });
  test('company · flat · taxable → prorated by covered days', () => {
    expect(Number(bills.a2.net)).toBe(450000);        // 900000 × 15/30
    expect(Number(bills.a2.vat_amount)).toBe(121500);
    expect(Number(bills.a2.gross_amount)).toBe(571500);
  });
  test('company · per_person · áfamentes → 0 VAT, gross = net', () => {
    expect(Number(bills.a3.net)).toBe(105000);        // 30 × 3500
    expect(Number(bills.a3.vat_amount)).toBe(0);
    expect(Number(bills.a3.gross_amount)).toBe(105000);
  });
  test('private · per_person · taxable → payroll_handoff + marker', () => {
    expect(Number(bills.a4.net)).toBe(120000);        // 30 × 4000
    expect(Number(bills.a4.vat_amount)).toBe(32400);
    expect(bills.a4.payroll_handoff).toBe(true);
    expect(bills.a4.calculation_details.payroll_handoff_note).toMatch(/Bérszámfejtendő magánszemély/);
  });
  test('private · flat · áfamentes → full month, 0 VAT, payroll_handoff', () => {
    expect(Number(bills.a5.net)).toBe(300000);        // 300000 × 30/30
    expect(Number(bills.a5.vat_amount)).toBe(0);
    expect(bills.a5.payroll_handoff).toBe(true);
  });
  test('invoicing off → client skipped, no billing row', () => {
    expect(bills.a6).toBeUndefined();
    expect(summary.skipped_clients).toBeGreaterThanOrEqual(1);
  });
  test('profit dashboard reconciles with billing margin (VAT never in profit)', async () => {
    const rows = (await profit.getByAccommodation({ month: MONTH })).data.by_accommodation;
    for (const k of ['a1', 'a2', 'a3', 'a4', 'a5']) {
      const row = rows.find((x) => x.accommodation_id === accIds[k]);
      expect(Number(row.profit)).toBe(Number(bills[k].margin_amount));
    }
  });
});
