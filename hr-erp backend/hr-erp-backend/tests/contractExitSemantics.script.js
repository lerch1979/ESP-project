/**
 * FINANCIAL vs LEGAL exit on the Szerződések board (mig 147).
 *
 * The business point: under a per-actual-use contract with NO minimum, the notice
 * period does not gate our financial exposure — we stop paying by moving people out,
 * without terminating. Under a fixed rent, or a per-use deal WITH a floor, the money
 * runs until the relationship ends and the two dates coincide.
 *
 * Sandbox only.
 *   DB_NAME=hr_erp_sandbox DB_USER=$(whoami) node tests/contractExitSemantics.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const partner = require('../src/services/partner.service');

let failures = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail && !cond ? `   [${detail}]` : ''}`);
  if (!cond) failures++;
};
const su = { user: { id: null, email: 'su@test.local', roles: ['superadmin'], contractorId: null } };
const ymd = (d) => {
  if (!d) return null;
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const plusDays = (n) => ymd(new Date(Date.now() + n * 864e5));

(async () => {
  const stamp = Date.now();
  const made = { acc: [], con: [] };

  const mkAcc = async (name, rate) => {
    const c = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ($1,$2,true) RETURNING id`,
      [`XS ${name} LL`, `xs-${name}-${stamp}`])).rows[0].id;
    made.con.push(c);
    const a = (await pool.query(
      `INSERT INTO accommodations (name,type,capacity,status,current_contractor_id) VALUES ($1,'studio',10,'available',$2) RETURNING id`,
      [`XS ${name} ${stamp}`, c])).rows[0].id;
    made.acc.push(a);
    await pool.query(
      `INSERT INTO accommodation_rent_rates
         (accommodation_id, rent_basis, rent_amount, rent_per_bed_night, min_bed_nights, min_monthly_amount, valid_from)
       VALUES ($1,$2,$3,$4,$5,$6,DATE '1900-01-01')`,
      [a, rate.basis, rate.amount ?? null, rate.perBed ?? null, rate.minNights ?? null, rate.minAmount ?? null]);
    return { c, a };
  };
  const board = async (id) => (await partner.listContracts(su, {})).contracts.find((x) => x.id === id);

  try {
    if (!/sandbox/i.test(process.env.DB_NAME || '')) throw new Error('sandbox only');
    su.user.id = (await pool.query('SELECT id FROM users LIMIT 1')).rows[0].id;

    // ── CASE A — per-use, NO minimum (the Barcza / Sarród I. shape) ─────────
    const A = await mkAcc('peruse', { basis: 'per_bed_night', perBed: 2200 });
    const ca = await partner.saveContract(su, null, {
      contractor_id: A.c, accommodation_id: A.a, contract_role: 'szallasado',
      title: 'XS Per-use', status: 'active', is_open_ended: true, notice_days: 60,
    });
    const ra = await board(ca.id);
    check('A1 per-use + no minimum → FINANCIAL exit is immediate',
      ra.financial_exit_kind === 'immediate', ra.financial_exit_kind);
    check('A2 ... financial exit date is TODAY (move people out)',
      ymd(ra.financial_exit_date) === ymd(new Date()), ymd(ra.financial_exit_date));
    check('A3 ... LEGAL exit is still today + 60 days (relationship, not cost)',
      ymd(ra.legal_exit_date) === plusDays(60), ymd(ra.legal_exit_date));
    check('A4 ... the two dates genuinely differ', ymd(ra.financial_exit_date) !== ymd(ra.legal_exit_date));
    check('A5 ... the derivation inputs are surfaced so the UI can explain WHY',
      ra.cost_basis === 'per_bed_night' && ra.cost_min_bed_nights === null);

    // ── CASE B — FLAT rent: money runs until the relationship ends ──────────
    const B = await mkAcc('flat', { basis: 'flat', amount: 1020000 });
    const cb = await partner.saveContract(su, null, {
      contractor_id: B.c, accommodation_id: B.a, contract_role: 'szallasado',
      title: 'XS Flat', status: 'active', is_open_ended: true, notice_days: 60,
    });
    const rb = await board(cb.id);
    check('B1 flat rent → financial exit is gated by NOTICE', rb.financial_exit_kind === 'notice', rb.financial_exit_kind);
    check('B2 ... financial and legal exit COINCIDE (this is where the notice date is the number)',
      ymd(rb.financial_exit_date) === ymd(rb.legal_exit_date) && ymd(rb.legal_exit_date) === plusDays(60));

    // ── CASE C — per-use WITH a minimum: behaves like flat ──────────────────
    const C = await mkAcc('minimum', { basis: 'per_bed_night', perBed: 2200, minNights: 300 });
    const cc = await partner.saveContract(su, null, {
      contractor_id: C.c, accommodation_id: C.a, contract_role: 'szallasado',
      title: 'XS Per-use + minimum', status: 'active', is_open_ended: true, notice_days: 60,
    });
    const rc = await board(cc.id);
    check('C1 per-use WITH a minimum → notice-gated (moving people out does not stop the floor)',
      rc.financial_exit_kind === 'notice', rc.financial_exit_kind);
    check('C2 ... and the minimum is surfaced', Number(rc.cost_min_bed_nights) === 300);

    // ── CASE D — explicit override beats the derivation ─────────────────────
    await partner.saveContract(su, cc.id, {
      contractor_id: C.c, accommodation_id: C.a, contract_role: 'szallasado',
      title: 'XS Per-use + minimum', status: 'active', is_open_ended: true, notice_days: 60,
      financial_exit: 'immediate',
    });
    const rd = await board(cc.id);
    check('D1 an explicit financial_exit override wins over the derivation',
      rd.financial_exit_kind === 'immediate' && ymd(rd.financial_exit_date) === ymd(new Date()));
    let bad = false;
    try {
      await partner.saveContract(su, null, {
        contractor_id: C.c, contract_role: 'megbizo', title: 'XS bad', financial_exit: 'whenever',
      });
    } catch (e) { bad = /financial_exit/.test(e.message); }
    check('D2 an invalid override value is rejected', bad);

    // ── CASE E — a non-lease contract has no cost basis to reason about ─────
    const ce = await partner.saveContract(su, null, {
      contractor_id: A.c, contract_role: 'megbizo', title: 'XS Megbízó',
      status: 'active', is_open_ended: true, notice_days: 30,
    });
    const re = await board(ce.id);
    check('E1 a contract with no property defaults to notice-gated (conservative)',
      re.financial_exit_kind === 'notice');

    // ── CASE F — a FIXED-TERM contract: legal exit is the end date ──────────
    const cf = await partner.saveContract(su, null, {
      contractor_id: B.c, accommodation_id: B.a, contract_role: 'szallasado',
      title: 'XS Fixed', status: 'active', end_date: plusDays(200), notice_days: 60,
    });
    const rf = await board(cf.id);
    check('F1 fixed-term legal exit is the END DATE, not today+notice',
      ymd(rf.legal_exit_date) === plusDays(200), ymd(rf.legal_exit_date));
    check('F2 ... and its notice DEADLINE is still end_date − notice_days',
      ymd(rf.notice_deadline) === plusDays(140), ymd(rf.notice_deadline));
  } catch (err) {
    console.error('SUITE ERROR:', err.message);
    failures++;
  } finally {
    const q = (sql, p) => pool.query(sql, p).catch(() => {});
    await q('DELETE FROM partner_contracts WHERE contractor_id = ANY($1::uuid[])', [made.con]);
    await q('DELETE FROM accommodation_rent_rates WHERE accommodation_id = ANY($1::uuid[])', [made.acc]);
    await q('DELETE FROM accommodations WHERE id = ANY($1::uuid[])', [made.acc]);
    await q('DELETE FROM contractors WHERE id = ANY($1::uuid[])', [made.con]);
    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
    await pool.end?.();
    process.exit(failures === 0 ? 0 : 1);
  }
})();
