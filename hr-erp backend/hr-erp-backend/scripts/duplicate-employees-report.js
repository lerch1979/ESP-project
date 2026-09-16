/**
 * A szeptember 3-i törlés/újraimport duplikátumainak FELMÉRÉSE — nem javítása.
 *
 * MIT NÉZ
 * -------
 * Ugyanaz a személy (vezetéknév + keresztnév + születési dátum) kétszer szerepel: egyszer
 * aktívan, egyszer 2026-09-03-i kilépési dátummal. Ez a szkript megmutatja, MI TAPAD a
 * kiléptetett soron — mert a legtöbb kapcsolat ON DELETE CASCADE, tehát egy meggondolatlan
 * törlés vinné a lakhatási történetet és a foglaltsági pillanatképeket is, amikből a
 * számlázás dolgozik.
 *
 * Semmit nem ír. A javítás külön lépés, külön jóváhagyással.
 *
 *   node scripts/duplicate-employees-report.js           # összesítő
 *   node scripts/duplicate-employees-report.js --rows    # soronként is
 */
require('dotenv').config();
const { query } = require('../src/database/connection');

const ROWS = process.argv.includes('--rows');

// tábla → oszlop. Az anonymization_log kimarad: az naplő, nem a személy adata.
const KAPCSOLATOK = [
  ['employee_accommodation_history', 'employee_id', 'lakhatási történet'],
  ['occupancy_snapshots',            'employee_id', 'foglaltsági pillanatképek'],
  ['employee_documents',             'employee_id', 'dokumentumok'],
  ['documents',                      'employee_id', 'dokumentumok (általános)'],
  ['employee_notes',                 'employee_id', 'jegyzetek'],
  ['employee_salaries',              'employee_id', 'béradatok'],
  ['medical_appointments',           'employee_id', 'orvosi időpontok'],
  ['personal_events',                'employee_id', 'személyes események'],
  ['shifts',                         'employee_id', 'műszakok'],
  ['tickets',                        'linked_employee_id', 'hibajegyek'],
  ['tasks',                          'related_employee_id', 'feladatok'],
  ['damage_reports',                 'employee_id', 'kárjegyzőkönyv (érintett)'],
  ['damage_reports',                 'responsible_employee_id', 'kárjegyzőkönyv (felelős)'],
  ['video_announcement_recipients',  'employee_id', 'videó-címzettek'],
];

const DUP_CTE = `
  WITH kulcs AS (
    SELECT id, end_date,
           lower(btrim(coalesce(last_name,''))) || '|' || lower(btrim(coalesce(first_name,''))) || '|' ||
           coalesce(birth_date::text,'?') AS k
      FROM employees),
  parok AS (
    SELECT k FROM kulcs GROUP BY k
     HAVING count(*) FILTER (WHERE end_date IS NULL) > 0
        AND count(*) FILTER (WHERE end_date IS NOT NULL) > 0),
  regi AS (SELECT ku.id, ku.k FROM kulcs ku JOIN parok p ON p.k = ku.k WHERE ku.end_date IS NOT NULL),
  uj   AS (SELECT ku.id, ku.k FROM kulcs ku JOIN parok p ON p.k = ku.k WHERE ku.end_date IS NULL)`;

(async () => {
  console.log('\n══ DUPLIKÁTUM-FELMÉRÉS — a 2026-09-03-i újraimport ══════════════\n');

  const parok = (await query(`${DUP_CTE} SELECT count(*)::int c FROM parok`)).rows[0].c;
  console.log(`  ${parok} személy szerepel kétszer (aktív + kiléptetett sor)\n`);

  console.log('  MI TAPAD A KILÉPTETETT (törlendő) SOROKON');
  console.log('  ' + '─'.repeat(64));
  const osszes = [];
  for (const [tabla, oszlop, cimke] of KAPCSOLATOK) {
    const r = (await query(`${DUP_CTE}
      SELECT count(*)::int AS db, count(DISTINCT t.${oszlop})::int AS erintett_fo
        FROM ${tabla} t JOIN regi ON regi.id = t.${oszlop}`)).rows[0];
    // ugyanez az AKTÍV sorokon — hogy látszódjon, van-e már ott adat
    const u = (await query(`${DUP_CTE}
      SELECT count(*)::int AS db FROM ${tabla} t JOIN uj ON uj.id = t.${oszlop}`)).rows[0];
    osszes.push({ tabla, oszlop, cimke, regi: r.db, regi_fo: r.erintett_fo, uj: u.db });
    if (r.db > 0 || u.db > 0) {
      console.log(`  ${cimke.padEnd(30)} kiléptetett: ${String(r.db).padStart(6)} sor `
        + `(${r.erintett_fo} főnél)   aktív: ${String(u.db).padStart(6)} sor`);
    }
  }
  const semmi = osszes.filter((x) => x.regi === 0 && x.uj === 0).map((x) => x.cimke);
  if (semmi.length) console.log(`\n  Üres mindkét oldalon: ${semmi.join(', ')}`);

  // ── mi az, ami CSAK a kiléptetett soron van, és elveszne ────────────────
  console.log('\n  AMI ELVESZNE EGY TÖRLÉSSEL (a legtöbb kapcsolat ON DELETE CASCADE)');
  console.log('  ' + '─'.repeat(64));
  let veszit = 0;
  for (const x of osszes) {
    if (x.regi > 0) { veszit += x.regi; console.log(`  ${x.cimke.padEnd(30)} ${String(x.regi).padStart(6)} sor`); }
  }
  console.log(`  ${'ÖSSZESEN'.padEnd(30)} ${String(veszit).padStart(6)} sor\n`);

  if (ROWS) {
    console.log('  SORONKÉNT (csak ahol van mit átvinni)');
    console.log('  ' + '─'.repeat(64));
    const sel = KAPCSOLATOK.map(([t, o, c]) =>
      `(SELECT count(*) FROM ${t} x WHERE x.${o} = regi.id) AS "${c}"`).join(',\n           ');
    const r = await query(`${DUP_CTE}
      SELECT e.last_name, e.first_name, e.birth_date, regi.id AS torlendo_id,
             (SELECT id FROM uj WHERE uj.k = regi.k) AS megmarado_id,
             ${sel}
        FROM regi JOIN employees e ON e.id = regi.id
       ORDER BY e.last_name, e.first_name`);
    let vanMit = 0;
    for (const row of r.rows) {
      const tetelek = KAPCSOLATOK.map(([, , c]) => [c, Number(row[c] || 0)]).filter(([, n]) => n > 0);
      if (tetelek.length === 0) continue;
      vanMit++;
      console.log(`  ${(row.last_name + ' ' + row.first_name).padEnd(28)} `
        + `${String(row.birth_date).slice(0, 10)}  ${tetelek.map(([c, n]) => `${c}: ${n}`).join(' · ')}`);
    }
    console.log(`\n  ${vanMit} olyan sor, amin van átvinnivaló; ${r.rows.length - vanMit} teljesen üres.\n`);
  } else {
    console.log('  (soronkénti bontás: --rows)\n');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
