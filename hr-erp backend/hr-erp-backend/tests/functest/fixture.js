/**
 * FUNCTEST FIXTURE — the deterministic, hand-checkable world every scenario asserts against.
 *
 * Layered ON TOP of the base sandbox seed (`npm run sandbox:reset`), never replacing it:
 * the base seed supplies the messy 310-employee consolidation dataset that CONS-05 proves
 * hard constraints over; this fixture supplies the surgical, arithmetic-exact cases.
 *
 * Everything it creates is tagged `FT` / `functest` and is dropped + rebuilt on each run,
 * so the suite is re-runnable and deterministic — no clock, no RNG, no month-of-today.
 *
 * WHY THE MONTH IS 1903-06
 *   A far-past 30-day month can never collide with real snapshots, with the other jest
 *   suites' sentinel months (1902-06), or with a cron that happens to fire. 30 days makes
 *   every per-night figure divide cleanly, which is what "hand-checkable" means here.
 *
 * WHY billing employees have room_id = NULL
 *   occupancy_snapshots groups NULL-room occupants of an accommodation together, so
 *   per_occupant_daily_share = monthly_rent / 30 / headcount. Every rent below is chosen
 *   to make that EXACTLY 1000 or 4000 Ft/day — so rent cost, margin and the profit
 *   dashboard all reconcile to round numbers you can check on paper. It also keeps these
 *   employees out of the consolidation engine (which only considers room_id NOT NULL),
 *   so the billing fixture cannot perturb the consolidation scenarios.
 */
const { query, pool } = require('../../src/database/connection');

// Teardown deliberately fires statements that may not apply (a table absent on a lagging
// schema, a column that moved). Those go through the RAW pool, not the logging `query`
// wrapper, so a tolerated no-op doesn't print a scary "Lekérdezési hiba" after a green
// run. Set FUNCTEST_DEBUG=1 to see what was skipped.
const skipped = [];
async function tolerant(sql, params) {
  try { return await pool.query(sql, params); }
  catch (e) { skipped.push(`${e.code} ${e.message.split('\n')[0]} :: ${sql.slice(0, 90)}`); return null; }
}

const TAG = 'FT';
const MONTH = '1903-06';
const DAYS = 30;
const D1 = `${MONTH}-01`;
const PW = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; // bcrypt("sandbox123")

const day = (n) => `${MONTH}-${String(n).padStart(2, '0')}`;
const localDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const one = async (sql, p) => (await query(sql, p)).rows[0];
const all = async (sql, p) => (await query(sql, p)).rows;

/* ────────────────────────────── teardown ────────────────────────────── */

/**
 * Remove everything a previous functest run created. Ordered by FK dependency.
 * Scoped exclusively to FT-tagged rows + the sentinel month — the base sandbox
 * seed survives untouched (the consolidation scenarios need it).
 */
/**
 * `users` is referenced by ~100 FK columns. Rather than hard-code a delete order that
 * rots the moment a table is added, ask the catalog which columns point at users.id and
 * clear the FT-owned rows from each. Two passes settle the FKs those tables have among
 * themselves; anything still referenced surfaces as a real error on the final delete.
 */
async function purgeUserReferences() {
  const fks = await all(
    `SELECT tc.table_name AS t, kcu.column_name AS c
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'users' AND ccu.column_name = 'id'
        AND tc.table_name <> 'users'`);
  const sub = `SELECT id FROM users WHERE email LIKE '%@functest.local'`;
  let pending = fks;
  for (let pass = 0; pass < 2 && pending.length; pass++) {
    const failed = [];
    for (const { t, c } of pending) {
      try { await pool.query(`DELETE FROM "${t}" WHERE "${c}" IN (${sub})`); }
      catch (e) { if (e.code !== '42P01') failed.push({ t, c, e }); }
    }
    pending = failed;
  }
  for (const { t, c, e } of pending) skipped.push(`${e.code} ${t}.${c}: ${e.message.split('\n')[0]}`);
}

async function teardown() {
  skipped.length = 0;
  await purgeUserReferences();
  const stmts = [
    `DELETE FROM occupancy_snapshots WHERE TO_CHAR(snapshot_date,'YYYY-MM') = '${MONTH}'`,
    `DELETE FROM employee_accommodation_history WHERE employee_id IN (SELECT id FROM employees WHERE last_name = '${TAG}')`,
    `DELETE FROM accommodation_billings WHERE billing_month = '${MONTH}'`,
    `DELETE FROM billing_runs WHERE billing_month = '${MONTH}'`,
    `DELETE FROM compensation_residents WHERE compensation_id IN (SELECT id FROM compensations WHERE compensation_number LIKE '${TAG}-%')`,
    `DELETE FROM compensations WHERE compensation_number LIKE '${TAG}-%'`,
    `DELETE FROM compensations WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE '${TAG} %')`,
    `DELETE FROM room_inspections WHERE inspection_id IN (SELECT id FROM inspections WHERE inspection_number LIKE '${TAG}-%')`,
    `DELETE FROM inspections WHERE inspection_number LIKE '${TAG}-%'`,
    `DELETE FROM accommodation_expenses WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE '${TAG} %')`,
    `DELETE FROM timesheets WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE '${TAG} %')`,
    `DELETE FROM tasks WHERE title LIKE '${TAG} %'`,
    `DELETE FROM expiry_alert_log WHERE entity_id IN (SELECT id::text FROM employees WHERE last_name = '${TAG}')`,
    `DELETE FROM employee_documents WHERE employee_id IN (SELECT id FROM employees WHERE last_name = '${TAG}')`,
    `DELETE FROM anonymization_log WHERE employee_id IN (SELECT id FROM employees WHERE last_name = '${TAG}')`,
    `DELETE FROM agent_suggestions WHERE agent_name = 'room_consolidation'`,
    `DELETE FROM consolidation_runs`,
    `DELETE FROM entity_status_history WHERE entity_id IN (SELECT id FROM employees WHERE last_name = '${TAG}')`,
    `DELETE FROM scheduled_report_runs WHERE scheduled_report_id IN (SELECT id FROM scheduled_reports WHERE name LIKE '${TAG} %')`,
    `DELETE FROM scheduled_reports WHERE name LIKE '${TAG} %'`,
    `DELETE FROM employees WHERE last_name = '${TAG}'`,
    `DELETE FROM accommodation_rooms WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE '${TAG} %')`,
    `DELETE FROM accommodation_contractors WHERE accommodation_id IN (SELECT id FROM accommodations WHERE name LIKE '${TAG} %')`,
    `DELETE FROM accommodations WHERE name LIKE '${TAG} %'`,
    `DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@functest.local')`,
    `DELETE FROM users WHERE email LIKE '%@functest.local'`,
    `DELETE FROM client_night_rates WHERE notes = '${TAG}'`,
    `DELETE FROM client_billing_profiles WHERE contractor_id IN (SELECT id FROM contractors WHERE slug LIKE 'ft-%')`,
    `DELETE FROM contractor_roles WHERE contractor_id IN (SELECT id FROM contractors WHERE slug LIKE 'ft-%')`,
    `DELETE FROM contractors WHERE slug LIKE 'ft-%'`,
  ];
  for (const s of stmts) await tolerant(s);
  if (process.env.FUNCTEST_DEBUG && skipped.length) {
    console.log(`  [teardown] ${skipped.length} statement(s) skipped:`);
    for (const s of skipped) console.log(`    · ${s}`);
  }
  return skipped.slice();
}

/* ────────────────────────────── builders ────────────────────────────── */

let ACTIVE_STATUS = null;

async function mkContractor(slug, name) {
  return (await one(
    `INSERT INTO contractors (name, slug, email, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
    [`${TAG} ${name}`, `ft-${slug}`, `${slug}@functest.local`])).id;
}

async function mkProfile(contractorId, { invoicing = true, legal = 'company' } = {}) {
  await query(
    `INSERT INTO client_billing_profiles (contractor_id, invoicing_enabled, legal_type)
     VALUES ($1,$2,$3) ON CONFLICT (contractor_id) DO UPDATE SET invoicing_enabled=EXCLUDED.invoicing_enabled, legal_type=EXCLUDED.legal_type`,
    [contractorId, invoicing, legal]);
}

async function mkAccommodation(name, { rent = null, contractorId = null, capacity = 200 } = {}) {
  return (await one(
    `INSERT INTO accommodations (name, address, type, capacity, current_contractor_id, status, monthly_rent, is_active)
     VALUES ($1,$2,'worker_hostel',$3,$4,'occupied',$5,true) RETURNING id`,
    [`${TAG} ${name}`, 'Functest u. 1.', capacity, contractorId, rent])).id;
}

async function mkRooms(accId, specs) {
  const out = [];
  for (const [i, beds] of specs.entries()) {
    out.push((await one(
      `INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, is_active)
       VALUES ($1,$2,0,$3,'standard',true) RETURNING id`,
      [accId, `${TAG}-${String(i + 1).padStart(2, '0')}`, beds])).id);
  }
  return out;
}

/**
 * Bulk-create `count` employees in one statement (400+ rows across the fixture —
 * one INSERT per employee would dominate the suite's runtime).
 */
async function mkEmployees(accId, count, opts = {}) {
  const { client = null, gender = 'male', shift = null, workplace = null, roomId = null, contractorId = null, prefix = 'E' } = opts;
  const rows = await all(
    `INSERT INTO employees (first_name, last_name, gender, workplace, shift_schedule, status_id,
                            contractor_id, accommodation_id, room_id, billing_client_id)
     SELECT $1 || g, $2, $3, $4, $5, $6, $7, $8, $9, $10 FROM generate_series(1,$11) g
     RETURNING id`,
    [prefix, TAG, gender, workplace, shift, ACTIVE_STATUS, contractorId, accId, roomId, client, count]);
  return rows.map((r) => r.id);
}

/** Occupancy history — the ONLY feed occupancy_snapshots reads (see DATA-01). */
async function mkHistory(empIds, accId, { roomId = null, checkIn = D1, checkOut = null } = {}) {
  await query(
    `INSERT INTO employee_accommodation_history (employee_id, accommodation_id, room_id, check_in_date, check_out_date)
     SELECT id, $2, $3, $4::date, $5::date FROM UNNEST($1::uuid[]) id`,
    [empIds, accId, roomId, checkIn, checkOut]);
}

async function mkRate(clientId, accId, fields) {
  const f = {
    billing_basis: 'per_person', rate_per_night: null, flat_amount: null, vat_rate: 0.27, vat_exempt: false,
    rate_used: null, rate_empty: 0, occupancy_floor_pct: 0, contracted_beds: null, ...fields,
  };
  await query(
    `INSERT INTO client_night_rates (contractor_id, accommodation_id, billing_basis, rate_per_night, flat_amount,
       vat_rate, vat_exempt, rate_used, rate_empty, occupancy_floor_pct, contracted_beds, currency, valid_from, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'HUF','1900-01-01',$12)`,
    [clientId, accId, f.billing_basis, f.rate_per_night, f.flat_amount, f.vat_rate, f.vat_exempt,
     f.rate_used, f.rate_empty, f.occupancy_floor_pct, f.contracted_beds, TAG]);
}

async function mkUser(slug, { contractorId, roleSlug, first = 'FT', last = 'User' }) {
  const email = `${slug}@functest.local`;
  const u = await one(
    `INSERT INTO users (email, password_hash, first_name, last_name, contractor_id, is_active, is_email_verified)
     VALUES ($1,$2,$3,$4,$5,true,true) RETURNING id`, [email, PW, first, last, contractorId]);
  if (roleSlug) {
    const role = await one(`SELECT id FROM roles WHERE slug=$1`, [roleSlug]);
    if (!role) throw new Error(`fixture: role "${roleSlug}" not found`);
    await query(`INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1,$2,$3)`, [u.id, role.id, contractorId]);
    await query(`UPDATE users SET role_id=$2 WHERE id=$1`, [u.id, role.id]);
  }
  return { id: u.id, email, roleSlug };
}

/* ────────────────────────────── the world ────────────────────────────── */

async function build() {
  ACTIVE_STATUS = (await one(`SELECT id FROM employee_status_types WHERE slug='active'`)).id;
  const ids = { month: MONTH, days: DAYS, tag: TAG, acc: {}, client: {}, emp: {}, user: {}, room: {}, comp: {} };

  /* ── billing clients (megbízók) + profiles ─────────────────────────── */
  ids.client.A = await mkContractor('megbizo-a', 'Megbízó A');            // company · taxable
  ids.client.B = await mkContractor('megbizo-b', 'Megbízó B');            // company · taxable (2nd on a shared site)
  ids.client.PRIV = await mkContractor('megbizo-priv', 'Megbízó Magánszemély');
  ids.client.OFF = await mkContractor('megbizo-off', 'Megbízó Nem Számlázott');
  ids.client.BED = await mkContractor('megbizo-bed', 'Megbízó Ágyblokk');
  ids.client.BED2 = await mkContractor('megbizo-bed2', 'Megbízó Ágyblokk 2');
  ids.client.LANDLORD = await mkContractor('szallasado', 'Szállásadó');
  await mkProfile(ids.client.A); await mkProfile(ids.client.B);
  await mkProfile(ids.client.PRIV, { legal: 'private' });
  await mkProfile(ids.client.OFF, { invoicing: false });
  await mkProfile(ids.client.BED); await mkProfile(ids.client.BED2);

  /* ── tenants for the isolation scenarios ───────────────────────────── */
  ids.client.T1 = await mkContractor('tenant-1', 'Tenant One');
  ids.client.T2 = await mkContractor('tenant-2', 'Tenant Two');

  /**
   * One accommodation + N employees + full-month history, in one call.
   * `rent` is always chosen so monthly_rent / 30 / headcount is an integer.
   */
  const site = async (key, name, count, opts = {}) => {
    const accId = await mkAccommodation(name, { rent: opts.rent ?? null, contractorId: ids.client.LANDLORD, capacity: Math.max(count, 10) });
    ids.acc[key] = accId;
    if (opts.rooms) ids.room[key] = await mkRooms(accId, opts.rooms);
    const emps = count > 0 ? await mkEmployees(accId, count, { client: opts.client, prefix: opts.prefix || key }) : [];
    ids.emp[key] = emps;
    if (emps.length) await mkHistory(emps, accId, { checkIn: opts.checkIn || D1, checkOut: opts.checkOut || null });
    return accId;
  };

  /* ── BILLING: per_person / flat ────────────────────────────────────── */
  // 2 employees × 30 nights × 3500 = 210 000 net · 27% VAT = 56 700 · gross 266 700
  // rent 300 000 / 30 / 2 = 5 000 Ft/fő/nap → rent cost 300 000, margin −90 000
  await site('pp', 'PerPerson', 2, { client: ids.client.A, rent: 300000 });
  await mkRate(ids.client.A, ids.acc.pp, { rate_per_night: 3500 });

  // flat, fully covered → the whole 300 000 (headcount-independent)
  await site('flatFull', 'FlatFull', 3, { client: ids.client.A });
  await mkRate(ids.client.A, ids.acc.flatFull, { billing_basis: 'flat', flat_amount: 300000 });

  // flat, covered 1903-06-10 .. 06-24 inclusive (check_out is the first absent day)
  // → 15/30 of 900 000 = 450 000 net · VAT 121 500 · gross 571 500
  await site('flatPro', 'FlatProrated', 1, { client: ids.client.A, rent: 300000, checkIn: day(10), checkOut: day(25) });
  await mkRate(ids.client.A, ids.acc.flatPro, { billing_basis: 'flat', flat_amount: 900000 });

  // áfamentes → 0 VAT, gross = net
  await site('exempt', 'VatExempt', 1, { client: ids.client.A });
  await mkRate(ids.client.A, ids.acc.exempt, { rate_per_night: 3500, vat_exempt: true });

  // magánszemély → payroll_handoff marker, still a normal invoice line, NEVER a payroll calc
  await site('priv', 'PrivateLandlord', 1, { client: ids.client.PRIV });
  await mkRate(ids.client.PRIV, ids.acc.priv, { rate_per_night: 4000 });

  // invoicing disabled → the client is skipped entirely (no billing row at all)
  await site('off', 'InvoicingOff', 1, { client: ids.client.OFF });
  await mkRate(ids.client.OFF, ids.acc.off, { rate_per_night: 5000 });

  /* ── BILLING: per_bed_night (the owner's worked examples) ──────────── */
  // capacity 100 · rate_used 3500 · rate_empty 1500 · floor 90%
  const perBed = { billing_basis: 'per_bed_night', rate_used: 3500, rate_empty: 1500, occupancy_floor_pct: 0.9, contracted_beds: 100 };
  await site('bed95', 'Bed95', 95, { client: ids.client.BED, rent: 2850000 });  // 95×3500 + 5×1500 = 340 000/éj
  await mkRate(ids.client.BED, ids.acc.bed95, perBed);
  await site('bed80', 'Bed80', 80, { client: ids.client.BED, rent: 2400000 });  // floor lifts to 90 → 330 000/éj
  await mkRate(ids.client.BED, ids.acc.bed80, perBed);
  await site('bed92', 'Bed92', 92, { client: ids.client.BED, rent: 2760000 });  // 92×3500 + 8×1500 = 334 000/éj
  await mkRate(ids.client.BED, ids.acc.bed92, perBed);

  // Autoliv: 60 contracted beds @ 90% floor, only 40 occupied → billed at the 54-bed floor.
  // 100 PHYSICAL beds vs 60 committed → 40 "lekötetlen" beds for the profit dashboard.
  await site('autoliv', 'Autoliv', 40, { client: ids.client.BED, rent: 1200000, rooms: [50, 50] });
  await mkRate(ids.client.BED, ids.acc.autoliv, { ...perBed, contracted_beds: 60 });

  // contracted_beds NULL → capacity falls back to the accommodation's PHYSICAL beds (6×10 = 60)
  await site('bedFall', 'BedFallback', 40, { client: ids.client.BED2, rent: 1200000, rooms: [10, 10, 10, 10, 10, 10] });
  await mkRate(ids.client.BED2, ids.acc.bedFall, { ...perBed, contracted_beds: null });

  // floor 0 + rate_empty 0 → degenerates to plain per-occupied-bed
  await site('bedDeg', 'BedDegenerate', 42, { client: ids.client.BED2, rent: 1260000 });
  await mkRate(ids.client.BED2, ids.acc.bedDeg, { billing_basis: 'per_bed_night', rate_used: 3000, rate_empty: 0, occupancy_floor_pct: 0, contracted_beds: 100 });

  // over-occupancy: 65 workers in a 60-bed block → all 65 at rate_used, empties clamped to 0
  await site('bedOver', 'BedOverOccupied', 65, { client: ids.client.BED2, rent: 1950000 });
  await mkRate(ids.client.BED2, ids.acc.bedOver, { ...perBed, contracted_beds: 60 });

  /* ── BILLING: one accommodation, TWO megbízók, different rates ─────── */
  // rent 600 000 / 30 / 5 occupants = 4 000 Ft/fő/nap · expense 100 000 split by employee-days
  ids.acc.mixed = await mkAccommodation('MixedClients', { rent: 600000, contractorId: ids.client.LANDLORD, capacity: 20 });
  ids.emp.mixedA = await mkEmployees(ids.acc.mixed, 2, { client: ids.client.A, prefix: 'MA' });
  ids.emp.mixedB = await mkEmployees(ids.acc.mixed, 3, { client: ids.client.B, prefix: 'MB' });
  await mkHistory([...ids.emp.mixedA, ...ids.emp.mixedB], ids.acc.mixed);
  await mkRate(ids.client.A, ids.acc.mixed, { rate_per_night: 3000 });
  await mkRate(ids.client.B, ids.acc.mixed, { rate_per_night: 5000 });
  await query(
    `INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount, currency, notes)
     VALUES ($1,$2,'rezsi',100000,'HUF',$3)`, [ids.acc.mixed, MONTH, TAG]);

  /* ── BILLING: compensation pass-through ───────────────────────────── */
  // 2 workers billed to A (+ 1 worker with NO megbízó → unattachable claim)
  ids.acc.comp = await mkAccommodation('Compensation', { contractorId: ids.client.LANDLORD, capacity: 10 });
  ids.emp.comp = await mkEmployees(ids.acc.comp, 2, { client: ids.client.A, prefix: 'CA' });
  ids.emp.compOrphan = await mkEmployees(ids.acc.comp, 1, { client: null, prefix: 'CO' });
  await mkHistory([...ids.emp.comp, ...ids.emp.compOrphan], ids.acc.comp);
  await mkRate(ids.client.A, ids.acc.comp, { rate_per_night: 1000 });

  // each claimant needs a users row: compensation_residents.resident_id → employees.user_id
  const linkUser = async (empId, slug) => {
    const u = await mkUser(slug, { contractorId: ids.client.T1, roleSlug: 'accommodated_employee', last: TAG });
    await query(`UPDATE employees SET user_id=$2 WHERE id=$1`, [empId, u.id]);
    return u.id;
  };
  const uComp1 = await linkUser(ids.emp.comp[0], 'comp-worker-1');
  const uComp2 = await linkUser(ids.emp.comp[1], 'comp-worker-2');
  const uOrphan = await linkUser(ids.emp.compOrphan[0], 'comp-worker-orphan');

  const mkComp = async (num, status, amount, residentUserId, residentName) => {
    const c = await one(
      `INSERT INTO compensations (compensation_number, accommodation_id, compensation_type, type, amount_gross,
                                  description, status, issued_date, currency)
       VALUES ($1,$2,'damage','damage',$3,$4,$5,$6,'HUF') RETURNING id`,
      [`${TAG}-${num}`, ids.acc.comp, amount, `${TAG} claim ${num}`, status, day(15)]);
    await query(
      `INSERT INTO compensation_residents (compensation_id, resident_id, resident_name, amount_assigned)
       VALUES ($1,$2,$3,$4)`, [c.id, residentUserId, residentName, amount]);
    return c.id;
  };
  ids.comp.issued = await mkComp('C001', 'issued', 50000, uComp1, `${TAG} Worker One`);       // → billed to A
  ids.comp.disputed = await mkComp('C002', 'disputed', 30000, uComp2, `${TAG} Worker Two`);   // → EXCLUDED
  ids.comp.waived = await mkComp('C003', 'waived', 15000, uComp1, `${TAG} Worker One`);       // → EXCLUDED
  ids.comp.escalated = await mkComp('C004', 'escalated', 7000, uComp2, `${TAG} Worker Two`);  // → billed to A
  ids.comp.orphan = await mkComp('C005', 'issued', 20000, uOrphan, `${TAG} Worker Orphan`);   // → unattached

  /* ── DATA INTEGRITY: mid-month A→B transfer (same-day handover) ───── */
  // Worker leaves A and enters B on 1903-06-16. check_out is "the first day they are
  // no longer here", so day 16 must count at B ONLY — 15 days each, never 31 or 29.
  ids.acc.transferA = await mkAccommodation('TransferFrom', { rent: 300000, contractorId: ids.client.LANDLORD, capacity: 4 });
  ids.acc.transferB = await mkAccommodation('TransferTo', { rent: 300000, contractorId: ids.client.LANDLORD, capacity: 4 });
  const [mover] = await mkEmployees(ids.acc.transferB, 1, { client: ids.client.A, prefix: 'TR' });
  ids.emp.mover = mover;
  await mkHistory([mover], ids.acc.transferA, { checkIn: D1, checkOut: day(16) });
  await mkHistory([mover], ids.acc.transferB, { checkIn: day(16), checkOut: null });
  await mkRate(ids.client.A, ids.acc.transferA, { rate_per_night: 2000 });
  await mkRate(ids.client.A, ids.acc.transferB, { rate_per_night: 2000 });

  /* ── DATA INTEGRITY: the room-move → snapshot chain (DATA-01) ──────── */
  // One worker, two rooms, history pointing at room 1. Moving them (the way every
  // application path does it — UPDATE employees.room_id) must reach the next snapshot.
  ids.acc.roomMove = await mkAccommodation('RoomMove', { rent: 300000, contractorId: ids.client.LANDLORD, capacity: 4 });
  ids.room.roomMove = await mkRooms(ids.acc.roomMove, [2, 2]);
  const [rmEmp] = await mkEmployees(ids.acc.roomMove, 1, {
    client: null, gender: 'male', shift: 'ejszaka', workplace: 'FT Flex', roomId: ids.room.roomMove[0], prefix: 'RM' });
  ids.emp.roomMove = rmEmp;
  await mkHistory([rmEmp], ids.acc.roomMove, { roomId: ids.room.roomMove[0] });

  /* ── REPORTS: an employee whose contact data lives on EMPLOYEES ────── */
  // No users row → the employees report must still emit company_email/company_phone
  // (DEEP_AUDIT #14: it reads u.email/u.phone instead, so these come out blank).
  ids.acc.reportSite = await mkAccommodation('ReportSubject', { contractorId: ids.client.T1, capacity: 4 });
  const [rep] = await mkEmployees(ids.acc.reportSite, 1, { contractorId: ids.client.T1, prefix: 'RPT' });
  ids.emp.reportSubject = rep;
  ids.reportEmail = `report.subject@functest.local`;
  await query(
    `UPDATE employees SET company_email=$2, company_phone=$3, position=$4, employee_number=$5 WHERE id=$1`,
    [rep, ids.reportEmail, '+36 30 000 1234', 'FT Munkakör', `${TAG}-RPT-1`]);

  /* ── REPORTS: UTC-vs-local "as of" probe (DEEP_AUDIT #18) ─────────── */
  // Arrives on the LOCAL date of the frozen instant the scenario uses. Under the
  // correct local "as of" they are occupying; under a UTC "as of" they are not yet.
  ids.acc.tzProbe = await mkAccommodation('TzProbe', { contractorId: ids.client.T1, capacity: 1 });
  const [tzEmp] = await mkEmployees(ids.acc.tzProbe, 1, { contractorId: ids.client.T1, prefix: 'TZ' });
  ids.emp.tzProbe = tzEmp;
  ids.tzLocalDate = '2026-06-15';               // local date at the frozen instant
  ids.tzFrozenISO = '2026-06-14T22:30:00.000Z'; // = 2026-06-15 00:30 Europe/Budapest
  await query(`UPDATE employees SET arrival_date = $2::date WHERE id=$1`, [tzEmp, ids.tzLocalDate]);

  /* ── CONSOLIDATION: three deterministic sites ─────────────────────── */
  // solvable: 4 identical residents, one per 2-bed room → 2 rooms freed, 2 moves
  ids.acc.consSolve = await mkAccommodation('ConsSolvable', { contractorId: ids.client.LANDLORD, capacity: 8 });
  ids.room.consSolve = await mkRooms(ids.acc.consSolve, [2, 2, 2, 2]);
  ids.emp.consSolve = [];
  for (const rid of ids.room.consSolve) {
    const [e] = await mkEmployees(ids.acc.consSolve, 1, { client: null, gender: 'male', shift: 'delelott', workplace: 'FT Audi', roomId: rid, prefix: 'CS' });
    ids.emp.consSolve.push(e);
  }
  // blocked: same gender + workplace but DIFFERENT shifts → must not merge
  ids.acc.consBlock = await mkAccommodation('ConsBlocked', { contractorId: ids.client.LANDLORD, capacity: 4 });
  ids.room.consBlock = await mkRooms(ids.acc.consBlock, [2, 2]);
  ids.emp.consBlock = [
    (await mkEmployees(ids.acc.consBlock, 1, { gender: 'male', shift: 'delelott', workplace: 'FT Audi', roomId: ids.room.consBlock[0], prefix: 'CB1' }))[0],
    (await mkEmployees(ids.acc.consBlock, 1, { gender: 'male', shift: 'ejszaka', workplace: 'FT Audi', roomId: ids.room.consBlock[1], prefix: 'CB2' }))[0],
  ];
  // flagged: 2 movable + 1 with no shift, alone → 1 room freed, the incomplete one never moved
  ids.acc.consFlag = await mkAccommodation('ConsFlagged', { contractorId: ids.client.LANDLORD, capacity: 6 });
  ids.room.consFlag = await mkRooms(ids.acc.consFlag, [2, 2, 2]);
  ids.emp.consFlag = [
    (await mkEmployees(ids.acc.consFlag, 1, { gender: 'female', shift: 'delutan', workplace: 'FT Bosch', roomId: ids.room.consFlag[0], prefix: 'CF1' }))[0],
    (await mkEmployees(ids.acc.consFlag, 1, { gender: 'female', shift: 'delutan', workplace: 'FT Bosch', roomId: ids.room.consFlag[1], prefix: 'CF2' }))[0],
  ];
  ids.emp.consFlagIncomplete = (await mkEmployees(ids.acc.consFlag, 1, { gender: 'female', shift: null, workplace: 'FT Bosch', roomId: ids.room.consFlag[2], prefix: 'CFX' }))[0];

  /* ── HYGIENE FINE: a room with 2 consecutive failing inspections ───── */
  ids.acc.hyg = await mkAccommodation('Hygiene', { contractorId: ids.client.LANDLORD, capacity: 4 });
  ids.room.hyg = (await mkRooms(ids.acc.hyg, [2]))[0];
  ids.emp.hyg = await mkEmployees(ids.acc.hyg, 2, { gender: 'male', shift: 'delelott', workplace: 'FT Bosch', roomId: ids.room.hyg, prefix: 'HY' });
  const hygResidents = [
    { name: `${TAG} Lakó Egy`, user_id: null, email: null },
    { name: `${TAG} Lakó Kettő`, user_id: null, email: null },
  ];
  const mkInspection = async (num, score, daysAgo) => {
    const i = await one(
      `INSERT INTO inspections (inspection_number, accommodation_id, inspection_type, status,
          scheduled_at, started_at, completed_at, hygiene_score, total_score, grade)
       VALUES ($1,$2,'monthly','completed', NOW()-($3||' days')::interval, NOW()-($3||' days')::interval,
               NOW()-($3||' days')::interval, $4, $4, 'critical') RETURNING id`,
      [`${TAG}-INSP-${num}`, ids.acc.hyg, daysAgo, score]);
    await query(
      `INSERT INTO room_inspections (inspection_id, room_id, room_number, hygiene_score, total_score, residents_snapshot, needs_attention)
       VALUES ($1,$2,$3,$4,$4,$5,true)`,
      [i.id, ids.room.hyg, `${TAG}-01`, score, JSON.stringify(hygResidents)]);
    return i.id;
  };
  ids.inspection1 = await mkInspection('1', 7, 20);   // fail (7 pt ≤ threshold)
  ids.inspection2 = await mkInspection('2', 7, 5);    // fail → 2 consecutive → fine

  // a second room with only ONE failing inspection → must NOT be fined
  ids.acc.hygOk = await mkAccommodation('HygieneSingleFail', { contractorId: ids.client.LANDLORD, capacity: 2 });
  ids.room.hygOk = (await mkRooms(ids.acc.hygOk, [2]))[0];
  const iOk = await one(
    `INSERT INTO inspections (inspection_number, accommodation_id, inspection_type, status, scheduled_at, started_at, completed_at, hygiene_score, total_score, grade)
     VALUES ($1,$2,'monthly','completed', NOW()-'3 days'::interval, NOW()-'3 days'::interval, NOW()-'3 days'::interval, 7, 7, 'critical') RETURNING id`,
    [`${TAG}-INSP-OK`, ids.acc.hygOk]);
  await query(
    `INSERT INTO room_inspections (inspection_id, room_id, room_number, hygiene_score, total_score, residents_snapshot, needs_attention)
     VALUES ($1,$2,$3,7,7,$4,true)`, [iOk.id, ids.room.hygOk, `${TAG}-01`, JSON.stringify(hygResidents)]);

  /* ── EXPIRY MONITOR: dates relative to CURRENT_DATE (the service uses it) ── */
  ids.acc.expiry = await mkAccommodation('Expiry', { contractorId: ids.client.T1, capacity: 6 });
  const [eVisa] = await mkEmployees(ids.acc.expiry, 1, { contractorId: ids.client.T1, prefix: 'XV' });
  const [eContract] = await mkEmployees(ids.acc.expiry, 1, { contractorId: ids.client.T1, prefix: 'XC' });
  const [eDoc] = await mkEmployees(ids.acc.expiry, 1, { contractorId: ids.client.T1, prefix: 'XD' });
  const [eFar] = await mkEmployees(ids.acc.expiry, 1, { contractorId: ids.client.T1, prefix: 'XF' });
  ids.emp.expiryVisa = eVisa; ids.emp.expiryContract = eContract; ids.emp.expiryDoc = eDoc; ids.emp.expiryFar = eFar;
  await query(`UPDATE employees SET visa_expiry = CURRENT_DATE + 10, nationality='PH' WHERE id=$1`, [eVisa]);   // bucket 14
  await query(`UPDATE employees SET end_date   = CURRENT_DATE + 5  WHERE id=$1`, [eContract]);                   // bucket 7
  await query(`UPDATE employees SET visa_expiry = CURRENT_DATE + 400 WHERE id=$1`, [eFar]);                      // outside every window
  ids.docId = (await one(
    `INSERT INTO employee_documents (employee_id, document_type, file_name, file_path, document_name, expiry_date)
     VALUES ($1,'work_permit',$2,$3,$4, CURRENT_DATE + 45) RETURNING id`,
    [eDoc, `${TAG}.pdf`, `uploads/functest/${TAG}.pdf`, `${TAG} munkavállalási engedély`])).id;                  // bucket 60

  /* ── GDPR: one employee whose PII carries a unique, greppable marker ── */
  ids.gdprMarker = `FTPII${MONTH.replace('-', '')}`;
  ids.acc.gdpr = await mkAccommodation('Gdpr', { contractorId: ids.client.T1, capacity: 2 });
  const gdprUser = await mkUser('gdpr-subject', { contractorId: ids.client.T1, roleSlug: 'accommodated_employee', last: TAG });
  const [gdprEmp] = await mkEmployees(ids.acc.gdpr, 1, { contractorId: ids.client.T1, prefix: 'GD' });
  ids.emp.gdpr = gdprEmp; ids.user.gdpr = gdprUser.id;
  await query(
    // explicit ::text on the shared marker param — first_name/birth_place are varchar
    // while mothers_name/passport/SSN/bank are text, and pg refuses to infer both.
    `UPDATE employees SET user_id=$2, first_name=$3::text, mothers_name=$3::text, passport_number=$3::text,
       social_security_number=$3::text, bank_account=$3::text, personal_email=$4::text,
       tax_id=$3::text, birth_place=$3::text
     WHERE id=$1`, [gdprEmp, gdprUser.id, ids.gdprMarker, `${ids.gdprMarker}@functest.local`]);

  /* ── PERMISSIONS: one real login per role, two tenants ─────────────── */
  const ROLES = ['superadmin', 'admin', 'data_controller', 'property_owner', 'contractor',
                 'property_inspector', 'maintenance_worker', 'task_owner', 'accommodated_employee'];
  for (const r of ROLES) ids.user[r] = (await mkUser(`t1-${r.replace(/_/g, '-')}`, { contractorId: ids.client.T1, roleSlug: r, last: TAG })).id;
  ids.user.t2_operator = (await mkUser('t2-operator', { contractorId: ids.client.T2, roleSlug: 'data_controller', last: TAG })).id;
  ids.user.t2_admin = (await mkUser('t2-admin', { contractorId: ids.client.T2, roleSlug: 'admin', last: TAG })).id;

  // the resident login must map to a real employee (self-scoped endpoints join on user_id)
  ids.acc.t1 = await mkAccommodation('TenantOneSite', { contractorId: ids.client.T1, capacity: 10 });
  const [t1emp] = await mkEmployees(ids.acc.t1, 1, { contractorId: ids.client.T1, prefix: 'T1' });
  await query(`UPDATE employees SET user_id=$2 WHERE id=$1`, [t1emp, ids.user.accommodated_employee]);
  ids.emp.t1 = t1emp;

  // tenant 2's private world — nothing tenant 1 asks for may ever contain these ids
  ids.acc.t2 = await mkAccommodation('TenantTwoSite', { contractorId: ids.client.T2, capacity: 10 });
  ids.emp.t2 = (await mkEmployees(ids.acc.t2, 3, { contractorId: ids.client.T2, prefix: 'T2' }))[0];
  ids.doc_t2 = (await one(
    `INSERT INTO employee_documents (employee_id, document_type, file_name, file_path, document_name)
     VALUES ($1,'contract',$2,$3,$4) RETURNING id`,
    [ids.emp.t2, `${TAG}-t2.pdf`, `uploads/functest/${TAG}-t2.pdf`, `${TAG} tenant-two contract`])).id;

  // Financial + timesheet rows that ONLY tenant 2 may see. They live in a different
  // month (1903-07) so the 1903-06 billing/profit reconciliations stay untouched — the
  // isolation probes query that month explicitly.
  ids.leakMonth = '1903-07';
  ids.expense_t2 = (await one(
    `INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount, currency, notes)
     VALUES ($1,$2,'karbantartas',777000,'HUF',$3) RETURNING id`, [ids.acc.t2, ids.leakMonth, TAG])).id;
  ids.task_t2 = (await one(
    `INSERT INTO tasks (title, contractor_id, created_by) VALUES ($1,$2,$3) RETURNING id`,
    [`${TAG} tenant-two task`, ids.client.T2, ids.user.t2_operator])).id;
  await query(
    `INSERT INTO timesheets (task_id, user_id, hours, work_date) VALUES ($1,$2,7.5,$3::date)`,
    [ids.task_t2, ids.user.t2_operator, D1]);

  /* ── align occupancy history with the roster ───────────────────────── */
  // The base seed writes employees but no history, and the fixture builds several sites
  // by raw INSERT. Running the real backfill here does two jobs: it puts the sandbox in
  // the state a fixed production would be in, and it makes DATA-22's roster-vs-history
  // invariant meaningful across the WHOLE database rather than just the fixture.
  // It opens rows dated TODAY, so the far-past billing month is untouched.
  ids.backfill = await require('../../src/services/accommodationHistory.service')
    .backfillCurrentRoster({ effectiveDate: localDateStr() });

  return ids;
}

/** Write the month's occupancy snapshots — the input the billing engine reads. */
async function snapshotMonth(occService) {
  let rows = 0;
  for (let d = 1; d <= DAYS; d++) {
    const s = await occService.recordDailySnapshot(day(d));
    rows += s.rows_written;
  }
  return rows;
}

module.exports = { TAG, MONTH, DAYS, D1, day, teardown, build, snapshotMonth };
