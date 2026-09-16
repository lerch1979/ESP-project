/**
 * A MARADÉK duplikátumok összevonása — laza névkulccsal.
 *
 * MIÉRT KELL MÉG EGY KÖR
 * ----------------------
 * Az első összevonás a TELJES néven párosított, és 209 embert talált. Maradt 27, akinél a
 * keresztnév írásmódja eltér a két importban — hol benne van a középső/anyai név, hol nem:
 *
 *   Arcilla / John Janer Serrano   ↔   Arcilla / John Janer
 *   Arnold  / Arnold Rubenecia     ↔   Arnold  / Rubenecia
 *
 * Ezeknél a bizonyíték ERŐSEBB, mint az első körben volt: egyezik a vezetéknév ÉS az anyja
 * neve, a születési dátum pedig ugyanazt a +1 napos eltolódást mutatja, ami az áprilisi
 * import időzóna-hibája. Három független egyezés, egy ismert hibamintával.
 *
 * AMIT NEM CSINÁL
 * ---------------
 * Nem töröl. Csak átviszi az előzményt (pillanatkép + lakhatási epizód), ahogy az első
 * körben is — a régi sorok kivezetése külön lépés, a párok emberi átnézése után.
 *
 *   node scripts/merge-loose-duplicates.js            # lista + próba
 *   node scripts/merge-loose-duplicates.js --apply    # az előzmény átvitele
 */
require('dotenv').config();
const { query, transaction } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');

/** Helyi dátumrészekből — a toISOString() Budapesten egy nappal visszatol, és épp azt a
 *  hibát takarítjuk, a String(Date) pedig »Tue May 04« alakot ad év nélkül. */
const ymd = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const PAROK = `
  WITH norm AS (
    SELECT id, end_date, last_name, first_name, birth_date, mothers_name,
           translate(lower(btrim(coalesce(last_name,'') || ' ' || coalesce(first_name,''))),
                     'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') AS nev,
           translate(lower(btrim(coalesce(last_name,''))),
                     'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') AS vnev,
           translate(lower(btrim(coalesce(mothers_name,''))),
                     'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') AS anyja
      FROM employees),
  a AS (SELECT * FROM norm WHERE end_date IS NULL),
  r AS (SELECT * FROM norm WHERE end_date IS NOT NULL),
  -- akit az ELSŐ kör már párosított, az itt nem szerepel
  tav AS (SELECT r.* FROM r
           WHERE NOT EXISTS (SELECT 1 FROM a WHERE a.nev = r.nev
                              AND a.mothers_name IS NOT DISTINCT FROM r.mothers_name)
             AND r.last_name NOT ILIKE '%test%' AND r.last_name NOT ILIKE '%teszt%'),
  p AS (
    SELECT t.id AS regi_id, x.id AS aktiv_id,
           t.last_name AS r_vnev, t.first_name AS r_knev, t.birth_date AS r_szul,
           x.last_name AS a_vnev, x.first_name AS a_knev, x.birth_date AS a_szul,
           t.mothers_name AS anyja_neve
      FROM tav t
      JOIN a x ON x.vnev = t.vnev AND x.anyja = t.anyja AND t.anyja <> ''
             AND abs(x.birth_date - t.birth_date) <= 2)`;

(async () => {
  const parok = (await query(`${PAROK} SELECT * FROM p ORDER BY r_vnev, r_knev`)).rows;

  console.log('\n══ MARADÉK DUPLIKÁTUMOK — laza névkulcs ══════════════════════\n');
  console.log(`  ${parok.length} pár\n`);
  console.log('  KILÉPTETETT SOR                          →  AKTÍV SOR');
  console.log('  ' + '─'.repeat(78));
  for (const p of parok) {
    console.log(`  ${(p.r_vnev + ' / ' + p.r_knev).slice(0, 40).padEnd(40)} → ${(p.a_vnev + ' / ' + p.a_knev).slice(0, 34)}`);
    console.log(`  ${(ymd(p.r_szul) + '  (' + p.anyja_neve + ')').slice(0, 40).padEnd(40)}   ${ymd(p.a_szul)}`);
  }

  // Egy aktív sorhoz több régi is illeszkedhet — az kézi elbírálás, nem automatizmus.
  const tobbszoros = (await query(`${PAROK}
    SELECT aktiv_id, count(*)::int c FROM p GROUP BY aktiv_id HAVING count(*) > 1`)).rows;
  if (tobbszoros.length > 0) {
    console.error(`\n✋ ${tobbszoros.length} aktív sorhoz TÖBB régi is illeszkedik — megállok, ez emberi döntés.\n`);
    process.exit(1);
  }

  const elotte = (await query(`${PAROK}
    SELECT (SELECT count(*) FROM occupancy_snapshots o JOIN p ON p.regi_id = o.employee_id)::int AS regi_snapshot,
           (SELECT count(*) FROM employee_accommodation_history h JOIN p ON p.regi_id = h.employee_id
             WHERE h.check_in_date <> DATE '2023-12-31')::int AS athozando_epizod,
           (SELECT count(*) FROM employee_accommodation_history h JOIN p ON p.regi_id = h.employee_id
             WHERE h.check_in_date = DATE '2023-12-31')::int AS placeholder,
           (SELECT count(*) FROM occupancy_snapshots o1 JOIN p ON p.regi_id = o1.employee_id
              JOIN occupancy_snapshots o2 ON o2.employee_id = p.aktiv_id
               AND o2.snapshot_date = o1.snapshot_date)::int AS utkozes`)).rows[0];

  console.log('\n  ÁTVIENDŐ');
  console.log(`  pillanatkép            ${elotte.regi_snapshot}`);
  console.log(`  lakhatási epizód       ${elotte.athozando_epizod}`);
  console.log(`  placeholder (eldobjuk) ${elotte.placeholder}`);
  console.log(`  ütköző nap             ${elotte.utkozes}`);

  if (elotte.utkozes > 0) {
    console.error('\n✋ ÜTKÖZÉS: van olyan nap, amikor mindkét sornak van pillanatképe. Megállok.\n');
    process.exit(1);
  }
  if (!APPLY) { console.log('\n(--apply nélkül semmi nem íródott)\n'); process.exit(0); }

  const out = await transaction(async (client) => {
    const s = await client.query(`${PAROK}
      UPDATE occupancy_snapshots o SET employee_id = p.aktiv_id FROM p WHERE o.employee_id = p.regi_id`);
    const h = await client.query(`${PAROK}
      UPDATE employee_accommodation_history hh SET employee_id = p.aktiv_id
        FROM p WHERE hh.employee_id = p.regi_id AND hh.check_in_date <> DATE '2023-12-31'`);
    const ph = await client.query(`${PAROK}
      DELETE FROM employee_accommodation_history hh USING p
       WHERE hh.employee_id = p.regi_id AND hh.check_in_date = DATE '2023-12-31'`);
    return { snapshot: s.rowCount, epizod: h.rowCount, placeholder: ph.rowCount };
  });

  console.log(`\n✓ ${out.snapshot} pillanatkép és ${out.epizod} epizód átvezetve, ${out.placeholder} placeholder eldobva`);
  console.log('  A régi sorok MEGMARADTAK — kivezetésük külön lépés, a lista átnézése után.\n');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
