/**
 * Regression: the COST side — per-accommodation rent basis + the utilities matrix (mig 142).
 *
 * The headline case is FLAT-01: a site with rent R and N occupants spread across M rooms
 * must allocate exactly R for the month — NOT R×M. Migration 112 grouped the allocation by
 * (accommodation, room) and divided by room_occupant_count, so a site's rent was counted
 * once per occupied room; on prod that would have charged Sopronhorpács 31× its rent the
 * moment a rent was entered. Rooms are still recorded on every snapshot (occupancy
 * analytics need them) — they just no longer divide the money.
 *
 * Real DB, self-cleaning, far-past sentinel month.
 */
require('dotenv').config();
const { query } = require('../../src/database/connection');
const occ = require('../../src/services/occupancyTracking.service');
const engine = require('../../src/services/billingEngine.service');
const profit = require('../../src/services/profit.service');

const TAG = 'ZCostModel';
const MONTH = '1905-04';          // 30 days
const DAYS = 30;
const D1 = `${MONTH}-01`;

const ids = {};
let summary;

async function cleanup() {
  await query(`DELETE FROM occupancy_snapshots WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)`, [TAG]);
  await query(`DELETE FROM employee_accommodation_history WHERE employee_id IN (SELECT id FROM employees WHERE last_name=$1)`, [TAG]);
  await query(`DELETE FROM accommodation_billings WHERE billing_month=$1`, [MONTH]);
  await query(`DELETE FROM billing_runs WHERE billing_month=$1`, [MONTH]);
  await query(`DELETE FROM accommodation_expenses WHERE notes=$1`, [TAG]);
  await query(`DELETE FROM client_night_rates WHERE notes=$1`, [TAG]);
  await query(`DELETE FROM accommodation_utility_lines WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM employees WHERE last_name=$1`, [TAG]);
  await query(`DELETE FROM accommodation_rooms WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM accommodations WHERE name LIKE $1`, [TAG + '%']);
  await query(`DELETE FROM client_billing_profiles WHERE contractor_id IN (SELECT id FROM contractors WHERE slug LIKE $1)`, ['zcostmodel-%']);
  await query(`DELETE FROM contractors WHERE slug LIKE $1`, ['zcostmodel-%']);
}

const bill = async (accId) => (await query(
  `SELECT ab.* FROM accommodation_billings ab JOIN billing_runs br ON br.id=ab.billing_run_id
    WHERE ab.billing_month=$1 AND ab.accommodation_id=$2 AND br.status<>'cancelled'`, [MONTH, accId])).rows;

beforeAll(async () => {
  await cleanup();
  const status = (await query(`SELECT id FROM employee_status_types WHERE slug='active'`)).rows[0]?.id || null;

  ids.client = (await query(
    `INSERT INTO contractors (name,slug) VALUES ($1,$2) RETURNING id`, [`${TAG} Megbízó`, 'zcostmodel-a'])).rows[0].id;
  await query(`INSERT INTO client_billing_profiles (contractor_id,invoicing_enabled,legal_type) VALUES ($1,true,'company')`, [ids.client]);

  const mkAcc = async (name, cfg) => (await query(
    `INSERT INTO accommodations (name,capacity,status,is_active,rent_basis,rent_amount,rent_per_bed_night,monthly_rent)
     VALUES ($1,100,'occupied',true,$2,$3,$4,$5) RETURNING id`,
    [`${TAG}-${name}`, cfg.basis, cfg.rent ?? null, cfg.perBed ?? null, cfg.legacyRent ?? null])).rows[0].id;

  const mkRooms = async (acc, n, beds) => {
    const out = [];
    for (let i = 1; i <= n; i++) {
      out.push((await query(
        `INSERT INTO accommodation_rooms (accommodation_id,room_number,beds,is_active) VALUES ($1,$2,$3,true) RETURNING id`,
        [acc, `${TAG}-${i}`, beds])).rows[0].id);
    }
    return out;
  };
  const mkEmps = async (acc, count, roomId) => {
    const r = await query(
      `INSERT INTO employees (first_name,last_name,status_id,accommodation_id,room_id,billing_client_id)
       SELECT 'E'||g,$1,$2,$3,$4,$5 FROM generate_series(1,$6) g RETURNING id`,
      [TAG, status, acc, roomId, ids.client, count]);
    const empIds = r.rows.map((x) => x.id);
    // Bounded stay (see note in billingMonthToDate): an open-ended check_out would make
    // these residents appear in every later month and collide with parallel suites.
    await query(
      `INSERT INTO employee_accommodation_history (employee_id,accommodation_id,room_id,check_in_date,check_out_date)
       SELECT id,$2,$3,$4::date,$5::date FROM UNNEST($1::uuid[]) id`, [empIds, acc, roomId, D1, '1905-05-01']);
    return empIds;
  };
  const rate = (acc) => query(
    `INSERT INTO client_night_rates (contractor_id,accommodation_id,billing_basis,rate_per_night,vat_rate,valid_from,notes)
     VALUES ($1,$2,'per_person',1000,0.27,'1900-01-01',$3)`, [ids.client, acc, TAG]);

  // ── FLAT: rent 600 000, 12 occupants spread across 4 rooms (M=4) ──
  // The whole point: the month must allocate 600 000, not 600 000 × 4.
  ids.flat = await mkAcc('Flat', { basis: 'flat', rent: 600000 });
  const flatRooms = await mkRooms(ids.flat, 4, 3);
  for (const r of flatRooms) await mkEmps(ids.flat, 3, r);
  await rate(ids.flat);

  // ── PER-BED: 10 occupants × 800 Ft/bed/night × 30 nights = 240 000 ──
  ids.perBed = await mkAcc('PerBed', { basis: 'per_bed_night', perBed: 800 });
  const pbRooms = await mkRooms(ids.perBed, 2, 5);
  for (const r of pbRooms) await mkEmps(ids.perBed, 5, r);
  await rate(ids.perBed);

  // ── MIXED: flat 300 000 + utility lines we pay ──
  // áram 50 000 (we pay, passed through 100%) · víz 20 000 (we pay, not passed through)
  // · gáz 40 000 (szállásadó pays → recorded expense is a config mismatch, still real money)
  ids.mixed = await mkAcc('Mixed', { basis: 'mixed', rent: 300000 });
  const mxRooms = await mkRooms(ids.mixed, 2, 3);
  for (const r of mxRooms) await mkEmps(ids.mixed, 3, r);
  await rate(ids.mixed);
  const util = (line, who, pass, pct) => query(
    `INSERT INTO accommodation_utility_lines (accommodation_id,line,who_pays,contract_holder,passthrough,passthrough_pct)
     VALUES ($1,$2,$3,'szallasado',$4,$5)`, [ids.mixed, line, who, pass, pct]);
  await util('aram', 'mi', true, 100);
  await util('viz_csatorna', 'mi', false, 100);
  await util('gaz', 'szallasado', false, 100);
  const exp = (line, amount) => query(
    `INSERT INTO accommodation_expenses (accommodation_id,billing_month,category,amount,currency,utility_line,notes)
     VALUES ($1,$2,'rezsi',$3,'HUF',$4,$5)`, [ids.mixed, MONTH, amount, line, TAG]);
  await exp('aram', 50000);
  await exp('viz_csatorna', 20000);
  await exp('gaz', 40000);

  // ── LEGACY: no rent_basis, only the old monthly_rent → must behave as flat ──
  ids.legacy = await mkAcc('Legacy', { basis: null, legacyRent: 310000 });
  const lgRooms = await mkRooms(ids.legacy, 5, 2);
  for (const r of lgRooms) await mkEmps(ids.legacy, 2, r);
  await rate(ids.legacy);

  for (let d = 1; d <= DAYS; d++) await occ.recordDailySnapshot(`${MONTH}-${String(d).padStart(2, '0')}`);
  summary = await engine.calculateMonthlyBilling(MONTH, { notes: TAG });
}, 60000);

afterAll(cleanup);

describe('FLAT — a site rent is allocated ONCE, never multiplied by occupied rooms', () => {
  test('rent 600 000 · 12 occupants · 4 rooms → cost is exactly 600 000 (not 2 400 000)', async () => {
    const rows = await bill(ids.flat);
    expect(rows).toHaveLength(1);
    const d = rows[0].calculation_details;
    expect(Number(rows[0].cost_amount)).toBeCloseTo(600000, 2);
    expect(d.rent_basis).toBe('flat');
    expect(d.rent_site_total).toBeCloseTo(600000, 2);
    // The old per-room formula, kept in the details purely as a cross-check, must NOT be
    // what we charged — this is the exact shape of the bug.
    expect(Number(rows[0].cost_amount)).not.toBeCloseTo(600000 * 4, 0);
  });

  test('rooms are still recorded on the snapshots (analytics keep working)', async () => {
    const r = await query(
      `SELECT COUNT(*)::int total, COUNT(room_id)::int with_room, COUNT(DISTINCT room_id)::int rooms
         FROM occupancy_snapshots WHERE accommodation_id=$1 AND snapshot_date=$2::date`, [ids.flat, D1]);
    expect(r.rows[0].total).toBe(12);
    expect(r.rows[0].with_room).toBe(12);
    expect(r.rows[0].rooms).toBe(4);
  });

  test('the snapshot share itself is site-level, so it sums to one day of rent', async () => {
    const r = await query(
      `SELECT SUM(per_occupant_daily_share)::numeric s FROM occupancy_snapshots
        WHERE accommodation_id=$1 AND snapshot_date=$2::date`, [ids.flat, D1]);
    expect(Number(r.rows[0].s)).toBeCloseTo(600000 / DAYS, 2);
  });
});

describe('PER-BED — occupied beds × rate × nights', () => {
  test('10 occupants × 800 × 30 = 240 000', async () => {
    const rows = await bill(ids.perBed);
    const d = rows[0].calculation_details;
    expect(Number(rows[0].cost_amount)).toBeCloseTo(240000, 2);
    expect(d.rent_basis).toBe('per_bed_night');
    expect(d.rent_bed_nights).toBe(10 * DAYS);
    expect(Number(d.rent_rate_used)).toBe(800);
  });
});

describe('MIXED — flat rent plus the utility lines we pay', () => {
  test('cost = flat 300 000 + all recorded expenses (110 000) = 410 000', async () => {
    const rows = await bill(ids.mixed);
    const d = rows[0].calculation_details;
    expect(d.rent_basis).toBe('mixed');
    expect(d.rent_cost).toBeCloseTo(300000, 2);
    expect(d.expense_cost).toBeCloseTo(110000, 2);
    expect(Number(rows[0].cost_amount)).toBeCloseTo(410000, 2);
  });

  test('only the passthrough line is re-billed: áram 50 000 at 100%', async () => {
    const d = (await bill(ids.mixed))[0].calculation_details;
    expect(d.utility_passthrough_net).toBeCloseTo(50000, 2);
    expect(d.utility_passthrough_lines.map((l) => l.line)).toEqual(['aram']);
    expect(summary.total_utility_passthrough).toBeCloseTo(50000, 2);
  });

  test('a line the matrix says the szállásadó pays is flagged, never silently dropped', async () => {
    const d = (await bill(ids.mixed))[0].calculation_details;
    const gaz = d.utility_config_mismatches.find((m) => m.line === 'gaz');
    expect(gaz).toBeDefined();
    expect(gaz.reason).toBe('expense_recorded_but_szallasado_pays');
    expect(summary.cost_config_mismatches.length).toBeGreaterThan(0);
  });

  test('the pass-through is margin-neutral at 100% share', async () => {
    // revenue = housing (6 × 30 × 1000 = 180 000) + áram 50 000
    // cost    = rent 300 000 + expenses 110 000
    // margin  = 230 000 − 410 000 = −180 000; without the pass-through it would be
    // 180 000 − 410 000 = −230 000, i.e. exactly 50 000 worse. Neutral.
    const row = (await bill(ids.mixed))[0];
    expect(Number(row.total_amount)).toBeCloseTo(230000, 2);
    expect(Number(row.margin_amount)).toBeCloseTo(-180000, 2);
    const withoutPassthrough = Number(row.total_amount) - row.calculation_details.utility_passthrough_net;
    expect(withoutPassthrough - Number(row.cost_amount)).toBeCloseTo(-230000, 2);
  });
});

describe('LEGACY — no basis set yet behaves as flat over the old monthly_rent', () => {
  test('rent 310 000 · 10 occupants · 5 rooms → 310 000, not 1 550 000', async () => {
    const rows = await bill(ids.legacy);
    const d = rows[0].calculation_details;
    expect(d.rent_basis).toBe('flat');
    expect(Number(rows[0].cost_amount)).toBeCloseTo(310000, 2);
  });
});

describe('the profit dashboard reconciles under all three bases', () => {
  test('profit = income − (expenses + rent) ≡ billing margin, per site', async () => {
    const rows = (await profit.getByAccommodation({ month: MONTH })).data.by_accommodation;
    for (const key of ['flat', 'perBed', 'mixed', 'legacy']) {
      const row = rows.find((r) => r.accommodation_id === ids[key]);
      expect(row).toBeDefined();
      const b = (await bill(ids[key]))[0];
      expect(Number(row.profit)).toBeCloseTo(Number(b.margin_amount), 2);
      expect(Number(row.profit)).toBeCloseTo(row.income - row.expenses.total - row.rent, 2);
    }
  });
});
