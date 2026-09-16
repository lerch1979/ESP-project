/**
 * A 2026-09-03-i újraimport duplikátumainak összevonása — 1. LÉPÉS: az előzmény átvitele.
 *
 * MI A HELYZET
 * ------------
 * Ugyanaz a személy két sorban: egy AKTÍV (a szeptemberi import, helyes születési
 * dátummal) és egy RÉGI (az áprilisi import, egy nappal elcsúszott dátummal — a hibát a
 * tulajdonos hivatalos okmányon ellenőrizte két emberen). A május–augusztusi lakhatás a
 * RÉGI sorhoz van kötve, a szeptemberi az újhoz: a rendszerben úgy fest, mintha 288 ember
 * elment és 279 új érkezett volna egyetlen napon.
 *
 * MIT VISZ ÁT ÉS MIT NEM
 * ----------------------
 *   • occupancy_snapshots — IGEN. Ez a napi igazság és a számlázás alapja. Ütközés nincs:
 *     egyetlen olyan nap sincs, amikor mindkét sornak volna pillanatképe.
 *   • employee_accommodation_history, 2026-08-08-i epizódok — IGEN. Ezek hordozzák a
 *     ház-hozzárendelést.
 *   • employee_accommodation_history, 2023-12-31-i epizódok — NEM. Ez placeholder, nem
 *     beköltözési dátum; ugyanaz a hamis érték, ami az arrival_date mezőben is ott ül.
 *     Átvinni annyi lenne, mint a hazugságot átmenteni.
 *
 * Amit NEM old meg: a history epizódok kezdődátuma így sem a valós beköltözés (a 08-08 a
 * backfill napja). A valós idővonal a pillanatképekből olvasható ki — annak
 * újraépítése külön lépés, külön döntéssel.
 *
 *   node scripts/merge-duplicate-employees.js            # próba
 *   node scripts/merge-duplicate-employees.js --apply    # végrehajtás
 */
require('dotenv').config();
const { query, transaction } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');

const PAROK = `
  WITH norm AS (
    SELECT id, end_date, created_at, mothers_name,
           translate(lower(btrim(coalesce(last_name,'') || ' ' || coalesce(first_name,''))),
                     'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU') AS nev
      FROM employees),
  a AS (SELECT * FROM norm WHERE end_date IS NULL),
  r AS (SELECT * FROM norm WHERE end_date IS NOT NULL AND created_at < '2026-09-01'),
  p AS (SELECT a.id AS aktiv_id, r.id AS regi_id
          FROM a JOIN r ON r.nev = a.nev AND a.mothers_name IS NOT DISTINCT FROM r.mothers_name)`;

(async () => {
  const elotte = (await query(`${PAROK}
    SELECT (SELECT count(*) FROM p)::int AS parok,
           (SELECT count(*) FROM occupancy_snapshots o JOIN p ON p.regi_id = o.employee_id)::int AS regi_snapshot,
           (SELECT count(*) FROM occupancy_snapshots o JOIN p ON p.aktiv_id = o.employee_id)::int AS aktiv_snapshot,
           (SELECT count(*) FROM employee_accommodation_history h JOIN p ON p.regi_id = h.employee_id
             WHERE h.check_in_date <> DATE '2023-12-31')::int AS athozando_epizod,
           (SELECT count(*) FROM employee_accommodation_history h JOIN p ON p.regi_id = h.employee_id
             WHERE h.check_in_date = DATE '2023-12-31')::int AS placeholder_epizod,
           (SELECT count(*) FROM occupancy_snapshots o1 JOIN p ON p.regi_id = o1.employee_id
              JOIN occupancy_snapshots o2 ON o2.employee_id = p.aktiv_id
               AND o2.snapshot_date = o1.snapshot_date)::int AS utkozes`)).rows[0];

  console.log('\n══ 1. LÉPÉS — az előzmény átvitele ═══════════════════════════\n');
  console.log(`  párok                              ${elotte.parok}`);
  console.log(`  átviendő pillanatkép (régi soron)  ${elotte.regi_snapshot}`);
  console.log(`  már az aktív soron                 ${elotte.aktiv_snapshot}`);
  console.log(`  átviendő lakhatási epizód          ${elotte.athozando_epizod}`);
  console.log(`  placeholder epizód (NEM visszük)   ${elotte.placeholder_epizod}`);
  console.log(`  ütköző nap                         ${elotte.utkozes}`);

  if (elotte.utkozes > 0) {
    console.error('\n✋ ÜTKÖZÉS: van olyan nap, amikor mindkét sornak van pillanatképe. Megállok.\n');
    process.exit(1);
  }
  if (!APPLY) { console.log('\n(--apply nélkül semmi nem íródott)\n'); process.exit(0); }

  const eredmeny = await transaction(async (client) => {
    const snap = await client.query(`${PAROK}
      UPDATE occupancy_snapshots o SET employee_id = p.aktiv_id
        FROM p WHERE o.employee_id = p.regi_id`);
    const hist = await client.query(`${PAROK}
      UPDATE employee_accommodation_history h SET employee_id = p.aktiv_id
        FROM p WHERE h.employee_id = p.regi_id AND h.check_in_date <> DATE '2023-12-31'`);
    // A placeholder epizódok a régi sorral együtt szűnnek meg (CASCADE) — de itt kimondjuk,
    // hogy szándékos, ne a törlés mellékhatásaként tűnjenek el.
    const ph = await client.query(`${PAROK}
      DELETE FROM employee_accommodation_history h USING p
       WHERE h.employee_id = p.regi_id AND h.check_in_date = DATE '2023-12-31'`);
    return { snapshot: snap.rowCount, epizod: hist.rowCount, placeholder_torolve: ph.rowCount };
  });

  console.log(`\n✓ ${eredmeny.snapshot} pillanatkép és ${eredmeny.epizod} lakhatási epizód átvezetve`);
  console.log(`✓ ${eredmeny.placeholder_torolve} placeholder epizód eldobva\n`);

  const utana = (await query(`${PAROK}
    SELECT (SELECT count(*) FROM occupancy_snapshots o JOIN p ON p.regi_id = o.employee_id)::int AS maradt_regin,
           (SELECT count(*) FROM occupancy_snapshots o JOIN p ON p.aktiv_id = o.employee_id)::int AS aktiv_snapshot,
           (SELECT count(*) FROM employee_accommodation_history h JOIN p ON p.regi_id = h.employee_id)::int AS maradt_epizod,
           (SELECT min(o.snapshot_date) FROM occupancy_snapshots o JOIN p ON p.aktiv_id = o.employee_id) AS legkorabbi,
           (SELECT max(o.snapshot_date) FROM occupancy_snapshots o JOIN p ON p.aktiv_id = o.employee_id) AS legkesobbi`)).rows[0];
  console.log('  UTÁNA');
  console.log(`  az aktív sorokon pillanatkép       ${utana.aktiv_snapshot}   (${utana.legkorabbi} … ${utana.legkesobbi})`);
  console.log(`  a régi sorokon maradt pillanatkép  ${utana.maradt_regin}`);
  console.log(`  a régi sorokon maradt epizód       ${utana.maradt_epizod}\n`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
