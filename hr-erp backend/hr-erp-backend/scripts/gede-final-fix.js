#!/usr/bin/env node
/**
 * A Gede-eset helyretétele a bérbeadói rezsi-jelzéssel (2026-09-18), öt lépésben.
 *
 * AMIT JAVÍT: egy órával korábban a Győr-Szol és az MVM tételt a MI szállítói
 * számláinkként rögzítettem, 27% áfával. A tulajdonosi pontosítás szerint ez két ponton
 * rossz: ilyen számla a mi nevünkön nem létezik, és nevünkre szóló számla híján nincs
 * levonható áfa sem. A két számla törlődik, helyettük bérbeadói jelzés kerül be.
 *
 * Száraz futás alapból; írni `--apply` kell.
 */
const { pool } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');
const HONAP = '2026-09';
const PDF = 'uploads/landlord-notices/gede-2026-09/gede-rezsi-jelzes-2026-09.pdf';
const log = (...a) => console.log(...a);
const ft = (n) => `${Number(n).toLocaleString('hu-HU')} Ft`;

const JELZESEK = [
  { vendor: 'Győr-Szol Zrt. (bérbeadói jelzés)', osszeg: 12420, line: null,
    leiras: 'Távhőszolgáltatás 2026.08.01.–2026.09.30. — Gede László jelzése alapján' },
  { vendor: 'MVM Next Zrt. (bérbeadói jelzés)',  osszeg: 4457,  line: 'gaz',
    leiras: 'Földgáz 2026.06.04.–2026.09.03. — Gede László jelzése alapján' },
];

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const gyor = (await c.query(`SELECT id FROM accommodations WHERE name='Győr'`)).rows[0];
    const gede = (await c.query(`SELECT id, name FROM contractors WHERE name='Gede László'`)).rows[0];
    if (!gyor || !gede) throw new Error('hiányzik a győri szállás vagy Gede László');

    // ─── 1. A KÉT HIBÁS SZÁMLA TÖRLÉSE ──────────────────────────────────────────
    log('── 1. A két hibás számla törlése');
    for (const szam of ['GYSZOL-2026-TAVHO-09', 'MVM-2026-GAZ-09']) {
      const inv = (await c.query(
        `SELECT id, total_amount FROM invoices WHERE invoice_number=$1 AND deleted_at IS NULL`, [szam])).rows[0];
      if (!inv) { log(`   · ${szam.padEnd(24)} nincs (már törölve)`); continue; }
      if (!APPLY) { log(`   ${szam.padEnd(24)} TÖRÖLNÉ (${ft(inv.total_amount)}) + a költségsorát`); continue; }
      // A költségsort előbb, különben árván maradna a hivatkozása.
      await c.query(
        `UPDATE accommodation_expenses SET deleted_at=now() WHERE invoice_id=$1 AND deleted_at IS NULL`, [inv.id]);
      await c.query('DELETE FROM invoice_allocations WHERE invoice_id=$1', [inv.id]);
      await c.query(
        `UPDATE invoices SET deleted_at=now(),
            notes = coalesce(notes,'') || ' [2026-09-18] TÖRÖLVE: ilyen számla a mi nevünkre nem létezik. '
                  || 'A közüzemi szerződés Gede László nevén van; az összeget ő jelzi, és neki utaljuk. '
                  || 'Helyette bérbeadói rezsi-jelzés került rögzítésre.'
          WHERE id=$1`, [inv.id]);
      log(`   ✓ ${szam.padEnd(24)} törölve (${ft(inv.total_amount)}), költségsora is`);
    }

    // ─── 2. BÉRBEADÓI REZSI-JELZÉSEK ────────────────────────────────────────────
    log('\n── 2. Bérbeadói rezsi-jelzések — áfabontás nélkül, Gede Lászlónak fizetendő');
    for (const j of JELZESEK) {
      const van = await c.query(
        `SELECT id FROM accommodation_expenses
          WHERE accommodation_id=$1 AND source='landlord_utility_notice'
            AND vendor_name=$2 AND deleted_at IS NULL`, [gyor.id, j.vendor]);
      if (van.rows.length) { log(`   · ${j.vendor} — már rögzítve`); continue; }
      if (!APPLY) { log(`   ${j.vendor.padEnd(38)} ${ft(j.osszeg).padStart(11)}`); continue; }

      // net_amount/vat_amount SZÁNDÉKOSAN üres: nincs levonható áfa. A profit a
      // COALESCE(net_amount, amount) miatt így a TELJES összeget veszi költségnek.
      const e = (await c.query(
        `INSERT INTO accommodation_expenses
           (accommodation_id, billing_month, category, amount, currency, vendor_name,
            performance_date, source, payable_to_contractor_id, utility_line,
            notes, file_attachments, status, payment_status, cost_bearer, rate_status)
         VALUES ($1,$2,'rezsi',$3,'HUF',$4,$5,'landlord_utility_notice',$6,$7,$8,$9::jsonb,
                 'confirmed','unpaid','sajat','not_needed')
         RETURNING id`,
        [gyor.id, HONAP, j.osszeg, j.vendor, '2026-09-30', gede.id, j.line, j.leiras,
         JSON.stringify([{
           id: 'gede-2026-09-pdf', name: 'gede-rezsi-jelzes-2026-09.pdf', path: PDF,
           note: 'A bérbeadó által küldött bizonylat — az eredeti INV-000007 piszkozatból mentve.',
         }])])).rows[0];
      log(`   ✓ ${j.vendor.padEnd(38)} ${ft(j.osszeg).padStart(11)} (PDF csatolva)`);
    }

    // ─── 3. A TÖMÖS-TÉTEL 23 000 FT-RA ──────────────────────────────────────────
    log('\n── 3. Tömös Kft. — 23 000 Ft, áfabontás nélkül');
    const tomos = (await c.query(
      `SELECT i.id AS inv, e.id AS exp, i.total_amount, e.amount
         FROM invoices i JOIN accommodation_expenses e ON e.invoice_id=i.id
        WHERE i.invoice_number='TOMOS-2026-VIZORA' AND i.deleted_at IS NULL AND e.deleted_at IS NULL`)).rows[0];
    if (!tomos) log('   ✗ nincs meg');
    else if (Number(tomos.amount) === 23000) log('   · már 23 000 Ft');
    else if (!APPLY) log(`   ${ft(tomos.amount)} → ${ft(23000)} (áfabontás törlésével)`);
    else {
      await c.query(
        `UPDATE invoices SET amount=23000, vat_amount=NULL, total_amount=23000, updated_at=now() WHERE id=$1`,
        [tomos.inv]);
      await c.query('UPDATE invoice_allocations SET amount=23000 WHERE invoice_id=$1', [tomos.inv]);
      await c.query(
        `UPDATE accommodation_expenses
            SET amount=23000, net_amount=NULL, vat_amount=NULL, vat_rate=NULL, updated_at=now()
          WHERE id=$1`, [tomos.exp]);
      log(`   ✓ ${ft(tomos.amount)} → ${ft(23000)}, áfabontás törölve`);
    }

    // ─── 4. REZSI-MÁTRIX: mi fizetjük, bérbeadói jelzés alapján ──────────────────
    log('\n── 4. Rezsi-mátrix — who_pays=mi, contract_holder=szallasado');
    const LINES = ['viz_csatorna', 'internet', 'aram', 'gaz', 'kozos_koltseg', 'hulladekszallitas'];
    for (const nev of ['Győr', 'Budapest - Ungvár utca 2.', 'Szigetszentmiklós - Komp utca']) {
      const a = (await c.query('SELECT id FROM accommodations WHERE name=$1', [nev])).rows[0];
      if (!a) { log(`   ✗ ${nev}: nincs ilyen szállás`); continue; }
      if (!APPLY) { log(`   ${nev.padEnd(30)} 6 sor felvétele`); continue; }
      let n = 0;
      for (const line of LINES) {
        const r = await c.query(
          `INSERT INTO accommodation_utility_lines (accommodation_id, line, who_pays, contract_holder, frequency)
           VALUES ($1,$2,'mi','szallasado','eseti')
           ON CONFLICT (accommodation_id, line) DO UPDATE
             SET who_pays='mi', contract_holder='szallasado'
           RETURNING line`, [a.id, line]);
        n += r.rows.length;
      }
      log(`   ✓ ${nev.padEnd(30)} ${n} sor — a bérbeadó fizeti a szolgáltatót, mi neki utalunk`);
    }

    if (APPLY) { await c.query('COMMIT'); log('\n✅ COMMIT'); }
    else { await c.query('ROLLBACK'); log('\n↩️  ROLLBACK (száraz futás)'); }
  } catch (e) {
    await c.query('ROLLBACK');
    log(`\n❌ HIBA, minden visszagördítve: ${e.message}`);
    process.exitCode = 1;
  } finally { c.release(); }
  process.exit(process.exitCode || 0);
})();
