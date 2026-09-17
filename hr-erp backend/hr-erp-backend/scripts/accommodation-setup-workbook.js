/**
 * "Szálláshely-alapadatok" — kitöltő munkafüzet a hiányzó szerződés- és díjadatokhoz.
 *
 * MIÉRT SÜRGŐS
 * ------------
 * Ahol nincs rögzítve bérleti díj, ott a rendszer NULLA költséggel számol — vagyis a ház
 * margója a teljes bevétel. Ez nem "hiányzó adat", hanem AKTÍVAN FÉLREVEZETŐ szám: a
 * legnagyobb házaknál milliós nagyságrendű nyereséget mutat ott, ahol a valóságban a
 * bérleti díj még le sem lett vonva. Az Útmutató lap ezt számszerűen kimondja.
 *
 *   node scripts/accommodation-setup-workbook.js [kimenet.xlsx]
 */
require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const { query } = require('../src/database/connection');

const OUT = process.argv[2] || `szallas-alapadatok-${new Date().toISOString().slice(0, 10)}.xlsx`;
const ft = (v) => `${Number(v || 0).toLocaleString('hu-HU')} Ft`;

// A tulajdonos által kért sorrend: a legnagyobb kitettség előre.
const SORREND = ['Röjtökmuzsaj', 'Beled', 'Fertőszéplak', 'Petőháza', 'Győr'];

const LINE_HU = {
  viz_csatorna: 'Víz és csatorna', internet: 'Internet', aram: 'Áram',
  gaz: 'Gáz', kozos_koltseg: 'Közös költség', hulladekszallitas: 'Hulladékszállítás',
};

(async () => {
  const accs = (await query(`
    SELECT a.id, a.name, a.address,
           coalesce(c.name, '') AS szallasado,
           coalesce(a.rent_basis, '') AS rent_basis,
           a.rent_amount, a.rent_per_bed_night,
           (SELECT count(*) FROM accommodation_utility_lines u WHERE u.accommodation_id = a.id)::int AS rezsi_sor,
           (SELECT count(*) FROM partner_contracts p WHERE p.accommodation_id = a.id)::int AS szerzodes,
           (SELECT count(DISTINCT o.employee_id) FROM occupancy_snapshots o
             WHERE o.accommodation_id = a.id
               AND o.snapshot_date = (SELECT max(snapshot_date) FROM occupancy_snapshots))::int AS lakok
      FROM accommodations a
      LEFT JOIN contractors c ON c.id = a.current_contractor_id
     WHERE a.is_active`)).rows;

  // Mekkora margó áll bérleti díj nélkül — ez a késlekedés ára, számban.
  const torzit = (await query(`
    SELECT a.name, sum(ab.margin_amount) AS margin
      FROM accommodation_billings ab
      JOIN accommodations a ON a.id = ab.accommodation_id
      JOIN billing_runs br ON br.id = ab.billing_run_id
     WHERE ab.billing_month = '2026-09' AND br.status <> 'cancelled' AND ab.status <> 'cancelled'
       AND a.rent_basis IS NULL
     GROUP BY 1 HAVING sum(ab.margin_amount) > 0 ORDER BY 2 DESC`)).rows;
  const torzitOssz = torzit.reduce((s, r) => s + Number(r.margin), 0);

  const rang = (n) => { const i = SORREND.indexOf(n); return i === -1 ? 99 : i; };
  accs.sort((a, b) => rang(a.name) - rang(b.name) || b.lakok - a.lakok);

  const wb = XLSX.utils.book_new();

  // ── Útmutató ────────────────────────────────────────────────────────────
  const info = [
    ['SZÁLLÁSHELY-ALAPADATOK — kitöltő munkafüzet'],
    [`Készült: ${new Date().toISOString().slice(0, 10)}`],
    [],
    ['MIÉRT SÜRGŐS — amit a hiányzó bérleti díj most okoz'],
    ['  Ahol nincs rögzítve bérleti díj, ott a rendszer NULLA költséggel számol.'],
    ['  A ház margója így a teljes bevétel — vagyis a kimutatás nyereséget mutat ott,'],
    ['  ahol a bérleti díj még le sem lett vonva. Ez nem hiányzó adat, hanem téves szám.'],
    [],
    ['  Ház', '2026-09 kimutatott margó', 'a valóságban ennél KEVESEBB'],
    ...torzit.map((r) => [`  ${r.name}`, ft(r.margin), 'a havi bérleti díjjal csökken']),
    ['  ÖSSZESEN', ft(torzitOssz), 'ennyi a jelenleg felfelé torzított nyereség'],
    [],
    ['MIT KELL KITÖLTENI'],
    ['  1. lap (Alapadatok): szállásadó, bérleti konstrukció, összeg, szerződés adatai.'],
    ['  2. lap (Rezsi-mátrix): tételenként ki fizeti és kinek a nevén van a szerződés.'],
    [],
    ['A BÉRLETI KONSTRUKCIÓ HÁROM FAJTÁJA'],
    ['  fix            — egy fix havi díj az EGÉSZ ingatlanra, a létszámtól függetlenül.'],
    ['  fő-éj          — annyit fizetünk, ahány ember ahány éjszakát ott töltött.'],
    ['  saját tulajdon — a miénk az ingatlan: nincs bérleti díj és nincs szállásadó,'],
    ['                   csak rezsi. (Ilyen ma a Fertőd.)'],
    [],
    ['A FELMONDÁSI IDŐ'],
    ['  Napokban add meg (pl. 60). Ha határozott idejű a szerződés, a "Határozott?"'],
    ['  oszlopba írj "igen"-t és töltsd ki a lejárat dátumát.'],
    [],
    ['FONTOS'],
    ['  • A szállás nevét NE írd át — az azonosít.'],
    ['  • Amit nem tudsz, hagyd üresen; a féladat rosszabb, mint a hiányzó.'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo['!cols'] = [{ wch: 30 }, { wch: 26 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Útmutató');

  // ── 1. lap: alapadatok ──────────────────────────────────────────────────
  const h1 = ['Szálláshely (NE ÍRD ÁT)', 'Cím', 'Lakók ma', 'Szállásadó', 'Bérleti alap (fix / fő-éj / saját tulajdon)',
              'Összeg (Ft/hó vagy Ft/fő/éj)', 'Szerződés kezdete', 'Felmondási idő (nap)',
              'Határozott? (igen/nem)', 'Lejárat (ha határozott)', 'Megjegyzés', 'MI HIÁNYZIK MOST'];
  const BASIS_HU = { flat: 'fix', per_bed_night: 'fő-éj', mixed: 'vegyes', sajat_tulajdon: 'saját tulajdon' };
  const rows1 = accs.map((a) => {
    const hiany = [];
    if (!a.szallasado && a.rent_basis !== 'sajat_tulajdon') hiany.push('szállásadó');
    if (!a.rent_basis) hiany.push('bérleti konstrukció + összeg');
    if (a.szerzodes === 0 && a.rent_basis !== 'sajat_tulajdon') hiany.push('szerződés');
    if (a.rezsi_sor < 6) hiany.push(`rezsi-mátrix (${a.rezsi_sor}/6)`);
    return [
      a.name, a.address || '', a.lakok, a.szallasado,
      BASIS_HU[a.rent_basis] || '',
      a.rent_amount ? Number(a.rent_amount) : (a.rent_per_bed_night ? Number(a.rent_per_bed_night) : ''),
      '', '', '', '', '',
      hiany.length ? hiany.join(' · ') : '— teljes —',
    ];
  });
  const ws1 = XLSX.utils.aoa_to_sheet([h1, ...rows1]);
  ws1['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 9 }, { wch: 28 }, { wch: 34 }, { wch: 26 },
                  { wch: 17 }, { wch: 19 }, { wch: 20 }, { wch: 20 }, { wch: 26 }, { wch: 40 }];
  ws1['!freeze'] = { xSplit: 1, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws1, 'Alapadatok');

  // ── 2. lap: rezsi-mátrix ────────────────────────────────────────────────
  const meglevo = new Map((await query(
    `SELECT accommodation_id, line, who_pays, contract_holder, passthrough, passthrough_pct
       FROM accommodation_utility_lines`)).rows.map((r) => [`${r.accommodation_id}|${r.line}`, r]));

  const h2 = ['Szálláshely (NE ÍRD ÁT)', 'Tétel (NE ÍRD ÁT)', 'Ki fizeti? (mi / szállásadó)',
              'Kinek a nevén? (mi / szállásadó)', 'Továbbszámlázzuk a megbízónak? (igen/nem)',
              'Milyen arányban (%)', 'Megjegyzés'];
  const rows2 = [];
  for (const a of accs) {
    for (const line of Object.keys(LINE_HU)) {
      const m = meglevo.get(`${a.id}|${line}`);
      rows2.push([
        a.name, LINE_HU[line],
        m ? (m.who_pays === 'mi' ? 'mi' : 'szállásadó') : '',
        m ? (m.contract_holder === 'mi' ? 'mi' : 'szállásadó') : '',
        m ? (m.passthrough ? 'igen' : 'nem') : '',
        m ? Number(m.passthrough_pct) : '',
        m ? '' : '⚠ kitöltendő',
      ]);
    }
  }
  const ws2 = XLSX.utils.aoa_to_sheet([h2, ...rows2]);
  ws2['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 26 }, { wch: 28 }, { wch: 38 }, { wch: 18 }, { wch: 16 }];
  ws2['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws2, 'Rezsi-mátrix');

  fs.writeFileSync(OUT, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log(`\n✓ ${OUT}\n  ${accs.length} szálláshely · ${rows2.length} rezsi sor`);
  console.log(`  felfelé torzított margó: ${ft(torzitOssz)}\n`);
  for (const a of accs.slice(0, 6)) {
    console.log(`  ${a.name.padEnd(22)} ${String(a.lakok).padStart(3)} lakó   `
      + `${a.rent_basis ? BASIS_HU[a.rent_basis] : '⚠ nincs díj'}`);
  }
  console.log('');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
