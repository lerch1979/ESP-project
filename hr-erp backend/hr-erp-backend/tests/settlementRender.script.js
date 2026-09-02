/**
 * Settlement sheets — build + render, on a Sarród-I.-shaped reference case.
 * Sandbox only. Writes the rendered files to /tmp for visual inspection.
 */
require('dotenv').config();
const fs = require('fs');
const pool = require('../src/database/connection');
const engine = require('../src/services/billingEngine.service');
const svc = require('../src/services/settlementSheet.service');
const render = require('../src/services/settlementRender.service');

const M = '1926-08';
function mockRes() {
  return { statusCode: 200, body: null, headers: {},
    status(c){ this.statusCode=c; return this; },
    json(b){ this.body=b; return this; },
    setHeader(k,v){ this.headers[k]=v; }, send(b){ this.body=b; return this; } };
}
let failures = 0;
const check = (l, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${d && !c ? `  [${d}]` : ''}`); if (!c) failures++; };

(async () => {
  const st = Date.now();
  let LL, CL, CL2, ACC, ACC2, ROOM, ROOM2, emps = [];
  try {
    if (!/sandbox/i.test(process.env.DB_NAME || '')) throw new Error('sandbox only');
    const userId = (await pool.query('SELECT id FROM users LIMIT 1')).rows[0].id;

    LL = (await pool.query(`INSERT INTO contractors (name,slug,is_active,tax_number,address) VALUES ('Barcza Gyula (teszt)',$1,true,'77134635-1-28','9435 Sarród, Petőfi tér 2.') RETURNING id`,['ss-ll-'+st])).rows[0].id;
    CL = (await pool.query(`INSERT INTO contractors (name,slug,is_active,tax_number) VALUES ('Teszt Megbízó Zrt',$1,true,'12345678-2-41') RETURNING id`,['ss-cl-'+st])).rows[0].id;
    CL2 = (await pool.query(`INSERT INTO contractors (name,slug,is_active,tax_number) VALUES ('Másik Megbízó Kft',$1,true,'99999999-2-41') RETURNING id`,['ss-cl2-'+st])).rows[0].id;
    for (const c of [CL, CL2]) await pool.query(`INSERT INTO client_billing_profiles (contractor_id, legal_type) VALUES ($1,'company') ON CONFLICT DO NOTHING`,[c]);
    ACC = (await pool.query(`INSERT INTO accommodations (name,type,capacity,status,current_contractor_id,address) VALUES ($1,'dormitory',31,'available',$2,'9435 Sarród, Petőfi tér 2.') RETURNING id`,['Sarród I. (teszt)',LL])).rows[0].id;
    ACC2 = (await pool.query(`INSERT INTO accommodations (name,type,capacity,status,current_contractor_id,address) VALUES ($1,'dormitory',20,'available',$2,'9435 Sarród, Fő utca 1.') RETURNING id`,['Sarród II. (teszt)',LL])).rows[0].id;
    ROOM = (await pool.query(`INSERT INTO accommodation_rooms (accommodation_id,room_number,beds,is_active) VALUES ($1,'101',31,true) RETURNING id`,[ACC])).rows[0].id;
    // Adversarial: a room label that CONTAINS the client's name. If any leak path
    // exists — column, name string, or room label — this makes it visible.
    ROOM2 = (await pool.query(`INSERT INTO accommodation_rooms (accommodation_id,room_number,beds,is_active) VALUES ($1,'201-TesztMegbizoZrt',20,true) RETURNING id`,[ACC2])).rows[0].id;
    await pool.query(`INSERT INTO accommodation_rent_rates (accommodation_id,rent_basis,rent_per_bed_night,valid_from) VALUES ($1,'per_bed_night',2000,DATE '1900-01-01')`,[ACC2]);
    for (const c of [CL, CL2]) await pool.query(`INSERT INTO client_night_rates (contractor_id,accommodation_id,valid_from,billing_basis,rate_per_night,rate_used,rate_empty,occupancy_floor_pct,contracted_beds,vat_rate)
      VALUES ($1,$2,DATE '1900-01-01','per_bed_night',3200,3200,2200,0.8,10,0.27)`,[c,ACC2]);

    // cost side: 2200 Ft/fő/éj  ·  revenue side: per-bed block, 31 contracted @90% floor
    await pool.query(`INSERT INTO accommodation_rent_rates (accommodation_id,rent_basis,rent_per_bed_night,valid_from) VALUES ($1,'per_bed_night',2200,DATE '1900-01-01')`,[ACC]);
    await pool.query(`INSERT INTO accommodation_utility_lines (accommodation_id,line,who_pays,contract_holder,passthrough,passthrough_pct)
      SELECT $1, l, 'szallasado','szallasado',false,0 FROM unnest(ARRAY['viz_csatorna','internet','aram','gaz','kozos_koltseg','hulladekszallitas']) l`,[ACC]);
    await pool.query(`INSERT INTO client_night_rates (contractor_id,accommodation_id,valid_from,billing_basis,rate_per_night,rate_used,rate_empty,occupancy_floor_pct,contracted_beds,vat_rate)
      VALUES ($1,$2,DATE '1900-01-01','per_bed_night',3500,3500,2400,0.9,31,0.27)`,[CL,ACC]);

    // Workplace spellings deliberately inconsistent — "Ikea" / "IKEA" / " ikea " —
    // to prove the sheet normalises them into one Munkahely label.
    const WP = ['Ikea', 'IKEA', ' ikea ', 'Autoliv Kft', 'Autoliv Kft'];
    const mk = async (i, client, acc, room, wp) => {
      const e = (await pool.query(
        `INSERT INTO employees (contractor_id,billing_client_id,first_name,last_name,accommodation_id,room_id,workplace,arrival_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,DATE '1926-01-01') RETURNING id`,
        [client, client, `Dolgozó${i}`, `Teszt${String(i).padStart(2,'0')}`, acc, room, wp])).rows[0].id;
      emps.push({ id: e, acc, room });
      return e;
    };
    let n = 0;
    for (let i = 0; i < 18; i++) await mk(++n, CL,  ACC,  ROOM,  WP[i % 3]);          // client 1, site 1
    for (let i = 0; i < 8;  i++) await mk(++n, CL,  ACC2, ROOM2, 'Autoliv Kft');       // client 1, site 2
    for (let i = 0; i < 6;  i++) await mk(++n, CL2, ACC2, ROOM2, 'Autoliv Kft');       // client 2, SAME site

    for (let d = 1; d <= 31; d++) {
      const date = `${M}-${String(d).padStart(2,'0')}`;
      for (let i = 0; i < emps.length; i++) {
        const e = emps[i];
        if (i === 0 && d > 20) continue;   // one leaver, so the grid shows a real gap
        await pool.query(`INSERT INTO occupancy_snapshots (snapshot_date,employee_id,accommodation_id,room_id,room_occupant_count) VALUES ($1,$2,$3,$4,1) ON CONFLICT DO NOTHING`,[date,e.id,e.acc,e.room]);
      }
    }

    await engine.calculateMonthlyBilling(M, { runType: 'incoming' });

    // ── build ──
    const land = await svc.landlordSheet({ month: M, landlordId: LL });
    const cli  = await svc.clientSheet({ month: M, clientId: CL });

    check('SS-01 landlord sheet aggregates (accommodation × client) rows up to the property',
      land.accommodations.length === 2, `got ${land.accommodations.length}`);
    check('SS-02 landlord sheet carries the rent basis + rate in force',
      land.accommodations[0].rent_basis === 'per_bed_night' && Number(land.accommodations[0].rent_rate_used) === 2200,
      JSON.stringify({b:land.accommodations[0].rent_basis, r:land.accommodations[0].rent_rate_used}));
    check('SS-03 landlord total = what WE owe', land.totals.cost_total > 0);
    check('SS-04 client sheet spans every site of the client', cli.sites.length === 2, `got ${cli.sites.length}`);
    check('SS-05 client sheet has occupied / empty / reduced bed-nights',
      cli.totals.occupied_bed_nights > 0 && cli.sites[0].reduced_bed_nights >= 0);
    check('SS-06 client sheet has the floor + rates actually applied',
      Number(cli.sites[0].floor_pct) === 0.9 && Number(cli.sites[0].rate_used) === 3500);
    check('SS-07 client sheet has net / VAT / gross', cli.totals.net > 0 && cli.totals.vat > 0 && cli.totals.gross > cli.totals.net);
    check('SS-08 month state is reported', ['ZÁRT','PISZKOZAT'].includes(land.state.label));

    // ── Gap B: the grid ──
    check('SS-09 grid has one row per billed person (26 = 18 + 8 of this client)',
      cli.grid.people.length === 26, `got ${cli.grid.people.length}`);
    check('SS-10 grid has one column per day of the month', cli.grid.days.length === 31);
    const leaver = cli.grid.people.find(p => p.bed_nights === 20);
    check('SS-11 the mid-month leaver shows 20 nights, not 31 (grid is from snapshots)', !!leaver, 
      JSON.stringify(cli.grid.people.map(p=>p.bed_nights)));
    check('SS-12 grid bed-nights reconcile with the billed occupied bed-nights',
      cli.grid.people.reduce((s,p)=>s+p.bed_nights,0) === cli.totals.occupied_bed_nights,
      `grid=${cli.grid.people.reduce((s,p)=>s+p.bed_nights,0)} billed=${cli.totals.occupied_bed_nights}`);

    // ── attribution must be frozen ──
    await pool.query(`UPDATE employees SET billing_client_id=$1 WHERE id=$2`,[LL, emps[1].id]);
    const cli2 = await svc.clientSheet({ month: M, clientId: CL });
    check('SS-13 changing a megbízó afterwards does NOT change a rendered sheet',
      cli2.sites[0].people.length === cli.sites[0].people.length && cli2.totals.gross === cli.totals.gross);
    await pool.query(`UPDATE employees SET billing_client_id=$1 WHERE id=$2`,[CL, emps[1].id]);


    // ── manual-format requirements ──
    check('SS-15 grid carries Munkahely as its own column', cli.grid.people.every(p => 'workplace' in p));
    const wps = [...new Set(cli.grid.people.map(p => p.workplace).filter(Boolean))];
    check('SS-16 workplace spellings normalise to ONE label (Ikea/IKEA/ ikea )',
      wps.filter(w => w.toLowerCase().trim() === 'ikea').length === 1, JSON.stringify(wps));
    check('SS-16b ... and the canonical label keeps sensible casing, not "ikea"',
      wps.includes('Ikea'), JSON.stringify(wps));
    check('SS-16c the variants that were folded are reported, not hidden',
      (cli.grid.workplace_variants || []).some(v => v.seen.length >= 3),
      JSON.stringify(cli.grid.workplace_variants));
    check('SS-17 site + room are separate columns, not inside the name',
      cli.grid.people.every(p => !/szoba|\d{3}/i.test(p.name)));
    check('SS-18 client sheet spans BOTH of the client sites', cli.sites.length === 2, `got ${cli.sites.length}`);
    check('SS-19 "Üres" rows exist where the rate has contracted beds', (cli.empty_rows || []).length > 0);
    check('SS-20 the reconstructed empty beds RECONCILE with what the engine billed',
      cli.empty_reconciles, JSON.stringify(cli.empty_reconciliation));

    // ── landlord must not leak client attribution or client pricing ──
    const landJson = JSON.stringify(land);
    check('SS-21 landlord sheet contains NO client name', !landJson.includes('Teszt Megbízó') && !landJson.includes('Másik Megbízó'));
    check('SS-22 landlord sheet contains no client-side rate (3500/3200)',
      !landJson.includes('"rate_used":3500') && !landJson.includes('"rate_used":3200'));
    check('SS-23 landlord grid shows EVERYONE at their property (all clients mixed)',
      land.grid.people.length === 32, `got ${land.grid.people.length}`);
    check('SS-24 landlord covers both of their properties', land.accommodations.length === 2);

    // ── the client grid must NOT show the other client's workers ──
    check('SS-25 client grid excludes the other client\u2019s workers at the shared site',
      cli.grid.people.length === 26, `got ${cli.grid.people.length}`);

    // ── LANDLORD PRIVACY: check the RENDERED output, not just the data object ──
    {
      const XLSX = require('xlsx');
      const landXlsx = render.renderXlsx(land);
      const wb = XLSX.read(landXlsx, { type: 'buffer' });
      const allCells = [];
      for (const n of wb.SheetNames) {
        for (const row of XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false })) {
          for (const c of (row || [])) if (c != null) allCells.push(String(c));
        }
      }
      const flat = allCells.join(' | ');
      const landPdfTxt = (await require('pdf-parse')(await render.renderPdf(land))).text;

      const leaks = [
        ['ügyfélnév (Teszt Megbízó)', /Teszt Megb[ií]z[oó]/i],
        ['ügyfélnév (Másik Megbízó)', /M[áa]sik Megb[ií]z[oó]/i],
        ['ügyfél-azonosító', new RegExp(CL.slice(0, 8), 'i')],
        ['ügyféloldali díj 3500', /3500/],
        ['ügyféloldali díj 3200', /3200/],
        ['ügyféloldali üres díj 2400', /2400/],
        ['ÁFA/bruttó oszlop', /ÁFA|Bruttó/i],
      ];
      for (const [label, re] of leaks) {
        check(`SS-26 [xlsx] szállásadói lapon NINCS ${label}`, !re.test(flat),
          (flat.match(re) || [''])[0]);
        check(`SS-27 [pdf]  szállásadói lapon NINCS ${label}`, !re.test(landPdfTxt),
          (landPdfTxt.match(re) || [''])[0]);
      }
      // ...and the room label containing the client name must be sanitised, not passed through
      check('SS-28 a szoba felirat sem szivárogtat ügyfélnevet',
        !/TesztMegbizoZrt/i.test(flat) && !/TesztMegbizoZrt/i.test(landPdfTxt));
    }

    // ── render ──
    fs.writeFileSync('/tmp/szallasado.xlsx', render.renderXlsx(land));
    fs.writeFileSync('/tmp/megbizo.xlsx', render.renderXlsx(cli));
    fs.writeFileSync('/tmp/szallasado.pdf', await render.renderPdf(land));
    fs.writeFileSync('/tmp/megbizo.pdf', await render.renderPdf(cli));
    const sz = (f) => fs.statSync(f).size;
    check('SS-14 all four files render non-empty',
      sz('/tmp/szallasado.xlsx')>3000 && sz('/tmp/megbizo.xlsx')>3000 && sz('/tmp/szallasado.pdf')>2000 && sz('/tmp/megbizo.pdf')>2000);

    // ── SHARE LINKS ──
    {
      const ctrl = require('../src/controllers/settlement.controller');
      const mk = (body={}, params={}, q={}) => ({ user:{id:userId,email:'su@test.local',roles:['superadmin']}, body, params, query:q, ip:'127.0.0.1' });
      const res0 = mockRes();
      await ctrl.createLink(mk({ kind:'client', partner_id: CL, month: M, expires_in_days: 7 }), res0);
      check('SH-01 share link minted', res0.statusCode === 201 && !!res0.body?.data?.token);
      const tok = res0.body.data.token;
      check('SH-02 ... URL carries the token only, no partner id',
        res0.body.data.url === `/public/settlement/${tok}` && !res0.body.data.url.includes(CL));

      const res1 = mockRes();
      await ctrl.publicView(mk({}, { token: tok }), res1);
      check('SH-03 public view renders WITHOUT auth', res1.statusCode === 200 && res1.body?.data?.kind === 'client');
      check('SH-04 ... and serves the bound partner only', res1.body.data.partner.id === CL);

      const res2 = mockRes();
      await ctrl.publicView(mk({}, { token: 'not-a-real-token' }), res2);
      check('SH-05 an unknown token is refused', res2.statusCode === 404);

      // expiry is enforced on read, not by a sweeper
      await pool.query(`UPDATE settlement_share_links SET expires_at = now() - interval '1 day' WHERE token=$1`, [tok]);
      const res3 = mockRes();
      await ctrl.publicView(mk({}, { token: tok }), res3);
      check('SH-06 an EXPIRED link is refused', res3.statusCode === 404);
      await pool.query(`UPDATE settlement_share_links SET expires_at = now() + interval '7 days' WHERE token=$1`, [tok]);

      const linkRow = (await pool.query(`SELECT id FROM settlement_share_links WHERE token=$1`, [tok])).rows[0];
      const res4 = mockRes();
      await ctrl.revokeLink(mk({}, { id: linkRow.id }), res4);
      check('SH-07 revoke succeeds', res4.statusCode === 200);
      const res5 = mockRes();
      await ctrl.publicView(mk({}, { token: tok }), res5);
      check('SH-08 a REVOKED link is refused even before expiry', res5.statusCode === 404);

      const cnt = (await pool.query(`SELECT view_count FROM settlement_share_links WHERE token=$1`, [tok])).rows[0];
      check('SH-09 views are counted for the audit trail', Number(cnt.view_count) >= 1, JSON.stringify(cnt));
    }

    console.log('\n--- REFERENCE FIGURES ---');
    console.log('landlord cost_total :', land.totals.cost_total, ' bed_nights:', land.totals.bed_nights);
    console.log('client  net/vat/gross:', cli.totals.net, '/', cli.totals.vat, '/', cli.totals.gross);
    console.log('client  occupied/reduced:', cli.totals.occupied_bed_nights, '/', cli.totals.reduced_bed_nights);
    console.log('month state          :', land.state.label);
    console.log('files: /tmp/szallasado.{xlsx,pdf} /tmp/megbizo.{xlsx,pdf}');
  } catch (e) { console.error('SUITE ERROR:', e.message); failures++; }
  finally {
    const q=(s,p)=>pool.query(s,p).catch(()=>{});
    await q(`DELETE FROM accommodation_billings WHERE billing_month=$1`,[M]);
    await q(`DELETE FROM billing_runs WHERE billing_month=$1`,[M]);
    await q(`DELETE FROM occupancy_snapshots WHERE accommodation_id = ANY($1::uuid[])`,[[ACC,ACC2].filter(Boolean)]);
    await q(`DELETE FROM accommodation_rent_rates WHERE accommodation_id = ANY($1::uuid[])`,[[ACC,ACC2].filter(Boolean)]);
    await q(`DELETE FROM accommodation_utility_lines WHERE accommodation_id = ANY($1::uuid[])`,[[ACC,ACC2].filter(Boolean)]);
    await q(`DELETE FROM client_night_rates WHERE accommodation_id = ANY($1::uuid[])`,[[ACC,ACC2].filter(Boolean)]);
    await q(`DELETE FROM employees WHERE id = ANY($1::uuid[])`,[emps.map(e=>e.id)]);
    await q(`DELETE FROM accommodation_rooms WHERE id = ANY($1::uuid[])`,[[ROOM,ROOM2].filter(Boolean)]);
    await q(`DELETE FROM accommodations WHERE id = ANY($1::uuid[])`,[[ACC,ACC2].filter(Boolean)]);
    await q(`DELETE FROM client_billing_profiles WHERE contractor_id = ANY($1::uuid[])`,[[CL,CL2].filter(Boolean)]);
    await q(`DELETE FROM contractors WHERE id = ANY($1::uuid[])`,[[LL,CL,CL2].filter(Boolean)]);
    console.log(`\n${failures===0?'ALL PASS':failures+' FAILURE(S)'}`);
    await pool.end?.();
    process.exit(failures===0?0:1);
  }
})();
