/**
 * A 2026-09-03-i újraimport ÜRES duplikátum-sorainak törlése — 2. LÉPÉS.
 *
 * MELYEK EZEK
 * -----------
 * Aznap két import futott. Az első létrehozott 279 sort és rögtön ki is léptette őket, a
 * második létrehozta ugyanazt a 279 embert újra. A kiléptetett példányon semmi sincs a
 * saját aznapi, nulla hosszúságú lakhatási epizódján kívül.
 *
 * MIÉRT ELLENŐRIZ MINDENT ÚJRA
 * ----------------------------
 * A kapcsolatok többsége ON DELETE CASCADE: egy elszámított törlés vinné a lakhatási
 * történetet és a foglaltsági pillanatképeket is, amikből a számlázás dolgozik. Ezért a
 * szkript törlés ELŐTT végignézi mind a 14 kapcsolatot, és ha bármelyiken talál valamit,
 * MEGÁLL — nem "biztos, ami biztos" alapon dolgozik, hanem bizonyítva.
 *
 *   node scripts/delete-empty-duplicates.js            # próba
 *   node scripts/delete-empty-duplicates.js --apply    # végrehajtás
 */
require('dotenv').config();
const { query, transaction } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');

// Mind aznap keletkezett, szigorú kulcson (név + születési dátum) párosítva: ezeknél a
// születési dátum NEM csúszott el, mert mindkét sor ugyanabból a szeptemberi importból van.
const TORLENDO = `
  WITH kulcs AS (
    SELECT id, end_date, created_at,
           lower(btrim(coalesce(last_name,''))) || '|' || lower(btrim(coalesce(first_name,''))) || '|' ||
           coalesce(birth_date::text,'?') AS k
      FROM employees),
  parok AS (
    SELECT k FROM kulcs GROUP BY k
     HAVING count(*) FILTER (WHERE end_date IS NULL) > 0
        AND count(*) FILTER (WHERE end_date IS NOT NULL) > 0),
  t AS (SELECT ku.id FROM kulcs ku JOIN parok p ON p.k = ku.k
         WHERE ku.end_date IS NOT NULL AND ku.created_at >= '2026-09-01')`;

const KAPCSOLATOK = [
  ['occupancy_snapshots', 'employee_id', 'foglaltsági pillanatkép'],
  ['employee_documents', 'employee_id', 'dokumentum'],
  ['documents', 'employee_id', 'dokumentum (általános)'],
  ['employee_notes', 'employee_id', 'jegyzet'],
  ['employee_salaries', 'employee_id', 'béradat'],
  ['medical_appointments', 'employee_id', 'orvosi időpont'],
  ['personal_events', 'employee_id', 'személyes esemény'],
  ['shifts', 'employee_id', 'műszak'],
  ['tickets', 'linked_employee_id', 'hibajegy'],
  ['tasks', 'related_employee_id', 'feladat'],
  ['damage_reports', 'employee_id', 'kárjegyzőkönyv (érintett)'],
  ['damage_reports', 'responsible_employee_id', 'kárjegyzőkönyv (felelős)'],
  ['video_announcement_recipients', 'employee_id', 'videó-címzett'],
];

(async () => {
  const db = (await query(`${TORLENDO} SELECT count(*)::int c FROM t`)).rows[0].c;
  console.log('\n══ 2. LÉPÉS — az üres duplikátumok törlése ═══════════════════\n');
  console.log(`  törlendő sor: ${db}\n`);

  console.log('  ELLENŐRZÉS — mi tapad rájuk');
  console.log('  ' + '─'.repeat(52));
  let akadaly = 0;
  for (const [tabla, oszlop, cimke] of KAPCSOLATOK) {
    const c = (await query(`${TORLENDO}
      SELECT count(*)::int c FROM ${tabla} x JOIN t ON t.id = x.${oszlop}`)).rows[0].c;
    if (c > 0) { akadaly += c; console.log(`  ✗ ${cimke.padEnd(30)} ${c} sor`); }
  }
  // A saját aznapi lakhatási epizódjuk a kivétel: azt szándékosan visszük el velük.
  const hist = (await query(`${TORLENDO}
    SELECT count(*)::int c FROM employee_accommodation_history h JOIN t ON t.id = h.employee_id`)).rows[0].c;
  console.log(`  · lakhatási epizód (aznapi, velük megy)   ${hist} sor`);

  if (akadaly > 0) {
    console.error(`\n✋ MEGÁLLOK: ${akadaly} olyan sor van, ami elveszne. Előbb azt kell átvinni.\n`);
    process.exit(1);
  }
  console.log('  ✓ minden más kapcsolat üres — a törlés nem visz el semmit\n');

  if (!APPLY) { console.log('(--apply nélkül semmi nem íródott)\n'); process.exit(0); }

  const out = await transaction(async (client) => {
    const r = await client.query(`${TORLENDO} DELETE FROM employees e USING t WHERE e.id = t.id`);
    return r.rowCount;
  });
  console.log(`✓ ${out} üres duplikátum-sor törölve\n`);

  const utana = (await query(`
    SELECT count(*)::int AS osszes,
           count(*) FILTER (WHERE end_date IS NULL)::int AS aktiv,
           count(*) FILTER (WHERE end_date IS NOT NULL)::int AS kileptetett
      FROM employees`)).rows[0];
  const snap = (await query('SELECT count(*)::int c FROM occupancy_snapshots')).rows[0].c;
  console.log(`  employees: ${utana.osszes} sor (${utana.aktiv} aktív, ${utana.kileptetett} kiléptetett)`);
  console.log(`  foglaltsági pillanatkép: ${snap}\n`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
