/**
 * A lakhatási előzmény ÚJRAÉPÍTÉSE a napi foglaltsági pillanatképekből.
 *
 * MIÉRT
 * -----
 * A meglévő epizódok dátuma nem a valós be- és kiköltözés: 2026-08-08 a backfill napja,
 * 2026-09-03 a tömeges újraimporté, a 2023-12-31 pedig placeholder volt. A tényleges
 * idővonalat a napi pillanatképek őrzik — az a rekord, amiből a számlázás is dolgozik.
 * Egy vitás elszámolásnál vagy hatósági kérdésnél a history-nak a valóságot kell mutatnia,
 * nem azt, mikor futott egy karbantartó szkript.
 *
 * KÉT DOLOG, AMIN EL LEHET CSÚSZNI
 * --------------------------------
 * 1. HÉZAG A PILLANATKÉPEKBEN. A cron nem futott 2026-05-21 és 06-15 között (26 nap).
 *    Ha minden hézagot epizód-határnak vennénk, 26 napra "kiköltöztetnénk" mindenkit, majd
 *    visszaköltöztetnénk — hamis ki- és beköltözések százai. Ezt az egy ismert szünetet
 *    ezért áthidaljuk; minden MÁS hézag valódi távollét.
 * 2. A SZOBA CSAK A PILLANATKÉPEK 41%-ÁBAN van kitöltve. Ha a szoba változása is epizódot
 *    vágna, a hiányzó szoba-adat hamis költözéseket gyártana. Ezért a HÁZ a határ, a szoba
 *    pedig az epizód utolsó ismert értéke.
 *
 * AZ INVARIÁNS
 * ------------
 * `check_out_date` = az első nap, amikor MÁR NINCS ott (nem az utolsó ott töltött nap).
 * Aki a legutolsó adatnapon is bent van és nincs kiléptetve, annak az epizódja NYITOTT.
 *
 *   node scripts/rebuild-history-from-snapshots.js            # próba
 *   node scripts/rebuild-history-from-snapshots.js --apply    # újraépítés
 */
require('dotenv').config();
const { query, transaction } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');

// A cron ismert kiesése. Csak EZT hidaljuk át — minden más hézag valódi.
const HEZAG_ELOTT = '2026-05-20';
const HEZAG_UTAN  = '2026-06-16';

const EPIZODOK = `
  WITH s AS (
    SELECT employee_id, accommodation_id, room_id, snapshot_date,
           lag(accommodation_id) OVER w AS elozo_haz,
           lag(snapshot_date)    OVER w AS elozo_nap
      FROM occupancy_snapshots
    WINDOW w AS (PARTITION BY employee_id ORDER BY snapshot_date)),
  jelolt AS (
    SELECT *, CASE
      WHEN elozo_haz IS NULL THEN 1
      WHEN accommodation_id IS DISTINCT FROM elozo_haz THEN 1
      WHEN snapshot_date - elozo_nap > 1
           AND NOT (elozo_nap = DATE '${HEZAG_ELOTT}' AND snapshot_date = DATE '${HEZAG_UTAN}') THEN 1
      ELSE 0 END AS uj
      FROM s),
  csoport AS (
    SELECT *, sum(uj) OVER (PARTITION BY employee_id ORDER BY snapshot_date
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS grp
      FROM jelolt),
  epizod AS (
    SELECT employee_id, accommodation_id, grp,
           min(snapshot_date) AS check_in,
           max(snapshot_date) AS utolso_nap,
           (array_agg(room_id ORDER BY snapshot_date DESC)
              FILTER (WHERE room_id IS NOT NULL))[1] AS room_id
      FROM csoport GROUP BY employee_id, accommodation_id, grp)`;

(async () => {
  const utolsoNap = (await query('SELECT max(snapshot_date) AS d FROM occupancy_snapshots')).rows[0].d;
  // A pillanatképek csak 2026-05-19-től vannak. Aki korábban költözött be, annál ez a nap
  // NEM a beköltözés, hanem az adatgyűjtés kezdete — vagyis alsó korlát: "legkésőbb ekkor
  // már itt lakott". Egy hatósági vagy elszámolási vitában ez különbség, ezért a rekord
  // maga mondja meg, ne a szóbeli emlékezet.
  const elsoNap = (await query('SELECT min(snapshot_date) AS d FROM occupancy_snapshots')).rows[0].d;
  const eddigi = (await query(`
    SELECT count(*)::int AS db, count(DISTINCT employee_id)::int AS fo,
           count(*) FILTER (WHERE check_out_date IS NULL)::int AS nyitott
      FROM employee_accommodation_history`)).rows[0];
  const uj = (await query(`${EPIZODOK}
    SELECT count(*)::int AS db, count(DISTINCT employee_id)::int AS fo,
           count(*) FILTER (WHERE utolso_nap = $1)::int AS meg_bent
      FROM epizod`, [utolsoNap])).rows[0];

  console.log('\n══ 5. LÉPÉS — a lakhatási előzmény újraépítése ═══════════════\n');
  console.log(`  utolsó adatnap: ${String(utolsoNap).slice(0, 10)}\n`);
  console.log(`  MOST   ${String(eddigi.db).padStart(5)} epizód, ${eddigi.fo} főnél (${eddigi.nyitott} nyitott)`);
  console.log(`  UTÁNA  ${String(uj.db).padStart(5)} epizód, ${uj.fo} főnél (${uj.meg_bent} ér a legutolsó adatnapig)\n`);

  const eloszlas = (await query(`${EPIZODOK}
    SELECT to_char(check_in, 'YYYY-MM') AS ho, count(*)::int AS db
      FROM epizod GROUP BY 1 ORDER BY 1`)).rows;
  console.log('  AZ ÚJ EPIZÓDOK BEKÖLTÖZÉS SZERINT');
  for (const r of eloszlas) {
    const elso = String(elsoNap).slice(0, 7) === r.ho;
    console.log(`    ${r.ho}  ${String(r.db).padStart(4)}`
      + (elso ? '   ⚠ ebből a nyilvántartás kezdete (alsó korlát, nem valós beköltözés)' : ''));
  }

  if (!APPLY) { console.log('\n(--apply nélkül semmi nem íródott)\n'); process.exit(0); }

  const out = await transaction(async (client) => {
    // Csak azoknak a dolgozóknak az epizódjait cseréljük, akikre VAN pillanatkép. Akiről
    // nincs adat, annak a meglévő sora marad — nincs mivel jobbat állítani a helyére.
    const del = await client.query(`
      DELETE FROM employee_accommodation_history h
       WHERE EXISTS (SELECT 1 FROM occupancy_snapshots o WHERE o.employee_id = h.employee_id)`);

    const ins = await client.query(`${EPIZODOK}
      INSERT INTO employee_accommodation_history
        (employee_id, accommodation_id, room_id, check_in_date, check_out_date, reason, notes)
      SELECT e.employee_id, e.accommodation_id, e.room_id, e.check_in,
             -- az invariáns: az első nap, amikor már NINCS ott
             CASE WHEN e.utolso_nap = $1::date AND emp.end_date IS NULL THEN NULL
                  ELSE e.utolso_nap + 1 END,
             'rebuilt_from_snapshots',
             'A napi foglaltsági pillanatképekből újraépítve. A korábbi dátumok technikai '
             || 'jellegűek voltak (backfill/import napja), nem a valós be- és kiköltözés.'
             || CASE WHEN e.check_in = $2::date THEN
                  ' ⚠ A beköltözés dátuma ALSÓ KORLÁT: a napi nyilvántartás ezen a napon indult, '
                  || 'az illető ekkor már itt lakott — a tényleges beköltözés korábbi lehet.'
                ELSE '' END
        FROM epizod e JOIN employees emp ON emp.id = e.employee_id`, [utolsoNap, elsoNap]);
    return { torolve: del.rowCount, letrehozva: ins.rowCount };
  });

  console.log(`\n✓ ${out.torolve} régi epizód lecserélve ${out.letrehozva} újra\n`);

  const ell = (await query(`
    SELECT count(*)::int AS db, count(DISTINCT employee_id)::int AS fo,
           count(*) FILTER (WHERE check_out_date IS NULL)::int AS nyitott,
           min(check_in_date) AS legkorabbi, max(check_in_date) AS legkesobbi
      FROM employee_accommodation_history`)).rows[0];
  console.log(`  ${ell.db} epizód, ${ell.fo} főnél, ${ell.nyitott} nyitott`);
  console.log(`  beköltözések: ${String(ell.legkorabbi).slice(0, 10)} … ${String(ell.legkesobbi).slice(0, 10)}`);

  // Egy ember egyszerre egy helyen lakhat — átfedő epizód nem keletkezhetett.
  const atfedes = (await query(`
    SELECT count(*)::int c FROM employee_accommodation_history a
      JOIN employee_accommodation_history b
        ON b.employee_id = a.employee_id AND b.id <> a.id
       AND b.check_in_date < COALESCE(a.check_out_date, DATE '9999-12-31')
       AND COALESCE(b.check_out_date, DATE '9999-12-31') > a.check_in_date`)).rows[0].c;
  console.log(`  átfedő epizód: ${atfedes}${atfedes === 0 ? ' ✓' : '  ⚠ ELLENŐRIZNI'}\n`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
