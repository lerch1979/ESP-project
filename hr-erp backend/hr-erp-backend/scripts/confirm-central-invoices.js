#!/usr/bin/env node
/**
 * A maradék hét számla megerősítése cégszintűként — tulajdonosi döntés 2026-09-18.
 *
 * MIÉRT KELL EGYÁLTALÁN CSINÁLNI VALAMIT, HA MÁR JÓK
 * --------------------------------------------------
 * Mind a hét már ma is szállás nélküli allokáción ül, tehát a KÖNYVELÉS helyes, és egyik
 * összeg sem mozdul. Amit a rendszer nem tud, az a döntés ténye: a "még nem néztük meg"
 * és az "átnéztük, cégszintű" ugyanaz az állapot, ezért a besorolási munkafüzet minden
 * körben újra felkínálja őket. Ez a szkript a DÖNTÉST rögzíti, nem a besorolást.
 *
 * ⚠️ SZÖVEGES JELÖLŐ, NEM MEZŐ. Az `invoice_allocations` táblában nincs "megerősítve"
 * oszlop, és nem veszek fel migrációval olyat, amit nem hagytak jóvá. A jelölő ezért a
 * `note` mezőbe kerül, egy fix előtaggal, amire a munkafüzet szűr. Ha ez tartós
 * megoldássá válik, rendes mezőt érdemel (`central_confirmed_at` / `_by`) — egy szöveg-
 * részletre szűrni működik, de törékeny.
 *
 * Száraz futás alapból; írni `--apply` kell.
 */
const { pool } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');
const JELOLO = '[CÉGSZINTŰ — MEGERŐSÍTVE 2026-09-18]';
const log = (...a) => console.log(...a);

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const sorok = (await c.query(`
      SELECT al.id, al.note, al.target_type, i.invoice_number, i.vendor_name, i.total_amount
        FROM invoice_allocations al
        JOIN invoices i ON i.id = al.invoice_id
       WHERE i.deleted_at IS NULL AND al.accommodation_id IS NULL
       ORDER BY i.invoice_date, i.invoice_number`)).rows;

    log(`── ${sorok.length} szállás nélküli allokáció\n`);
    let n = 0;
    for (const s of sorok) {
      const mar = (s.note || '').includes(JELOLO);
      log(`   ${mar ? '·' : '✓'} ${s.invoice_number.padEnd(20)} ${String(s.vendor_name || '?').slice(0, 30).padEnd(32)} `
        + `${Number(s.total_amount).toLocaleString('hu-HU').padStart(9)} Ft  (${s.target_type})`
        + `${mar ? ' — már megerősítve' : ''}`);
      if (mar || !APPLY) continue;
      await c.query('UPDATE invoice_allocations SET note=$1 WHERE id=$2',
        [s.note ? `${JELOLO} ${s.note}` : JELOLO, s.id]);
      n++;
    }
    log(`\n   ${APPLY ? `${n} sor megjelölve` : 'száraz futás — semmi nem íródott'}`);
    log('   Egyetlen összeg sem változott: a megerősítés a döntést rögzíti, nem a besorolást.');

    if (APPLY) { await c.query('COMMIT'); log('\n✅ COMMIT'); }
    else { await c.query('ROLLBACK'); log('\n↩️  ROLLBACK (száraz futás)'); }
  } catch (e) {
    await c.query('ROLLBACK');
    log(`\n❌ HIBA, minden visszagördítve: ${e.message}`);
    process.exitCode = 1;
  } finally { c.release(); }
  process.exit(process.exitCode || 0);
})();
