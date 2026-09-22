/**
 * Szállásadói kapcsolattartók — kitöltő munkafüzet.
 *
 * MIÉRT KELL: a szállásadói jegy-továbbítás e-mailben megy, az elsődleges kapcsolattartó
 * címére. Ma 19 szállásadóból EGYHEZ van ilyen cím — vagyis a funkció a többinél akkor sem
 * élne, ha az SMTP már be volna állítva.
 *
 * A lap NEM találgat: ahol van kapcsolattartó, kiírja; ahol nincs, üresen hagyja. A
 * partner saját e-mail címét külön oszlopban mutatja, mert az tartaléknak használható,
 * de nem ugyanaz, mint egy megnevezett kapcsolattartó.
 *
 *   node scripts/landlord-contacts-workbook.js [kimenet.xlsx]
 */
require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const { query } = require('../src/database/connection');

const OUT = process.argv[2] || 'szallasado-kapcsolattartok.xlsx';

const SQL = `
  SELECT c.name AS szallasado,
         CASE WHEN c.type = 'property_owner' THEN 'magánszemély' ELSE 'cég' END AS tipus,
         coalesce(string_agg(DISTINCT a.name, ', ' ORDER BY a.name), '—') AS hazak,
         coalesce(pc.name, '')       AS kapcsolattarto,
         coalesce(pc.role_title, '') AS beosztas,
         coalesce(pc.email, '')      AS kapcsolattarto_email,
         coalesce(pc.phone, '')      AS kapcsolattarto_telefon,
         coalesce(c.email, '')       AS partner_email,
         coalesce(c.phone, '')       AS partner_telefon
    FROM contractors c
    JOIN contractor_roles cr ON cr.contractor_id = c.id AND cr.role = 'szallasado'
    LEFT JOIN accommodations a ON a.current_contractor_id = c.id AND a.is_active
    LEFT JOIN partner_contacts pc ON pc.contractor_id = c.id AND pc.is_primary AND pc.is_active
   WHERE c.is_active
   GROUP BY c.name, c.type, pc.name, pc.role_title, pc.email, pc.phone, c.email, c.phone
   -- A HIÁNYZÓ CÍMŰEK ELÖL: azokkal nem tudunk kapcsolatba lépni, tehát ők a
   -- munka. A Postgres a false-t rendezi előre, ezért kell a DESC.
   ORDER BY (coalesce(pc.email, c.email, '') = '') DESC, c.name`;

const FEJ = ['Szállásadó', 'Típus', 'Házak', 'Kapcsolattartó neve', 'Beosztás',
  'E-MAIL — EZT KÉRJÜK', 'Telefon', 'Partner e-mail (tartalék)', 'Partner telefon', 'Megjegyzés'];

(async () => {
  const rows = (await query(SQL)).rows;

  const adat = XLSX.utils.aoa_to_sheet([FEJ, ...rows.map((r) => [
    r.szallasado, r.tipus, r.hazak, r.kapcsolattarto, r.beosztas,
    r.kapcsolattarto_email, r.kapcsolattarto_telefon, r.partner_email, r.partner_telefon, '',
  ])]);
  adat['!cols'] = [{ wch: 44 }, { wch: 13 }, { wch: 34 }, { wch: 24 }, { wch: 20 },
    { wch: 30 }, { wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 30 }];
  adat['!freeze'] = { xSplit: 0, ySplit: 1 };

  const utm = XLSX.utils.aoa_to_sheet([
    ['Szállásadói kapcsolattartók — kitöltő lap'], [],
    ['MIRE KELL'],
    ['Ahol a szerződés szerint a SZÁLLÁSADÓ intézi a karbantartást, a hibajegyet e-mailben'],
    ['továbbítjuk az elsődleges kapcsolattartójának, egy lejáró linkkel. E-mail cím nélkül'],
    ['ez a továbbítás nem tud elindulni.'], [],
    ['MIT KÉRÜNK'],
    ['Az "E-MAIL — EZT KÉRJÜK" oszlop kitöltését. Ahol már van cím, ott ellenőrzést.'],
    ['Ha a kapcsolattartó neve is hiányzik, azt is írd be — anélkül csak egy postafiókot'],
    ['ismerünk, embert nem.'], [],
    ['A SORREND'],
    ['Elöl azok a szállásadók állnak, akikhez SEMMILYEN e-mail cím nincs — velük'],
    ['egyáltalán nem tudunk kapcsolatba lépni. Utánuk jönnek, akiknél van valami.'], [],
    ['A "Partner e-mail (tartalék)" oszlop a cég/magánszemély saját címe. Ha nincs'],
    ['megnevezett kapcsolattartó, a rendszer ezt használja — de egy megnevezett'],
    ['kapcsolattartó jobb, mert tudjuk, kit keresünk.'],
  ]);
  utm['!cols'] = [{ wch: 76 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, adat, 'Kapcsolattartók');
  XLSX.utils.book_append_sheet(wb, utm, 'Útmutató');
  fs.writeFileSync(OUT, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  const nincsCim = rows.filter((r) => !r.kapcsolattarto_email && !r.partner_email).length;
  const vanKapcs = rows.filter((r) => r.kapcsolattarto_email).length;
  console.log(`\n✓ ${OUT}`);
  console.log(`   ${rows.length} szállásadó`);
  console.log(`   ${vanKapcs} db — van elsődleges kapcsolattartó e-maillel`);
  console.log(`   ${nincsCim} db — SEMMILYEN e-mail cím nincs`);
  console.log(`   ${rows.length - vanKapcs - nincsCim} db — csak partner-szintű cím van\n`);
  process.exit(0);
})();
