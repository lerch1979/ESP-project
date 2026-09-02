/**
 * Settlement sheets at REAL scale — ~16 sites, ~300 people, ~8 800 bed-nights.
 *
 * The layout was proven on a 2-site / 32-person fixture. This answers a different
 * question: does it hold up for a month we would actually send to partners?
 * Reports build time, render time and file size for both formats.
 *
 * Sandbox only.  DB_NAME=hr_erp_sandbox DB_USER=$(whoami) node tests/settlementVolume.script.js
 */
require('dotenv').config();
const fs = require('fs');
const pool = require('../src/database/connection');
const engine = require('../src/services/billingEngine.service');
const svc = require('../src/services/settlementSheet.service');
const render = require('../src/services/settlementRender.service');

const M = '1931-08';
const SITES = 16;
const PER_SITE = 19;          // 16 × 19 = 304 people
const DAYS = 31;
let failures = 0;
const check = (l, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${d && !c ? `  [${d}]` : ''}`); if (!c) failures++; };
const ms = (t) => `${Math.round(t)} ms`;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

(async () => {
  const t0 = Date.now();
  let LL, CL, accs = [], rooms = [], emps = [];
  try {
    if (!/sandbox/i.test(process.env.DB_NAME || '')) throw new Error('sandbox only');
    const st = Date.now();

    LL = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('VOL Szállásadó',$1,true) RETURNING id`,['vol-ll-'+st])).rows[0].id;
    CL = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('VOL Megbízó',$1,true) RETURNING id`,['vol-cl-'+st])).rows[0].id;
    await pool.query(`INSERT INTO client_billing_profiles (contractor_id) VALUES ($1) ON CONFLICT DO NOTHING`,[CL]);

    for (let s = 0; s < SITES; s++) {
      const a = (await pool.query(
        `INSERT INTO accommodations (name,type,capacity,status,current_contractor_id,address)
         VALUES ($1,'dormitory',$2,'available',$3,$4) RETURNING id`,
        [`VOL Szálló ${String(s+1).padStart(2,'0')}`, PER_SITE + 3, LL, `1234 Teszt utca ${s+1}.`])).rows[0].id;
      accs.push(a);
      const r = (await pool.query(
        `INSERT INTO accommodation_rooms (accommodation_id,room_number,beds,is_active) VALUES ($1,$2,$3,true) RETURNING id`,
        [a, `${s+1}01`, PER_SITE + 3])).rows[0].id;
      rooms.push(r);
      await pool.query(`INSERT INTO accommodation_rent_rates (accommodation_id,rent_basis,rent_per_bed_night,valid_from) VALUES ($1,'per_bed_night',2000,DATE '1900-01-01')`,[a]);
      await pool.query(
        `INSERT INTO client_night_rates (contractor_id,accommodation_id,valid_from,billing_basis,rate_per_night,rate_used,rate_empty,occupancy_floor_pct,contracted_beds,vat_rate)
         VALUES ($1,$2,DATE '1900-01-01','per_bed_night',3500,3500,2400,0.9,$3,0.27)`,[CL,a,PER_SITE+3]);
    }

    // people + snapshots
    const WPS = ['Autoliv Kft','Ikea','IKEA','Man At Work Kft'];
    let n = 0;
    for (let s = 0; s < SITES; s++) {
      for (let i = 0; i < PER_SITE; i++) {
        n += 1;
        const e = (await pool.query(
          `INSERT INTO employees (contractor_id,billing_client_id,first_name,last_name,accommodation_id,room_id,workplace,arrival_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,DATE '1931-01-01') RETURNING id`,
          [CL, CL, `Nev${n}`, `Vezetek${String(n).padStart(3,'0')}`, accs[s], rooms[s], WPS[n % WPS.length]])).rows[0].id;
        emps.push({ id: e, acc: accs[s], room: rooms[s], leaves: n % 17 === 0 });
      }
    }

    // bulk snapshot insert — one statement per day rather than 8 800 round trips
    let bedNights = 0;
    for (let d = 1; d <= DAYS; d++) {
      const date = `${M}-${String(d).padStart(2,'0')}`;
      const present = emps.filter((e) => !(e.leaves && d > 18));
      bedNights += present.length;
      const vals = present.map((_, i) => `($1, $${i*3+2}, $${i*3+3}, $${i*3+4}, 1)`).join(',');
      const params = [date, ...present.flatMap((e) => [e.id, e.acc, e.room])];
      await pool.query(
        `INSERT INTO occupancy_snapshots (snapshot_date, employee_id, accommodation_id, room_id, room_occupant_count)
         VALUES ${vals} ON CONFLICT DO NOTHING`, params);
    }
    console.log(`\n  fixture: ${SITES} szálláshely · ${emps.length} fő · ${bedNights} ágyéjszaka · seed ${ms(Date.now()-st)}`);

    const tBill = Date.now();
    await engine.calculateMonthlyBilling(M, { runType: 'incoming' });
    const billMs = Date.now() - tBill;

    // ── measure ──
    const tL = Date.now(); const land = await svc.landlordSheet({ month: M, landlordId: LL }); const buildL = Date.now()-tL;
    const tC = Date.now(); const cli  = await svc.clientSheet({ month: M, clientId: CL });     const buildC = Date.now()-tC;

    const tLx = Date.now(); const lx = render.renderXlsx(land);       const lxMs = Date.now()-tLx;
    const tCx = Date.now(); const cx = render.renderXlsx(cli);        const cxMs = Date.now()-tCx;
    const tLp = Date.now(); const lp = await render.renderPdf(land);  const lpMs = Date.now()-tLp;
    const tCp = Date.now(); const cp = await render.renderPdf(cli);   const cpMs = Date.now()-tCp;

    fs.writeFileSync('/tmp/vol_szallasado.xlsx', lx); fs.writeFileSync('/tmp/vol_megbizo.xlsx', cx);
    fs.writeFileSync('/tmp/vol_szallasado.pdf', lp);  fs.writeFileSync('/tmp/vol_megbizo.pdf', cp);

    console.log('\n  ── MÉRÉS ──');
    console.log(`  számlázási futás           ${ms(billMs)}`);
    console.log(`  szállásadói lap felépítése ${ms(buildL)}      megbízói lap ${ms(buildC)}`);
    console.log(`  xlsx render                ${ms(lxMs)} / ${kb(lx.length)}   ·  ${ms(cxMs)} / ${kb(cx.length)}`);
    console.log(`  pdf  render                ${ms(lpMs)} / ${kb(lp.length)}   ·  ${ms(cpMs)} / ${kb(cp.length)}`);
    console.log(`  teljes (build+render, mindkét lap, mindkét formátum)  ${ms(buildL+buildC+lxMs+cxMs+lpMs+cpMs)}`);

    check('VOL-01 landlord sheet covers every site', land.accommodations.length === SITES, `${land.accommodations.length}`);
    check('VOL-02 client sheet covers every site', cli.sites.length === SITES, `${cli.sites.length}`);
    check('VOL-03 grid holds every person', cli.grid.people.length === emps.length, `${cli.grid.people.length}`);
    check('VOL-04 grid bed-nights match the billed occupied bed-nights',
      cli.grid.people.reduce((s,p)=>s+p.bed_nights,0) === cli.totals.occupied_bed_nights,
      `${cli.grid.people.reduce((s,p)=>s+p.bed_nights,0)} vs ${cli.totals.occupied_bed_nights}`);
    check('VOL-05 empty-bed reconstruction reconciles', cli.empty_reconciles, JSON.stringify(cli.empty_reconciliation));
    check('VOL-06 workplace variants folded (Ikea/IKEA)',
      [...new Set(cli.grid.people.map(p=>p.workplace))].filter(w=>String(w).toLowerCase()==='ikea').length === 1);
    check('VOL-07 whole pipeline under 10s', (buildL+buildC+lxMs+cxMs+lpMs+cpMs) < 10000);
    check('VOL-08 xlsx stays a sane size (<5 MB)', lx.length < 5e6 && cx.length < 5e6);

    const XLSX = require('xlsx');
    const wb = XLSX.read(cx, { type:'buffer' });
    const gridRows = XLSX.utils.sheet_to_json(wb.Sheets['Napi jelenlét'], { header:1, blankrows:false }).length;
    console.log(`\n  megbízói "Napi jelenlét" sorok: ${gridRows} (fő + Üres + ÖSSZESEN + fejléc)`);
    const pdfPages = (await require('pdf-parse')(cp)).numpages;
    console.log(`  megbízói PDF oldalszám: ${pdfPages}`);
    check('VOL-09 the grid sheet holds every person plus totals', gridRows >= emps.length);
  } catch (e) { console.error('SUITE ERROR:', e.message); failures++; }
  finally {
    const q=(s,p)=>pool.query(s,p).catch(()=>{});
    await q(`DELETE FROM accommodation_billings WHERE billing_month=$1`,[M]);
    await q(`DELETE FROM billing_runs WHERE billing_month=$1`,[M]);
    await q(`DELETE FROM occupancy_snapshots WHERE accommodation_id = ANY($1::uuid[])`,[accs]);
    await q(`DELETE FROM accommodation_rent_rates WHERE accommodation_id = ANY($1::uuid[])`,[accs]);
    await q(`DELETE FROM client_night_rates WHERE accommodation_id = ANY($1::uuid[])`,[accs]);
    await q(`DELETE FROM employees WHERE id = ANY($1::uuid[])`,[emps.map(e=>e.id)]);
    await q(`DELETE FROM accommodation_rooms WHERE id = ANY($1::uuid[])`,[rooms]);
    await q(`DELETE FROM accommodations WHERE id = ANY($1::uuid[])`,[accs]);
    await q(`DELETE FROM client_billing_profiles WHERE contractor_id=$1`,[CL]);
    await q(`DELETE FROM contractors WHERE id = ANY($1::uuid[])`,[[LL,CL].filter(Boolean)]);
    console.log(`\n  ${failures===0?'ALL PASS':failures+' FAILURE(S)'}  (teljes futás ${ms(Date.now()-t0)})`);
    await pool.end?.();
    process.exit(failures===0?0:1);
  }
})();
