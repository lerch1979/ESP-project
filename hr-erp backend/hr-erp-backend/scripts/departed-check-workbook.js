/**
 * "Itt lakik még?" — ellenőrző munkafüzet a szállásfelelősöknek.
 *
 * MIÉRT KELL
 * ----------
 * A 2026-09-03-i tömeges művelet 79 embert léptetett ki egyetlen napon. Hogy valóban
 * elmentek-e, vagy csak kimaradtak az aznapi import listájából, a rendszerből NEM dönthető
 * el: a napi foglaltsági pillanatkép a rendszer állapotát rögzíti, nem a valóságot, ezért
 * mindenkinél ugyanazt a 09-02-i utolsó napot adja. Aki még ott lakik, az ma egyetlen
 * elszámolásban sem szerepel.
 *
 * Ezért nem dátumot találgatunk, hanem megkérdezzük azt, aki látja őket.
 *
 *   node scripts/departed-check-workbook.js [kimenet.xlsx]
 */
require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const { query } = require('../src/database/connection');

const OUT = process.argv[2] || `itt-lakik-e-${new Date().toISOString().slice(0, 10)}.xlsx`;

/**
 * Dátum HELYI dátumrészekből. A pg DATE-et Date objektumként adja vissza, és annak sem a
 * String()-je (»Wed Jan 24«), sem a toISOString()-je nem jó: utóbbi Budapest zónában egy
 * nappal visszatol — pontosan az a hiba, ami miatt ez a takarítás egyáltalán kell.
 */
const ymd = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const TAVOZOTTAK = `
  WITH norm AS (
    SELECT id, end_date, last_name, first_name, birth_date, employee_number, workplace, mothers_name,
           translate(lower(btrim(coalesce(last_name,'') || ' ' || coalesce(first_name,''))),
                     'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') AS nev
      FROM employees),
  a AS (SELECT * FROM norm WHERE end_date IS NULL),
  r AS (SELECT * FROM norm WHERE end_date IS NOT NULL),
  tav AS (SELECT r.* FROM r
           WHERE NOT EXISTS (SELECT 1 FROM a WHERE a.nev = r.nev
                              AND a.mothers_name IS NOT DISTINCT FROM r.mothers_name))`;

// Akinél az anyja neve és a születési dátum egyezik egy aktívval, de a VEZETÉKNÉV nem:
// vagy testvérek, vagy egy ember elcsúszott név-mezőkkel. Innen nem dönthető el, ezért
// a lapra kerül külön jelöléssel — a helyszínen egy perc alatt kiderül.
const BIZONYTALAN_SQL = `
  SELECT t.id,
         string_agg(x.last_name || ' / ' || x.first_name, ' ; ') AS hasonlo_aktiv
    FROM tav t
    JOIN a x ON translate(lower(btrim(coalesce(x.mothers_name,''))),'áéíóöőúüűÁÉÍÓÖŐÚÜŰ','aeiooouuuAEIOOOUUU')
              = translate(lower(btrim(coalesce(t.mothers_name,''))),'áéíóöőúüűÁÉÍÓÖŐÚÜŰ','aeiooouuuAEIOOOUUU')
           AND coalesce(btrim(t.mothers_name),'') <> ''
           AND abs(x.birth_date - t.birth_date) <= 2
   GROUP BY t.id`;

(async () => {
  const rows = (await query(`${TAVOZOTTAK}
    SELECT t.id, coalesce(ac.name, '(nincs adat)') AS haz,
           t.last_name, t.first_name, t.employee_number, t.birth_date, t.workplace,
           coalesce(ro.room_number, '') AS szoba,
           last.utolso_nap
      FROM tav t
      LEFT JOIN LATERAL (
        SELECT o.accommodation_id, o.room_id, o.snapshot_date AS utolso_nap
          FROM occupancy_snapshots o WHERE o.employee_id = t.id
         ORDER BY o.snapshot_date DESC LIMIT 1) last ON true
      LEFT JOIN accommodations ac ON ac.id = last.accommodation_id
      LEFT JOIN accommodation_rooms ro ON ro.id = last.room_id
     ORDER BY 1, t.last_name, t.first_name`)).rows;

  for (const r of rows) r.id_ref = r.id;

  const bizonytalan = new Map((await query(`${TAVOZOTTAK} ${BIZONYTALAN_SQL}`)).rows
    .map((r) => [r.id, r.hasonlo_aktiv]));

  // Jelenlegi létszám házanként — enélkül nem tűnne fel az aránytalanság.
  const most = new Map((await query(`
    SELECT ac.name, count(DISTINCT o.employee_id)::int AS fo
      FROM occupancy_snapshots o JOIN accommodations ac ON ac.id = o.accommodation_id
     WHERE o.snapshot_date = (SELECT max(snapshot_date) FROM occupancy_snapshots)
     GROUP BY 1`)).rows.map((r) => [r.name, r.fo]));

  const perHaz = new Map();
  for (const r of rows) perHaz.set(r.haz, (perHaz.get(r.haz) || 0) + 1);

  const wb = XLSX.utils.book_new();

  const info = [
    ['ITT LAKIK MÉG? — ellenőrző munkafüzet'],
    [`Készült: ${new Date().toISOString().slice(0, 10)}`],
    [`Ellenőrizendő munkavállalók: ${rows.length}`],
    [],
    ['MIÉRT KAPOD EZT'],
    ['  A szeptember 3-i rendszerművelet ezeket az embereket kiléptette. Nem tudjuk, hogy'],
    ['  valóban elmentek-e, vagy csak kimaradtak az aznapi listából.'],
    ['  Aki még ott lakik, az MA EGYETLEN elszámolásban sem szerepel — sem a szállásadó,'],
    ['  sem a megbízó felé. Ezért fontos a válasz.'],
    [],
    ['MIT KELL CSINÁLNI'],
    ['  Egyetlen oszlopot tölts ki: "Itt lakik még?" → írd be, hogy igen vagy nem.'],
    ['  A többi oszlop csak azonosításra való, ne írd át.'],
    ['  Ha bizonytalan vagy, hagyd üresen — az jobb, mint a rossz válasz.'],
    [],
    ['A "FIGYELEM" OSZLOP'],
    ['  Néhány sornál ott áll, hogy az illető talán azonos egy ott lakó emberrel (ugyanaz az'],
    ['  anyja neve és majdnem ugyanaz a születési dátum, de más a vezetéknév). Ilyenkor az a'],
    ['  kérdés: EGY emberről van szó két néven, vagy KETTŐRŐL (például testvérek)?'],
    [],
    ['HÁZANKÉNTI ÖSSZESÍTŐ'],
    ['  Ház', 'Ellenőrizendő', 'Ma nyilvántartott létszám', 'Megjegyzés'],
    ...[...perHaz.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([haz, db]) => {
        const jelenlegi = most.get(haz) ?? 0;
        const arany = jelenlegi > 0 ? db / jelenlegi : 0;
        return [`  ${haz}`, db, jelenlegi,
          arany >= 0.5 ? '⚠ feltűnően sok — ezt nézd meg először' : ''];
      }),
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 26 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Útmutató');

  const header = ['Ház', 'Vezetéknév', 'Keresztnév', 'Törzsszám', 'Születési dátum',
                  'Szoba', 'Munkahely', 'Utolsó nyilvántartott nap',
                  'Itt lakik még? (igen / nem)', 'FIGYELEM'];
  const aoa = [header, ...rows.map((r) => [
    r.haz, r.last_name, r.first_name, r.employee_number || '',
    ymd(r.birth_date),
    r.szoba, r.workplace || '',
    ymd(r.utolso_nap),
    '',
    bizonytalan.has(r.id)
      ? `Lehet, hogy azonos ezzel az itt lakóval: ${bizonytalan.get(r.id)} — kérlek nézd meg, EGY ember vagy KETTŐ`
      : '',
  ])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 15 },
                 { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 70 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, 'Ellenőrizendő');

  fs.writeFileSync(OUT, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log(`\n✓ ${OUT} — ${rows.length} fő, ${perHaz.size} ház\n`);
  for (const [haz, db] of [...perHaz.entries()].sort((a, b) => b[1] - a[1])) {
    const j = most.get(haz) ?? 0;
    console.log(`  ${haz.padEnd(22)} ${String(db).padStart(3)} ellenőrizendő / ${String(j).padStart(3)} ma nyilvántartott`
      + (j > 0 && db / j >= 0.5 ? '   ⚠' : ''));
  }
  console.log('');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
