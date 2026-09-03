/**
 * Sales pipeline — leads → opportunities → quotes (mig 150).
 *
 * The assertion that matters is QA-*: accepting a quote must MATERIALISE into the
 * billing engine — a partner_contracts row and client_night_rates rows — and the
 * resulting rate must actually bill. A pipeline that records an agreed price the engine
 * cannot see is worse than no pipeline: it looks done and bills nothing.
 *
 * Sandbox only.
 *   DB_NAME=hr_erp_sandbox DB_USER=$(whoami) node tests/salesPipeline.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const svc = require('../src/services/sales.service');
const engine = require('../src/services/billingEngine.service');

let failures = 0;
const check = (l, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${d && !c ? `  [${d}]` : ''}`); if (!c) failures++; };
const M = '1941-07';

(async () => {
  let U1, U2, ACC, ROOM, madeLead, madeOpp, madeQuote, convertedContractor, emps = [];
  const asUser = (id, all = true) => ({
    user: { id, email: 'u@test.local', roles: all ? ['superadmin'] : ['user'],
            permissions: all ? ['sales.view','sales.edit','sales.all.view','sales.quotes.accept'] : ['sales.view','sales.edit'] },
    body: {}, params: {}, query: {},
  });

  try {
    if (!/sandbox/i.test(process.env.DB_NAME || '')) throw new Error('sandbox only');
    const st = Date.now();
    const us = await pool.query('SELECT id FROM users ORDER BY created_at LIMIT 2');
    U1 = us.rows[0].id; U2 = us.rows[1]?.id || U1;

    ACC = (await pool.query(
      `INSERT INTO accommodations (name,type,capacity,status) VALUES ($1,'dormitory',20,'available') RETURNING id`,
      ['SP Szálló ' + st])).rows[0].id;
    ROOM = (await pool.query(
      `INSERT INTO accommodation_rooms (accommodation_id,room_number,beds,is_active) VALUES ($1,'1',20,true) RETURNING id`, [ACC])).rows[0].id;
    await pool.query(
      `INSERT INTO accommodation_rent_rates (accommodation_id,rent_basis,rent_per_bed_night,valid_from)
       VALUES ($1,'per_bed_night',1500,DATE '1900-01-01')`, [ACC]);

    // ── LEADS ──────────────────────────────────────────────────────────────
    const lead = await svc.saveLead(asUser(U1), null, {
      name: 'SP Érdeklődő Kft', source: 'ajánlás', industry: 'logisztika',
      expected_headcount: 40, notes: 'Első egyeztetés megtörtént.',
    });
    madeLead = lead.id;
    check('LD-01 lead created, owner stamped', lead.status === 'new' && lead.owner_user_id === U1);

    let lostRejected = false;
    try { await svc.saveLead(asUser(U1), lead.id, { name: lead.name, status: 'lost' }); }
    catch (e) { lostRejected = /indoklás/.test(e.message); }
    check('LD-02 losing a lead without a reason is refused', lostRejected);

    let convRejected = false;
    try { await svc.saveLead(asUser(U1), lead.id, { name: lead.name, status: 'converted' }); }
    catch (e) { convRejected = /konvertálás/i.test(e.message); }
    check('LD-03 status cannot be set to converted by a field edit', convRejected);

    // Phase 2 activities work on leads too
    const partner = require('../src/services/partner.service');
    await partner.createActivity(asUser(U1), { lead_id: lead.id, kind: 'call', subject: 'SP Bemutatkozó hívás' });
    check('LD-04 partner_activities (Phase 2) accepts a LEAD as its party',
      (await partner.listActivities(asUser(U1), { lead_id: lead.id })).length === 1);

    // ── OPPORTUNITY ────────────────────────────────────────────────────────
    let partyRejected = false;
    try { await svc.saveOpportunity(asUser(U1), null, { lead_id: lead.id, contractor_id: U1, title: 'x' }); }
    catch (e) { partyRejected = /Pontosan egy fél/.test(e.message); }
    check('OP-01 an opportunity must name exactly one party', partyRejected);

    const opp = await svc.saveOpportunity(asUser(U1), null, {
      lead_id: lead.id, title: 'SP 40 fő elhelyezés', stage: 'qualified',
      expected_headcount: 40, expected_monthly_value: 4200000, probability: 60,
      expected_close_date: '1941-06-30',
    });
    madeOpp = opp.id;
    check('OP-02 opportunity created against the lead', opp.lead_id === lead.id && opp.stage === 'qualified');

    let lostOppRejected = false;
    try { await svc.saveOpportunity(asUser(U1), opp.id, { lead_id: lead.id, title: opp.title, stage: 'lost' }); }
    catch (e) { lostOppRejected = /indoklás/.test(e.message); }
    check('OP-03 losing an opportunity without a reason is refused', lostOppRejected);

    const board = await svc.pipelineBoard(asUser(U1));
    const qualified = board.find((b) => b.stage === 'qualified');
    check('OP-04 kanban board reports count + weighted value',
      qualified.count >= 1 && qualified.weighted > 0, JSON.stringify(qualified));

    // ── QUOTE ──────────────────────────────────────────────────────────────
    let basisRejected = false;
    try {
      await svc.saveQuote(asUser(U1), null, { opportunity_id: opp.id, lines: [{ billing_basis: 'havidij', rate_per_night: 1 }] });
    } catch (e) { basisRejected = /billing_basis/.test(e.message); }
    check('QT-01 a basis outside the client_night_rates vocabulary is refused', basisRejected);

    let flatRejected = false;
    try {
      await svc.saveQuote(asUser(U1), null, { opportunity_id: opp.id, lines: [{ billing_basis: 'flat', flat_amount: 100 }] });
    } catch (e) { flatRejected = /szálláshely/.test(e.message); }
    check('QT-02 a flat line without an accommodation is refused (as client_night_rates requires)', flatRejected);

    const quote = await svc.saveQuote(asUser(U1), null, {
      opportunity_id: opp.id, valid_until: '1941-08-31', vat_rate: 0.27,
      lines: [
        { description: 'Ágyblokk', accommodation_id: ACC, billing_basis: 'per_bed_night',
          rate_used: 3500, rate_empty: 2400, occupancy_floor_pct: 0.9, contracted_beds: 20, quantity: 620 },
      ],
    });
    madeQuote = quote.id;
    check('QT-03 quote created as version 1, draft', quote.version === 1 && quote.status === 'draft');
    check('QT-04 totals derived from the lines (620 × 3500 = 2 170 000 net)',
      Number(quote.net_amount) === 2170000, `${quote.net_amount}`);
    check('QT-05 VAT + gross derived (27%)',
      Number(quote.vat_amount) === 585900 && Number(quote.gross_amount) === 2755900,
      `${quote.vat_amount}/${quote.gross_amount}`);

    // Sharing a draft would invite a reaction to numbers we have not committed to.
    let shareDraftRejected = false;
    try { await svc.shareQuote(asUser(U1), quote.id, {}); }
    catch (e) { shareDraftRejected = /Piszkozat/.test(e.message); }
    check('QT-06 a DRAFT quote cannot be shared', shareDraftRejected);

    await svc.sendQuote(asUser(U1), quote.id, {});
    let editSentRejected = false;
    try { await svc.saveQuote(asUser(U1), quote.id, { lines: [] }); }
    catch (e) { editSentRejected = /piszkozat/i.test(e.message); }
    check('QT-07 a SENT quote is not edited in place — a new version is required', editSentRejected);

    const share = await svc.shareQuote(asUser(U1), quote.id, { expires_in_days: 7 });
    check('QT-08 a sent quote can be shared by expiring token', !!share.share_token && share.url.includes('/public/quote/'));
    const pub = await svc.publicQuoteByToken(share.share_token);
    check('QT-09 the public view returns the offer', !!pub && Number(pub.gross_amount) === 2755900);
    check('QT-10 the public view withholds our commercial position (probability / expected value / owner)',
      !('probability' in pub) && !('expected_monthly_value' in pub) && !('owner_user_id' in pub));
    await svc.revokeQuoteShare(asUser(U1), quote.id);
    check('QT-11 a revoked share stops resolving', (await svc.publicQuoteByToken(share.share_token)) === null);

    // ── ACCEPT while still a LEAD must be refused ──────────────────────────
    let acceptOnLead = false;
    try { await svc.acceptQuote(asUser(U1), quote.id, {}); }
    catch (e) { acceptOnLead = /konvertáld/i.test(e.message); }
    check('QA-01 a quote on a LEAD cannot be accepted — a rate needs a real partner', acceptOnLead);

    // ── CONVERT ────────────────────────────────────────────────────────────
    const conv = await svc.convertLead(asUser(U1), lead.id, { tax_number: '11111111-2-11' });
    convertedContractor = conv.contractor_id;
    check('CV-01 conversion creates a contractor', !!convertedContractor);
    check('CV-02 the lead is kept and marked converted (pipeline history survives)',
      conv.lead.status === 'converted' && conv.lead.converted_contractor_id === convertedContractor);
    const roles = await pool.query(`SELECT role FROM contractor_roles WHERE contractor_id=$1`, [convertedContractor]);
    check('CV-03 the new contractor is tagged megbízó', roles.rows.some((r) => r.role === 'megbizo'));
    const movedOpp = (await pool.query('SELECT lead_id, contractor_id FROM opportunities WHERE id=$1', [opp.id])).rows[0];
    check('CV-04 the OPEN opportunity follows the client', movedOpp.lead_id === null && movedOpp.contractor_id === convertedContractor);
    const movedAct = (await pool.query('SELECT contractor_id FROM partner_activities WHERE lead_id IS NULL AND contractor_id=$1', [convertedContractor])).rows;
    check('CV-05 activities are re-parented, not orphaned', movedAct.length === 1);

    // ── ACCEPT → MATERIALISE ───────────────────────────────────────────────
    const acc = await svc.acceptQuote(asUser(U1), quote.id, { valid_from: `${M}-01`, notice_days: 60 });
    check('QA-02 accept returns the contract and rate it produced',
      !!acc.contract_id && acc.rate_ids.length === 1);

    const contract = (await pool.query('SELECT * FROM partner_contracts WHERE id=$1', [acc.contract_id])).rows[0];
    check('QA-03 a megbízó contract now exists for the client',
      contract.contract_role === 'megbizo' && contract.contractor_id === convertedContractor && contract.status === 'active');

    const rate = (await pool.query('SELECT * FROM client_night_rates WHERE id=$1', [acc.rate_ids[0]])).rows[0];
    check('QA-04 the rate mirrors the quote line exactly',
      rate.billing_basis === 'per_bed_night' && Number(rate.rate_used) === 3500
      && Number(rate.rate_empty) === 2400 && Number(rate.occupancy_floor_pct) === 0.9
      && rate.contracted_beds === 20 && rate.accommodation_id === ACC);
    check('QA-05 the quote records what it materialised into', 
      (await pool.query('SELECT materialised_contract_id, status FROM quotes WHERE id=$1',[quote.id])).rows[0].materialised_contract_id === acc.contract_id);
    check('QA-06 the opportunity is won', 
      (await pool.query('SELECT stage, won_at FROM opportunities WHERE id=$1',[opp.id])).rows[0].stage === 'won');

    let reAccept = false;
    try { await svc.acceptQuote(asUser(U1), quote.id, {}); } catch (e) { reAccept = /már elfogadott/.test(e.message); }
    check('QA-07 a quote cannot be accepted twice', reAccept);

    // ── THE REAL PROOF: the materialised rate BILLS ────────────────────────
    await pool.query(`INSERT INTO client_billing_profiles (contractor_id) VALUES ($1) ON CONFLICT DO NOTHING`, [convertedContractor]);
    for (let i = 0; i < 10; i++) {
      const e = (await pool.query(
        `INSERT INTO employees (contractor_id,billing_client_id,first_name,last_name,accommodation_id,room_id,arrival_date)
         VALUES ($1,$1,$2,'SP',$3,$4,DATE '1941-01-01') RETURNING id`,
        [convertedContractor, `Dolgozo${i}`, ACC, ROOM])).rows[0].id;
      emps.push(e);
    }
    for (let d = 1; d <= 31; d++) {
      const date = `${M}-${String(d).padStart(2,'0')}`;
      for (const e of emps) {
        await pool.query(
          `INSERT INTO occupancy_snapshots (snapshot_date,employee_id,accommodation_id,room_id,room_occupant_count)
           VALUES ($1,$2,$3,$4,10) ON CONFLICT DO NOTHING`, [date, e, ACC, ROOM]);
      }
    }
    await engine.calculateMonthlyBilling(M, { runType: 'incoming' });
    const billed = (await pool.query(
      `SELECT ab.total_amount, ab.calculation_details FROM accommodation_billings ab
         JOIN billing_runs br ON br.id = ab.billing_run_id
        WHERE ab.accommodation_id=$1 AND ab.billing_month=$2 AND br.status<>'cancelled'`, [ACC, M])).rows[0];
    check('QA-08 the accepted quote BILLS — a billing row exists for the new client', !!billed);
    // 10 occupied + floor(20×0.9)=18 → full=18, reduced=2 : (18×3500 + 2×2400) × 31
    const expected = (18 * 3500 + 2 * 2400) * 31;
    check('QA-09 ... at the quoted rates, floor applied (18×3500 + 2×2400) × 31',
      Math.abs(Number(billed.total_amount) - expected) < 1, `${billed.total_amount} vs ${expected}`);
    check('QA-10 ... and the engine used the quoted per-bed rate',
      Number(billed.calculation_details?.per_bed?.rate_used) === 3500);

    // ── QUOTE PDF ──────────────────────────────────────────────────────────
    {
      const fs = require('fs');
      const pdfSvc = require('../src/services/quotePdf.service');
      const pdfParse = require('pdf-parse');
      const forDoc = await svc.quoteForDocument(quote.id);
      const buf = await pdfSvc.renderQuotePdf(forDoc, {
        partner_name: forDoc.partner_name, opportunity_title: forDoc.opportunity_title });
      fs.writeFileSync('/tmp/arajanlat.pdf', buf);
      const parsed = await pdfParse(buf);
      const txt = parsed.text;

      check('PD-01 the offer PDF renders', buf.length > 5000 && parsed.numpages >= 1, `${buf.length}b / ${parsed.numpages}p`);
      check('PD-02 Hungarian ő/ű survive (the WinAnsi trap)',
        txt.includes('Árajánlat') && /Elszámolási feltételek/.test(txt));
      check('PD-03 it names the partner and the subject',
        txt.includes(forDoc.partner_name) && txt.includes('SP 40 fő elhelyezés'));
      check('PD-04 it carries the money block', /Nettó összesen/.test(txt) && /Bruttó összesen/.test(txt));
      // Normalise whitespace before matching: pdf-parse reinserts the PDF's own line
      // breaks, so "min. kihasználtság" arrives split across two lines.
      const flat = txt.replace(/\s+/g, ' ');
      check('PD-05 the per-bed terms are spelled out, not truncated',
        /foglalt ágy/.test(flat) && /min\. kihasználtság: 90%/.test(flat)
        && /lekötött ágy: 20/.test(flat) && /üres ágy/.test(flat));
      // hu-HU does not space-group four-digit numbers (3500), but does group the
      // seven-digit totals (2 170 000) — assert both forms as they actually render.
      check('PD-06 it shows the quoted rate and the grouped totals',
        /3500 Ft \/ foglalt ágy/.test(flat) && flat.includes('2 170 000 Ft'));
      check('PD-07 it withholds our position (probability / expected value / owner)',
        !/valószínűség/i.test(txt) && !/4 200 000/.test(txt) && !txt.includes(U1));
      check('PD-08 an accepted quote is not labelled PISZKOZAT', !/PISZKOZAT/.test(txt), 'status=' + forDoc.status);
      check('PD-09 the filename is partner-scoped',
        pdfSvc.quoteFileBase(forDoc, { partner_name: forDoc.partner_name }).startsWith('arajanlat-'));
      console.log('   → /tmp/arajanlat.pdf (' + parsed.numpages + ' oldal, ' + buf.length + ' byte)');
    }

    // ── SCOPING ────────────────────────────────────────────────────────────
    const other = asUser(U2, false);          // no settings.edit → scoped
    const visible = await svc.listLeads(other, {});
    check('SC-01 a non-privileged user sees no other owner’s leads',
      !visible.some((l) => l.id === madeLead), `${visible.length} visible`);
    check('SC-02 ... and cannot fetch one by id (404, not 403)',
      (await svc.getQuote(other, quote.id).then(() => false).catch((e) => e.status === 404)));
    const mine = await svc.listLeads(asUser(U2, false), {});
    check('SC-03 a privileged user still sees everything',
      (await svc.listLeads(asUser(U1), {})).some((l) => l.id === madeLead));
    // The manager grant is what widens visibility — not settings.edit, and not a role.
    const mgr = asUser(U2, false);
    mgr.user.permissions = ['sales.view', 'sales.edit', 'sales.all.view'];
    check('SC-04 sales.all.view is what widens visibility to every owner',
      (await svc.listLeads(mgr, {})).some((l) => l.id === madeLead));
  } catch (e) { console.error('SUITE ERROR:', e.message); failures++; }
  finally {
    const q=(s,p)=>pool.query(s,p).catch(()=>{});
    await q(`DELETE FROM accommodation_billings WHERE billing_month=$1`,[M]);
    await q(`DELETE FROM billing_runs WHERE billing_month=$1`,[M]);
    await q(`DELETE FROM occupancy_snapshots WHERE accommodation_id=$1`,[ACC]);
    await q(`DELETE FROM employees WHERE id = ANY($1::uuid[])`,[emps]);
    await q(`DELETE FROM quote_lines WHERE quote_id=$1`,[madeQuote]);
    await q(`DELETE FROM quotes WHERE id=$1`,[madeQuote]);
    await q(`DELETE FROM opportunities WHERE id=$1`,[madeOpp]);
    await q(`DELETE FROM partner_activities WHERE lead_id=$1 OR contractor_id=$2`,[madeLead, convertedContractor]);
    await q(`DELETE FROM partner_contracts WHERE contractor_id=$1`,[convertedContractor]);
    await q(`DELETE FROM client_night_rates WHERE contractor_id=$1`,[convertedContractor]);
    await q(`DELETE FROM client_billing_profiles WHERE contractor_id=$1`,[convertedContractor]);
    await q(`DELETE FROM partner_leads WHERE id=$1`,[madeLead]);
    await q(`DELETE FROM contractor_roles WHERE contractor_id=$1`,[convertedContractor]);
    await q(`DELETE FROM contractors WHERE id=$1`,[convertedContractor]);
    await q(`DELETE FROM accommodation_rent_rates WHERE accommodation_id=$1`,[ACC]);
    await q(`DELETE FROM accommodation_rooms WHERE id=$1`,[ROOM]);
    await q(`DELETE FROM accommodations WHERE id=$1`,[ACC]);
    console.log(`\n${failures===0?'ALL PASS':failures+' FAILURE(S)'}`);
    await pool.end?.();
    process.exit(failures===0?0:1);
  }
})();
