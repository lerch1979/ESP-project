#!/usr/bin/env node
/**
 * A győri Gede-eset helyes rögzítése: HÁROM KÜLÖN SZÁMLA, három szállítótól (2026-09-18).
 *
 *   1. Győr-Szol Távhő   12 420 Ft  2026.08.01.–09.30.  → a MI rezsiköltségünk a győri házon
 *   2. MVM gáz            4 457 Ft  2026.06.04.–09.03.  → a MI rezsiköltségünk a győri házon
 *   3. Tömös Kft.        23 000 Ft  vízóracsere         → MEGELŐLEGEZETT: a szállásadó terhe,
 *                                                         követelés Gede Lászlóval szemben
 *
 * MIÉRT NEM TÖRLI AZ INV-000007-ET
 * --------------------------------
 * Nem elrontott próbafelvitel. Van mögötte egy 1,28 MB-os beszkennelt PDF, valódi
 * felhasználó töltötte fel, és a jegyzete `- 6.123 Ft` — ami PONTOSAN a három tétel
 * egyenlege: 12 420 + 4 457 − 23 000 = −6 123. Vagyis valaki a NETTÓ EGYENLEGET akarta
 * rögzíteni egyetlen soron, az `amount >= 0` megszorítás viszont nem engedett negatív
 * összeget, ezért 1 Ft-ot írt be és a valódi számot a jegyzetbe tette.
 *
 * Ez tehát bizonyíték, nem szemét: a PDF az egyetlen dokumentum a három tételről. Ezért
 * piszkozatban marad, jegyzettel, ami a három új számlára mutat — a törlésről ember
 * döntsön, miután látta, mi volt.
 *
 * Amit viszont VISSZAVON: az 1 Ft-os allokációt és a belőle képzett 1 Ft-os költségsort.
 * Az a valós tételek rögzítése után már csak zaj a győri költségoldalon.
 *
 * Száraz futás alapból; írni `--apply` kell.
 */
const { pool } = require('../src/database/connection');
const sync = require('../src/services/invoiceExpenseSync.service');

const APPLY = process.argv.includes('--apply');
const HONAP = '2026-09';
const log = (...a) => console.log(...a);
const ft = (n) => `${Number(n).toLocaleString('hu-HU')} Ft`;

/**
 * A három számla. A teljesítés dátuma az elszámolt IDŐSZAK VÉGE — ez dönti el, melyik
 * hónap költsége lesz. A rezsiszámlák visszamenőleges időszakra szólnak (a távhő két,
 * a gáz három hónapra), tehát a teljes összeg a beérkezés hónapjára kerül; arányosítani
 * őket csak akkor volna szabad, ha a tulajdonos ezt kéri.
 */
const SZAMLAK = [
  {
    kulcs: 'gyorszol',
    vendor: 'Győr-Szol Zrt.', szam: 'GYSZOL-2026-TAVHO-09',
    netto: 12420, teljesites: '2026-09-30', datum: '2026-09-30',
    leiras: 'Távhőszolgáltatás 2026.08.01.–2026.09.30.',
    kategoria: 'Rezsi (Utilities)',
    // A hat soros rezsi-mátrixban NINCS távhő sor (víz, internet, áram, gáz, közös
    // költség, hulladék). Nem erőltetem bele a 'gaz'-ba: a távhő nem gáz, és egy rossz
    // sorba tett tétel később megmagyarázhatatlan. Marad rezsi kategória, sor nélkül.
    utility_line: null,
    megelolegezett: false,
  },
  {
    kulcs: 'mvm',
    vendor: 'MVM Next Energiakereskedelmi Zrt.', szam: 'MVM-2026-GAZ-09',
    netto: 4457, teljesites: '2026-09-03', datum: '2026-09-03',
    leiras: 'Földgáz 2026.06.04.–2026.09.03.',
    kategoria: 'Rezsi (Utilities)',
    utility_line: 'gaz',
    megelolegezett: false,
  },
  {
    kulcs: 'tomos',
    vendor: 'Tömös Kft.', szam: 'TOMOS-2026-VIZORA',
    netto: 23000, teljesites: '2026-09-30', datum: '2026-09-30',
    leiras: 'Vízóracsere — szerződés szerint a szállásadó terhe, a Housing előlegezte meg',
    kategoria: 'Szolgáltatás',
    utility_line: null,
    megelolegezett: true,          // követelés Gede Lászlóval szemben
    exp_kategoria: 'karbantartas',
  },
];

async function partner(c, nev) {
  const van = await c.query('SELECT id FROM contractors WHERE lower(name)=lower($1)', [nev]);
  if (van.rows.length) return { id: van.rows[0].id, uj: false };
  if (!APPLY) return { id: null, uj: true };
  const slug = nev.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const r = await c.query(
    `INSERT INTO contractors (name, slug, type, is_active) VALUES ($1,$2,'service_provider',true) RETURNING id`,
    [nev, slug]);
  await c.query(`INSERT INTO contractor_roles (contractor_id, role) VALUES ($1,'beszallito') ON CONFLICT DO NOTHING`,
    [r.rows[0].id]);
  return { id: r.rows[0].id, uj: true };
}

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const gyor = (await c.query(`SELECT id FROM accommodations WHERE name='Győr'`)).rows[0];
    const gede = (await c.query(`SELECT id FROM contractors WHERE name='Gede László'`)).rows[0];
    const kh   = (await c.query(`SELECT id FROM cost_centers WHERE code='OPR-SZALL'`)).rows[0]
              || (await c.query(`SELECT id FROM cost_centers WHERE code='OPR'`)).rows[0];
    if (!gyor || !gede || !kh) throw new Error('hiányzik a győri szállás, Gede László vagy a költséghely');

    // ─── 1. AZ INV-000007 RENDEZÉSE ─────────────────────────────────────────────
    log('── 1. INV-000007 — mi ez valójában');
    const inv7 = (await c.query(
      `SELECT id, notes, file_path, total_amount FROM invoices WHERE invoice_number='INV-000007'`)).rows[0];
    if (!inv7) log('   ✗ nincs meg');
    else {
      log(`   PDF: ${inv7.file_path ? 'VAN (beszkennelt bizonylat)' : 'nincs'} · jegyzet: "${(inv7.notes || '').trim()}"`);
      log(`   12 420 + 4 457 − 23 000 = −6 123 → a jegyzettel EGYEZIK, tehát a három tétel egyenlege`);
      const alloc = await c.query(
        'SELECT id FROM invoice_allocations WHERE invoice_id=$1', [inv7.id]);
      if (!APPLY) log(`   VISSZAVONNÁ az 1 Ft-os allokációt (${alloc.rows.length} sor) és a belőle képzett költségsort`);
      else {
        await c.query('DELETE FROM invoice_allocations WHERE invoice_id=$1', [inv7.id]);
        const r = await sync.syncFromAllocations(inv7.id, c);
        await c.query(
          `UPDATE invoices SET notes = $2, updated_at=now() WHERE id=$1`,
          [inv7.id,
           `[2026-09-18] NE TÖRÖLD a PDF miatt. Ez a Gede-egyenleg egyetlen soron: -6 123 Ft `
           + `(12 420 távhő + 4 457 gáz − 23 000 vízóra). A rendszer nem enged negatív számlaösszeget, `
           + `ezért került be 1 Ft-tal. A három tétel azóta KÜLÖN, helyesen rögzítve: `
           + `${SZAMLAK.map((x) => x.szam).join(', ')}. Ez a piszkozat már csak a beszkennelt bizonylatot őrzi.`]);
        log(`   ✓ allokáció visszavonva, költségsor takarítva (${r.removed} törölve), jegyzet frissítve`);
        log('   ✓ a számla PISZKOZATBAN marad — a PDF az egyetlen bizonylat a három tételről');
      }
    }

    // ─── 2. A HÁROM SZÁMLA ──────────────────────────────────────────────────────
    log('\n── 2. A három számla rögzítése');
    for (const sz of SZAMLAK) {
      const p = await partner(c, sz.vendor);
      const kat = (await c.query('SELECT id FROM invoice_categories WHERE name=$1 LIMIT 1', [sz.kategoria])).rows[0];

      const mar = await c.query('SELECT id FROM invoices WHERE invoice_number=$1 AND deleted_at IS NULL', [sz.szam]);
      if (mar.rows.length) { log(`   · ${sz.szam.padEnd(24)} már rögzítve`); continue; }
      if (!APPLY) {
        log(`   ${sz.szam.padEnd(24)} ${ft(sz.netto).padStart(11)} — ${sz.vendor}`
          + `${p.uj ? ' (új partner)' : ''}${sz.megelolegezett ? ' → MEGELŐLEGEZETT' : ' → győri rezsiköltség'}`);
        continue;
      }

      const afa = Math.round(sz.netto * 0.27);
      const inv = (await c.query(
        `INSERT INTO invoices
           (invoice_number, vendor_name, vendor_contractor_id, amount, vat_amount, total_amount,
            currency, invoice_date, performance_date, payment_status, cost_center_id,
            category_id, description, rate_status)
         VALUES ($1,$2,$3,$4,$5,$6,'HUF',$7,$8,'pending',$9,$10,$11,'not_needed') RETURNING id`,
        [sz.szam, sz.vendor, p.id, sz.netto, afa, sz.netto + afa,
         sz.datum, sz.teljesites, kh.id, kat?.id || null, sz.leiras])).rows[0];

      await c.query(
        `INSERT INTO invoice_allocations
           (invoice_id, target_type, accommodation_id, amount, expense_category, utility_line, note)
         VALUES ($1,'accommodation',$2,$3,$4,$5,$6)`,
        [inv.id, gyor.id, sz.netto + afa,
         sz.megelolegezett ? sz.exp_kategoria : 'rezsi', sz.utility_line, sz.leiras]);

      const r = await sync.syncFromAllocations(inv.id, c);
      log(`   ✓ ${sz.szam.padEnd(24)} ${ft(sz.netto).padStart(11)} — ${sz.vendor}`
        + ` (költségsor: ${r.created} létrehozva)`);
      for (const s2 of r.skipped) log(`       kihagyva — ${s2.reason}`);

      // A MEGELŐLEGEZETT jelölés a KÖLTSÉGSORON él, nem a számlán: a profit és az
      // elszámoló lap is onnan dolgozik (mig 163).
      if (sz.megelolegezett) {
        const u = await c.query(
          `UPDATE accommodation_expenses
              SET cost_bearer='megelolegezett', recoverable_from_contractor_id=$2,
                  recovery_status='nyitott',
                  recovery_note='Vízóracsere — szerződés szerint a szállásadó terhe. A Housing fizette ki, Gede Lászlótól visszajár.'
            WHERE invoice_id=$1 AND deleted_at IS NULL RETURNING id, amount`,
          [inv.id, gede.id]);
        log(`       → MEGELŐLEGEZETT: ${u.rows.length} költségsor átjelölve követeléssé Gede Lászlóval szemben`);
      }
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
