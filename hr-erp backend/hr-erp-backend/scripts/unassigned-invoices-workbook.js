/**
 * Besorolatlan számlák — döntési munkafüzet.
 *
 * Azokat a számlákat szedi össze, amelyeknek az allokációján NINCS szálláshely. Ez
 * kétféle sort jelent, és a kettőt külön kell látni:
 *   • "ÁLTALÁNOS" — van allokáció, de szállás nélkül (cégszintű költségként rögzítve),
 *   • "NINCS ALLOKÁCIÓ" — egyáltalán nincs allokációs sora; ez nyitott ügy, nem döntés.
 *
 * A "Döntés" oszlop üresen megy ki. A Segédlet lap a szállásneveket ÉLES adatból
 * sorolja fel, mert egy elgépelt név a visszatöltésnél nem talál házat.
 *
 * A második lap a MÁR besorolt számlákat mutatja. Nem dísz: csak így látszik, hogy a
 * lista teljes, és hogy egy meglévő besorolás is felülvizsgálható.
 *
 * MEGERŐSÍTETT CÉGSZINTŰEK: amelyik allokáció jegyzete a "[CÉGSZINTŰ — MEGERŐSÍTVE"
 * előtaggal kezdődik, az KIKERÜL a döntendők közül. Enélkül a munkafüzet minden körben
 * újra felkínálná ugyanazt a hét számlát, mert a rendszer nem tud különbséget tenni
 * "még nem néztük meg" és "átnéztük, cégszintű" között. (Szöveges jelölő, nem mező —
 * ha tartós marad, rendes oszlopot érdemel.)
 *
 *   node scripts/unassigned-invoices-workbook.js [kimenet.xlsx]
 */
require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const { query } = require('../src/database/connection');

const OUT = process.argv[2] || 'besorolatlan-szamlak.xlsx';

/** Helyi dátumrészekből — a toISOString() Budapesten egy nappal visszatol. */
const ymd = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
// A leírás többsoros lehet (tételes rezsibontás); egy cellában egy sorba fűzve olvasható.
const egySor = (s) => String(s || '').replace(/\s*\n+\s*/g, ' · ').trim();

const SZAMLAK = `
  SELECT i.invoice_date, i.invoice_number, coalesce(i.vendor_name,'?') AS vendor,
         i.total_amount, coalesce(ic.name,'—') AS kategoria, coalesce(i.description,'') AS leiras,
         i.payment_status,
         (SELECT string_agg(coalesce(a.name,'ÁLTALÁNOS'),', ')
            FROM invoice_allocations al LEFT JOIN accommodations a ON a.id=al.accommodation_id
           WHERE al.invoice_id=i.id) AS allokacio,
         EXISTS (SELECT 1 FROM invoice_allocations al2
                  WHERE al2.invoice_id=i.id AND al2.accommodation_id IS NULL
                    AND coalesce(al2.note,'') LIKE '[CÉGSZINTŰ — MEGERŐSÍTVE%') AS megerositett
    FROM invoices i LEFT JOIN invoice_categories ic ON ic.id=i.category_id
   WHERE i.deleted_at IS NULL
   ORDER BY i.invoice_date, i.invoice_number`;

(async () => {
  const rows = (await query(SZAMLAK)).rows;
  const nincsHaz = rows.filter((r) => !r.megerositett
    && (!r.allokacio || r.allokacio.split(', ').every((x) => x === 'ÁLTALÁNOS')));
  const vanHaz = rows.filter((r) => !nincsHaz.includes(r));

  const FEJ = ['Dátum', 'Számlaszám', 'Szállító', 'Összeg (Ft)', 'Kategória', 'Leírás',
    'Jelenlegi besorolás', 'DÖNTÉS — szállás neve vagy "cégszintű"'];

  const lap = (lista) => {
    const sh = XLSX.utils.aoa_to_sheet([FEJ, ...lista.map((r) => [
      ymd(r.invoice_date), r.invoice_number, r.vendor, Number(r.total_amount),
      r.kategoria, egySor(r.leiras),
      r.allokacio || 'NINCS ALLOKÁCIÓ', '',
    ])]);
    sh['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 13 }, { wch: 14 },
      { wch: 72 }, { wch: 20 }, { wch: 38 }];
    sh['!freeze'] = { xSplit: 0, ySplit: 1 };
    return sh;
  };

  const szallasok = (await query(
    `SELECT name FROM accommodations WHERE is_active = true ORDER BY name`)).rows.map((r) => r.name);

  const seged = [
    ['Segédlet'], [],
    ['A "DÖNTÉS" oszlopba vagy egy szállás nevét írd (pontosan az alábbiak közül),'],
    ['vagy azt, hogy: cégszintű'], [],
    ['SZÁLLÁSHELYEK'], ...szallasok.map((n) => ['', n]), [],
    ['MEGJEGYZÉS'],
    ['"ÁLTALÁNOS" = van allokációs sor, de szállás nincs rajta (cégszintű).'],
    ['A megerősített cégszintű számlák NEM szerepelnek a "Besorolandó" lapon — azokról'],
    ['már született döntés. A "Már besorolt" lapon viszont ott vannak.'],
    ['"NINCS ALLOKÁCIÓ" = egyáltalán nincs allokációs sora — ez nyitott ügy, nem döntés.'],
  ];
  const sg = XLSX.utils.aoa_to_sheet(seged);
  sg['!cols'] = [{ wch: 4 }, { wch: 46 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, lap(nincsHaz), 'Besorolandó');
  XLSX.utils.book_append_sheet(wb, lap(vanHaz), 'Már besorolt');
  XLSX.utils.book_append_sheet(wb, sg, 'Segédlet');
  fs.writeFileSync(OUT, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  const ossz = nincsHaz.reduce((s, r) => s + Number(r.total_amount), 0);
  console.log(`\n✓ ${OUT}`);
  console.log(`   Besorolandó: ${nincsHaz.length} számla, ${ossz.toLocaleString('hu-HU')} Ft`);
  console.log(`   Már besorolt: ${vanHaz.length} számla`);
  console.log(`   Összesen a rendszerben: ${rows.length} számla\n`);
  process.exit(0);
})();
