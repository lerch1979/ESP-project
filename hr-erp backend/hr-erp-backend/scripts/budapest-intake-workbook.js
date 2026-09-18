/**
 * Kitöltő munkafüzet a budapesti iroda 12 emberéhez.
 *
 * MIÉRT ÍGY
 * ---------
 * A fejlécek pontosan azok, amiket a bulk import COLUMN_MAP-ja felismer
 * (employee.controller.js:34) — ha egy oszlopnevet átírsz, az az oszlop NÉMÁN kimarad,
 * nem hibát dob. A beépített sablonból HIÁNYZIK három oszlop, ami ide bekerült:
 *
 *   • Megbízó   — enélkül a `billing_client_id` üresen marad, és az ember NEM SZÁMLÁZÓDIK.
 *                 Pont ez a hiány okozott 15,2%-os bevételkiesést a kiléptetetteknél.
 *   • Nemzetiség — a lejárat-figyelő nemzetiségenként eltérő szabályokat futtat.
 *   • Nyelv      — a lakói mobilapp és a kiküldött üzenetek nyelve.
 *
 * A Szálláshely és a Megbízó oszlop ELŐRE KI VAN TÖLTVE, mert az ismert. A többi üres:
 * ezeket nem lehet kitalálni, és egy kitalált születési dátum rosszabb, mint egy üres.
 *
 * A "Segédlet" munkalap a rendszerben ELFOGADOTT értékeket sorolja fel, nem példákat.
 * Egy elgépelt megbízó- vagy szállásnév az egész sort elutasítja importkor.
 *
 *   node scripts/budapest-intake-workbook.js [kimenet.xlsx]
 */
require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const { query } = require('../src/database/connection');

const OUT = process.argv[2] || 'budapesti-iroda-12-fo.xlsx';

/** A 12 hely: melyik szálláson hány sor, előre kitöltött szállás- és megbízónévvel. */
const KIOSZTAS = [
  { szallas: 'Budapest - Ungvár utca 2.',     fo: 5 },
  { szallas: 'Szigetszentmiklós - Komp utca', fo: 3 },
  { szallas: 'Győr',                          fo: 4 },
];
const MEGBIZO = 'Man At Work Budapest';

// A sorrend a beépített sablont követi; a három új oszlop oda került, ahová tartalmilag
// illik (nemzetiség/nyelv a személyes adatok mellé, megbízó a munkahely mellé).
const FEJLEC = [
  'Vezetéknév', 'Keresztnév', 'Nem', 'Születési dátum', 'Születési hely',
  'Anyja neve', 'Nemzetiség', 'Nyelv', 'Családi állapot', 'Adóazonosító',
  'Útlevélszám', 'TAJ szám', 'Email', 'Telefon', 'Munkakör',
  'Törzsszám', 'Munkahely', 'Megbízó', 'Érkezés dátuma', 'Vízum lejárat',
  'Szálláshely', 'Szobaszám', 'Bankszámlaszám', 'Irányítószám', 'Ország',
  'Megye', 'Város', 'Utca', 'Házszám', 'Cégnév', 'Céges email', 'Céges telefon',
];

const IDX = Object.fromEntries(FEJLEC.map((h, i) => [h, i]));

(async () => {
  // A segédlet a ÉLES adatból készül, nem beírt listából: ha egy szállást átneveznek,
  // a munkafüzet a következő futáskor már az új nevet kínálja.
  const szallasok = (await query(
    `SELECT name FROM accommodations WHERE is_active = true ORDER BY name`)).rows.map((r) => r.name);
  const megbizok = (await query(
    `SELECT c.name FROM contractors c
      WHERE c.is_active AND EXISTS (
        SELECT 1 FROM contractor_roles cr WHERE cr.contractor_id=c.id AND cr.role='megbizo')
      ORDER BY c.name`)).rows.map((r) => r.name);

  if (!megbizok.includes(MEGBIZO)) {
    console.error(`\n✗ A(z) "${MEGBIZO}" megbízó nincs a rendszerben — importkor minden sor elszállna.\n`);
    process.exit(1);
  }
  const hianyzoSzallas = KIOSZTAS.map((k) => k.szallas).filter((n) => !szallasok.includes(n));
  if (hianyzoSzallas.length) {
    console.error(`\n✗ Hiányzó szálláshely: ${hianyzoSzallas.join(', ')}\n`);
    process.exit(1);
  }

  // ─── Adatlap ────────────────────────────────────────────────────────────────
  const sorok = [];
  for (const k of KIOSZTAS) {
    for (let i = 0; i < k.fo; i++) {
      const sor = new Array(FEJLEC.length).fill('');
      sor[IDX['Szálláshely']] = k.szallas;
      sor[IDX['Megbízó']] = MEGBIZO;
      sorok.push(sor);
    }
  }

  const adat = XLSX.utils.aoa_to_sheet([FEJLEC, ...sorok]);
  adat['!cols'] = FEJLEC.map((h) => ({ wch: Math.max(h.length + 3, 16) }));
  adat['!freeze'] = { xSplit: 0, ySplit: 1 };

  // ─── Útmutató ───────────────────────────────────────────────────────────────
  const utmutato = [
    ['Budapesti iroda — 12 fő feltöltése'],
    [],
    ['MI EZ'],
    ['A budapesti irodához tartozó 12 ember adatlapja. A Szálláshely és a Megbízó oszlop'],
    ['már ki van töltve — a többit kérlek töltsd ki. Ami nem ismert, maradjon ÜRESEN:'],
    ['egy kitalált érték rosszabb, mint egy hiányzó.'],
    [],
    ['HOGYAN TÖLTSD FEL'],
    ['Munkavállalók → Tömeges import → fájl kiválasztása. A rendszer soronként jelez vissza.'],
    [],
    ['SZABÁLYOK'],
    ['- A fejléc sorát NE írd át. Egy átírt oszlopnév némán kimarad, nem ad hibát.'],
    ['- Dátumok: ÉÉÉÉ-HH-NN (pl. 2026-09-20).'],
    ['- Kötelező: Vezetéknév és Keresztnév. Minden más elhagyható.'],
    ['- A Szálláshely, a Megbízó és a Nyelv csak a rendszerben LÉTEZŐ értéket fogad el'],
    ['  (lásd a "Segédlet" munkalapot) — elgépelés esetén az egész sor elutasításra kerül.'],
    ['- Üres sorokat nyugodtan hagyj benne, azokat a rendszer átlépi.'],
    [],
    ['MIÉRT FONTOS A MEGBÍZÓ OSZLOP'],
    ['Ez köti az embert a számlázáshoz. Ha üresen marad, az illető bekerül a rendszerbe,'],
    ['a szálláson is látszik, de EGYETLEN SZÁMLÁRA SEM kerül rá. Ez a hiány okozott'],
    ['korábban 15,2%-os bevételkiesést.'],
    [],
    ['OSZLOPOK'],
    ['Vezetéknév', 'Kötelező'],
    ['Keresztnév', 'Kötelező'],
    ['Nem', 'Férfi vagy Nő'],
    ['Születési dátum', 'ÉÉÉÉ-HH-NN'],
    ['Születési hely', 'Település'],
    ['Anyja neve', 'Teljes név'],
    ['Nemzetiség', 'Kétbetűs kód: HU, UA, PH, RO, RS…'],
    ['Nyelv', 'hu / en / uk / tl / de — a lakói app és az üzenetek nyelve'],
    ['Családi állapot', 'Egyedülálló, Házas, Nős, Elvált, Özvegy'],
    ['Adóazonosító', '10 számjegy'],
    ['Útlevélszám', 'Útlevél vagy személyi igazolvány száma'],
    ['TAJ szám', 'XXX XXX XXX'],
    ['Email', 'Személyes e-mail'],
    ['Telefon', '+36…'],
    ['Munkakör', 'Pozíció'],
    ['Törzsszám', 'Üresen hagyva automatikusan generálódik'],
    ['Munkahely', 'Hol dolgozik (szabad szöveg)'],
    ['Megbízó', 'ELŐRE KITÖLTVE — ne írd át'],
    ['Érkezés dátuma', 'Beköltözés napja, ÉÉÉÉ-HH-NN'],
    ['Vízum lejárat', 'ÉÉÉÉ-HH-NN, ha van'],
    ['Szálláshely', 'ELŐRE KITÖLTVE — ne írd át'],
    ['Szobaszám', 'Pl. 101 vagy A/2'],
    ['Bankszámlaszám', 'IBAN vagy számlaszám'],
    ['Irányítószám / Ország / Megye / Város / Utca / Házszám', 'Állandó lakcím'],
    ['Cégnév / Céges email / Céges telefon', 'Foglalkoztató adatai'],
  ];
  const um = XLSX.utils.aoa_to_sheet(utmutato);
  um['!cols'] = [{ wch: 54 }, { wch: 62 }];

  // ─── Segédlet: az ELFOGADOTT értékek ────────────────────────────────────────
  const seged = [
    ['Elfogadott értékek — a rendszer pontosan ezeket ismeri fel'],
    [],
    ['MEGBÍZÓK'], ...megbizok.map((n) => ['', n]),
    [],
    ['SZÁLLÁSHELYEK'], ...szallasok.map((n) => ['', n]),
    [],
    ['NYELV'], ['', 'hu — magyar'], ['', 'en — angol'], ['', 'uk — ukrán'],
    ['', 'tl — filippínó'], ['', 'de — német'],
    [],
    ['NEM'], ['', 'Férfi'], ['', 'Nő'],
    [],
    ['CSALÁDI ÁLLAPOT'], ['', 'Egyedülálló'], ['', 'Házas'], ['', 'Nős'], ['', 'Elvált'], ['', 'Özvegy'],
  ];
  const sg = XLSX.utils.aoa_to_sheet(seged);
  sg['!cols'] = [{ wch: 4 }, { wch: 46 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, adat, 'Adatok');
  XLSX.utils.book_append_sheet(wb, um, 'Útmutató');
  XLSX.utils.book_append_sheet(wb, sg, 'Segédlet');
  fs.writeFileSync(OUT, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  console.log(`\n✓ ${OUT}`);
  for (const k of KIOSZTAS) console.log(`   ${k.fo} sor — ${k.szallas}`);
  console.log(`   megbízó mindenhol: ${MEGBIZO}`);
  console.log(`   ${FEJLEC.length} oszlop, ebből előre kitöltve: Szálláshely, Megbízó\n`);
  process.exit(0);
})();
