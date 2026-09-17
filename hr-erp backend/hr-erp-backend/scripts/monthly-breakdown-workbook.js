/**
 * Tételes havi levezetés szállásonként — ellenőrzésre, a szerződések mellé.
 *
 * MIT MUTAT MEG, AMIT A DASHBOARD NEM
 * -----------------------------------
 * Nem összegeket, hanem a LEVEZETÉST: hány fő, milyen munkahelyről, hány éjszaka, melyik
 * díjsorból, mennyi nettó/ÁFA/bruttó — és a költségoldalon ugyanígy, tételesen. Minden
 * szám mellé odaírja, honnan jön, hogy a szerződéssel összevethető legyen.
 *
 * ÉS AMIT KÜLÖN KIMOND: MELYIK ADAT HIÁNYZIK
 * ------------------------------------------
 * Ahol nincs rögzítve bérleti díj, ott a rendszer nullával számol, és a margó a teljes
 * bevétel — ez nem "üres mező", hanem téves szám a kimutatásban. Minden blokk végén ott
 * áll, hogy az adott ház száma miért és mennyivel torzít.
 *
 *   node scripts/monthly-breakdown-workbook.js 2026-09 [kimenet.xlsx]
 */
require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const { query } = require('../src/database/connection');

/** Helyi dátumrészekből — a String(Date) »Wed Sep 16« alakot ad, a toISOString() pedig
 *  Budapesten egy nappal visszatol. */
const ymd = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const HONAP = process.argv[2] && /^\d{4}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : '2026-09';
const OUT = process.argv[3] || `havi-levezetes-${HONAP}.xlsx`;

const BASIS_HU = {
  flat: 'fix havi díj', per_bed_night: 'fő-éjszaka alapú', mixed: 'vegyes (fix + rezsi)',
  sajat_tulajdon: 'saját tulajdon (nincs bérleti díj)',
};
const LINE_HU = {
  viz_csatorna: 'Víz és csatorna', internet: 'Internet', aram: 'Áram',
  gaz: 'Gáz', kozos_koltseg: 'Közös költség', hulladekszallitas: 'Hulladékszállítás',
};

(async () => {
  const sorok = (await query(`
    SELECT a.id AS acc_id, a.name AS szallas, a.rent_basis, a.rent_amount, a.rent_per_bed_night,
           coalesce(c.name, '') AS szallasado,
           coalesce(w.name, '(nincs munkahely)') AS munkahely,
           ab.total_employee_days AS fo_ej, ab.total_amount AS netto, ab.vat_amount AS afa,
           ab.gross_amount AS brutto, ab.cost_amount AS koltseg, ab.margin_amount AS margin,
           ab.calculation_details AS reszlet
      FROM accommodation_billings ab
      JOIN accommodations a ON a.id = ab.accommodation_id
      JOIN billing_runs br ON br.id = ab.billing_run_id
      LEFT JOIN contractors c ON c.id = a.current_contractor_id
      LEFT JOIN workplaces w ON w.id = ab.workplace_id
     WHERE ab.billing_month = $1 AND br.status <> 'cancelled' AND ab.status <> 'cancelled'
     ORDER BY a.name, w.name`, [HONAP])).rows;

  const kiadasok = (await query(`
    SELECT e.accommodation_id, e.category, e.utility_line, e.vendor_name, e.invoice_number,
           e.amount, e.cost_bearer
      FROM accommodation_expenses e
     WHERE e.billing_month = $1 AND e.deleted_at IS NULL`, [HONAP])).rows;

  const matrix = (await query(`
    SELECT accommodation_id, line, who_pays, passthrough, passthrough_pct
      FROM accommodation_utility_lines`)).rows;

  const hazak = new Map();
  for (const r of sorok) {
    if (!hazak.has(r.szallas)) hazak.set(r.szallas, { meta: r, csoportok: [] });
    hazak.get(r.szallas).csoportok.push(r);
  }

  const aoa = [];
  const N = (v) => Number(v || 0);
  const push = (...cells) => aoa.push(cells);

  // A lefedettség a LAP TETEJÉN, nem lábjegyzetben: egy félig telt hónap kevesebb
  // bevételt mutat, ami visszaesésnek látszik, holott csak hiányzik a hónap másik fele.
  const cov = (await query(
    `SELECT count(DISTINCT snapshot_date)::int AS napok, max(snapshot_date) AS utolso
       FROM occupancy_snapshots WHERE to_char(snapshot_date,'YYYY-MM') = $1`, [HONAP])).rows[0];
  const [yy, mm] = HONAP.split('-').map(Number);
  const honapNapjai = new Date(yy, mm, 0).getDate();
  const reszHonap = (cov.napok || 0) < honapNapjai;

  push(`TÉTELES HAVI LEVEZETÉS — ${HONAP}`);
  push(`Készült: ${new Date().toISOString().slice(0, 10)}`);
  if (reszHonap) {
    push('');
    push('⚠⚠⚠  RÉSZHÓNAP  ⚠⚠⚠');
    push(`Foglaltsági adat: ${cov.napok} nap a ${honapNapjai}-ból`
       + (cov.utolso ? `  (utolsó adatnap: ${ymd(cov.utolso)})` : ''));
    push('Az alábbi számok NEM hasonlíthatók össze egy lezárt, teljes hónappal:');
    push(`a hónapból még ${honapNapjai - cov.napok} nap hiányzik.`);
    push('');
  } else {
    push(`Teljes hónap: ${cov.napok}/${honapNapjai} nap foglaltsági adat.`);
  }
  push('Minden szám mellett ott a forrása, hogy a szerződéssel összevethető legyen.');
  push('');

  let torzitOssz = 0;

  for (const [nev, h] of [...hazak.entries()].sort()) {
    const m = h.meta;
    // A részleteket abból a csoportból vesszük, amelyiknek VAN érvényes díja: a nulla
    // bevételű sor vat_rate-je 0, és abból 0%-os ÁFA-kulcs kerülne a fejlécbe.
    const d0 = (h.csoportok.find((g) => Number(g.netto) > 0) || h.csoportok[0])?.reszlet || {};
    const hianyok = [];

    push('══════════════════════════════════════════════════════════════');
    push(nev, m.szallasado ? `szállásadó: ${m.szallasado}` : '⚠ nincs szállásadó rögzítve');
    push('');

    // ── BEVÉTEL ───────────────────────────────────────────────────────────
    push('BEVÉTEL');
    push('', 'munkahely', 'fő', 'fő-éjszaka', 'napidíj (Ft)', 'nettó (Ft)');
    let netto = 0; let afa = 0; let brutto = 0;
    for (const g of h.csoportok) {
      const pb = g.reszlet?.per_bed || {};
      const dij = pb.rate_used != null ? N(pb.rate_used) : null;
      const fo = pb.avg_occupied_beds != null ? N(pb.avg_occupied_beds) : '';
      push('', g.munkahely, fo, N(g.fo_ej), dij === null ? '⚠ nincs díjsor' : dij, N(g.netto));
      netto += N(g.netto); afa += N(g.afa); brutto += N(g.brutto);
      if (dij === null || dij === 0) {
        hianyok.push(`a(z) "${g.munkahely}" körre nincs érvényes díjsor — ${N(g.fo_ej)} fő-éjszaka nem számlázódik`);
      }
    }
    push('', '', '', '', 'nettó összesen', netto);
    push('', '', '', '', `ÁFA (${Math.round(N(d0.vat_rate) * 100)}%)`, afa);
    push('', '', '', '', 'BRUTTÓ', brutto);
    if (d0.month_to_date) {
      push('', `⚠ RÉSZHÓNAP: ${d0.billable_days} nap számolva a ${d0.days_in_month}-ból `
        + `— a teljes hónapra vetítve kb. ${Math.round(netto / d0.billable_days * d0.days_in_month).toLocaleString('hu-HU')} Ft nettó`);
    }
    push('');

    // ── KÖLTSÉG ───────────────────────────────────────────────────────────
    push('KÖLTSÉG');
    const basis = m.rent_basis;
    push('', 'bérleti konstrukció', basis ? BASIS_HU[basis] : '⚠ NINCS BEÁLLÍTVA');
    const rentCost = N(d0.rent_site_total);
    if (!basis) {
      hianyok.push('nincs bérleti konstrukció — a rendszer NULLA bérleti díjjal számol');
    } else if (basis === 'flat' || basis === 'mixed') {
      push('', 'havi díj', `${N(m.rent_amount).toLocaleString('hu-HU')} Ft/hó`);
      push('', 'számítás', `${N(m.rent_amount).toLocaleString('hu-HU')} ÷ ${d0.days_in_month} nap × ${d0.billable_days} nap`);
    } else if (basis === 'per_bed_night') {
      push('', 'díj', `${N(m.rent_per_bed_night).toLocaleString('hu-HU')} Ft/fő/éj`);
      push('', 'számítás', `${N(d0.rent_bed_nights)} fő-éjszaka × ${N(m.rent_per_bed_night).toLocaleString('hu-HU')} Ft`);
    }
    push('', 'bérleti díj a hónapra', rentCost);

    const sajat = kiadasok.filter((k) => k.accommodation_id === m.acc_id && k.cost_bearer === 'sajat');
    const rezsi = sajat.filter((k) => k.category === 'rezsi');
    const egyeb = sajat.filter((k) => k.category !== 'rezsi');
    push('');
    push('', 'rezsi tételek, amiket MI fizetünk');
    if (rezsi.length === 0) push('', '', '— nincs rögzített rezsi tétel erre a hónapra —');
    for (const k of rezsi) {
      push('', '', LINE_HU[k.utility_line] || k.category, k.vendor_name || '', k.invoice_number || '', N(k.amount));
    }
    const mx = matrix.filter((x) => x.accommodation_id === m.acc_id);
    if (mx.length < 6) hianyok.push(`rezsi-mátrix hiányos (${mx.length}/6 sor) — nem tudni, melyik tételt ki fizeti`);

    if (egyeb.length) {
      push('');
      push('', 'egyéb besorolt számlák');
      for (const k of egyeb) push('', '', k.category, k.vendor_name || '', k.invoice_number || '', N(k.amount));
    }

    const kiadasOssz = sajat.reduce((s, k) => s + N(k.amount), 0);
    const koltsegOssz = h.csoportok.reduce((s, g) => s + N(g.koltseg), 0);
    push('');
    push('', 'KÖLTSÉG ÖSSZESEN', '', '', '', koltsegOssz);
    push('', '  ebből bérleti díj', '', '', '', rentCost);
    push('', '  ebből rezsi és egyéb', '', '', '', kiadasOssz);

    // ── MARGÓ ─────────────────────────────────────────────────────────────
    const margin = h.csoportok.reduce((s, g) => s + N(g.margin), 0);
    push('');
    push('', 'MARGÓ (nettó bevétel − költség)', '', '', '', margin);

    if (hianyok.length) {
      push('');
      push('', '⚠ EZ A SZÁM TORZÍT — hiányzó adatok:');
      for (const x of hianyok) push('', '', x);
      if (!basis && margin > 0) {
        torzitOssz += margin;
        push('', '', `a margó felfelé torzít: a bérleti díj NINCS levonva belőle`);
      }
    } else {
      push('', '✓ minden alapadat megvan ehhez a házhoz');
    }
    push('');
  }

  push('══════════════════════════════════════════════════════════════');
  push('ÖSSZESÍTŐ');
  push('', 'felfelé torzított margó (bérleti díj nélkül számolt házak)', '', '', '', torzitOssz);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 3 }, { wch: 34 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(XLSX.utils.book_new(), ws, 'x');   // csak a méretezéshez
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Levezetés ${HONAP}`);
  fs.writeFileSync(OUT, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  console.log(`\n✓ ${OUT} — ${hazak.size} szálláshely, ${HONAP}`);
  console.log(`  felfelé torzított margó: ${torzitOssz.toLocaleString('hu-HU')} Ft\n`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
