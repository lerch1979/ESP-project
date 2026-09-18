#!/usr/bin/env node
/**
 * INV-000007 (Gede László Győr) hozzárendelése a győri szálláshoz — tulajdonosi döntés
 * 2026-09-18. A másik három besorolatlan tétel (Fulfilled Hungary ×2, Adria Invest)
 * megerősítetten CÉGSZINTŰ, azok már most is szállás nélküli allokáción ülnek, tehát
 * nincs mit átvezetni — ez a szkript csak ellenőrzi és kiírja őket.
 *
 * ⚠️ AMIT EZ NEM OLD MEG: a számla VÉGÖSSZEGE 1 Ft. A leírása szerint valós tételeket
 * takar (távhő 08.01.–09.30., gáz 06.04.–09.03., vízóracsere 23 000 Ft), de azok az
 * összegek NINCSENEK a számlán. Az allokáció ettől helyes lesz — a győri költségoldal
 * NEM. Egy 1 Ft-os költségsor rosszabb a semminél, ha valaki "rendezettként" olvassa,
 * ezért a szkript ezt hangosan kiírja, és a jelentés is kimondja.
 *
 * Száraz futás alapból; írni `--apply` kell.
 */
const { pool } = require('../src/database/connection');
const sync = require('../src/services/invoiceExpenseSync.service');

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(...a);

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const inv = (await c.query(
      `SELECT id, invoice_number, total_amount, payment_status, invoice_date, performance_date
         FROM invoices WHERE invoice_number='INV-000007' AND deleted_at IS NULL`)).rows[0];
    const gyor = (await c.query(`SELECT id FROM accommodations WHERE name='Győr'`)).rows[0];
    if (!inv || !gyor) { log('✗ nincs meg a számla vagy a győri szállás'); throw new Error('hiányzó adat'); }

    log(`── INV-000007 → Győr`);
    log(`   végösszeg: ${Number(inv.total_amount).toLocaleString('hu-HU')} Ft · állapot: ${inv.payment_status}`);

    const van = await c.query('SELECT id, accommodation_id FROM invoice_allocations WHERE invoice_id=$1', [inv.id]);
    if (van.rows.length) log(`   már van ${van.rows.length} allokációs sora — nem nyúlok hozzá`);
    else if (!APPLY) log('   LÉTREHOZNÁ: accommodation → Győr, rezsi, a teljes végösszegre');
    else {
      // Egyetlen sor a teljes összegre. A leírás három rezsifajtát említ (távhő, gáz,
      // vízóra), de 1 Ft-ot háromfelé osztani csak látszatpontosság lenne, ezért a
      // utility_line üresen marad — a hat soros rezsi-mátrix akkor tölthető ki
      // értelmesen, ha a valódi összegek megvannak.
      await c.query(
        `INSERT INTO invoice_allocations (invoice_id, target_type, accommodation_id, amount, expense_category, note)
         VALUES ($1,'accommodation',$2,$3,'rezsi',$4)`,
        [inv.id, gyor.id, inv.total_amount,
         'Tulajdonosi besorolás 2026-09-18: a számla a győri szálláshoz tartozik. '
         + 'Távhő 2026.08.01.–09.30., gáz 2026.06.04.–09.03., vízóracsere (Housing fizette: 23 000 Ft). '
         + 'A VÉGÖSSZEG 1 Ft — a valós összegek pótlandók.']);
      log('   ✓ allokáció létrehozva (accommodation → Győr, rezsi)');

      const r = await sync.syncFromAllocations(inv.id, c);
      log(`   költségsor-szinkron: ${r.created} létrehozva, ${r.updated} frissítve, ${r.removed} törölve`);
      for (const s of r.skipped) log(`     kihagyva — ${s.reason}`);
    }

    // ─── A megerősített cégszintűek ellenőrzése ─────────────────────────────────
    log('\n── CÉGSZINTŰ (megerősítve, nincs teendő)');
    const kozponti = await c.query(
      `SELECT i.invoice_number, i.vendor_name, i.total_amount,
              coalesce((SELECT string_agg(al.target_type,',') FROM invoice_allocations al WHERE al.invoice_id=i.id),'NINCS') AS tipus
         FROM invoices i
        WHERE i.deleted_at IS NULL AND (i.vendor_name ILIKE '%fulfilled%' OR i.vendor_name ILIKE '%adria%')
        ORDER BY i.invoice_date`);
    for (const k of kozponti.rows) {
      const ok = k.tipus !== 'NINCS' && !k.tipus.includes('accommodation');
      log(`   ${ok ? '✓' : '✗'} ${k.invoice_number.padEnd(14)} ${String(k.vendor_name).slice(0, 24).padEnd(26)} `
        + `${Number(k.total_amount).toLocaleString('hu-HU').padStart(9)} Ft — ${k.tipus}`);
    }

    // ─── Győr költségoldala a művelet után ──────────────────────────────────────
    const gy = (await c.query(
      `SELECT coalesce(sum(coalesce(net_amount, amount)),0) AS osszeg, count(*) AS db
         FROM accommodation_expenses
        WHERE accommodation_id=$1 AND deleted_at IS NULL`, [gyor.id])).rows[0];
    log(`\n── Győr könyvelt költsége: ${Number(gy.osszeg).toLocaleString('hu-HU')} Ft (${gy.db} sor)`);
    log('   ⚠️ A havi bérleti díj (200 000 Ft) továbbra sincs benne: lakó híján nem képződik');
    log('      számlázási sor, a rezsiszámla pedig 1 Ft-os.');

    if (APPLY) { await c.query('COMMIT'); log('\n✅ COMMIT'); }
    else { await c.query('ROLLBACK'); log('\n↩️  ROLLBACK (száraz futás)'); }
  } catch (e) {
    await c.query('ROLLBACK');
    log(`\n❌ HIBA, minden visszagördítve: ${e.message}`);
    process.exitCode = 1;
  } finally { c.release(); }
  process.exit(process.exitCode || 0);
})();
