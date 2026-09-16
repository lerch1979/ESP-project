/**
 * A 2026-09-i számlák egyszeri besorolása, a tulajdonos tételes döntése alapján.
 *
 * MIÉRT SZKRIPT ÉS NEM SQL
 * ------------------------
 * A szállásköltség-sor NEM kézzel íródik: a besorolás melléktermékeként képződik
 * (invoiceExpenseSync, mig 160). Egy közvetlen INSERT az invoice_allocations-be tehát
 * besorolást csinálna költségsor nélkül — pontosan azt az elcsúszást, ami miatt a
 * költségkimutatás júliustól üres volt. Ezért ez a szkript ugyanazt a szolgáltatást hívja,
 * amit a felület.
 *
 * MIT NEM CSINÁL
 * --------------
 * Nem találgat. Ami a tulajdonos listájában nem szerepel, azt érintetlenül hagyja, és a
 * végén felsorolja. A bérleti díj számlák szándékosan nem képeznek költségsort — a motor
 * a szállás bérleti konstrukciójából már számolja őket.
 *
 *   node scripts/classify-september-invoices.js            # próba, nem ír
 *   node scripts/classify-september-invoices.js --apply    # végrehajtás
 */
require('dotenv').config();
const { query, transaction } = require('../src/database/connection');
const allocations = require('../src/services/invoiceAllocation.service');

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(...a);

// A tulajdonos döntései, számlaszám szerint.
//   acc:<szállásnév> | general | central | skip:<indok>
const DECISIONS = {
  // ── szállásköltség ────────────────────────────────────────────────
  '100005674788':        { target: 'acc:Fertőszéplak', category: 'rezsi', utility: 'viz_csatorna' },
  'KS-728241S-2026/168': { target: 'acc:Petőháza',     category: 'rezsi' },
  'RL-2026/009350':      { target: 'acc:Győr',         category: 'rezsi' },

  // ── cégszintű ─────────────────────────────────────────────────────
  'INV-000008':          { target: 'central' },   // Anthropic — HR-ERP fejlesztés
  '088001131139':        { target: 'central' },   // Hetzner — "Projekt HR-ERP"
  'INV-000009':          { target: 'central' },   // Adria Invest — medencetakaró
  '2026-E-EUR/15870':    { target: 'general' },   // MiniCRM
  'FF-2026-440':         { target: 'general' },   // Fulfilled — vezetői tanácsadás
  'FF-2026-423':         { target: 'general' },   // Fulfilled — felmérő hívás
  'KS-845137S-2026/82':  { target: 'general' },   // Fertődi Művelődési Ház — terembérlet

  // ── bérleti díj: a ház megvan, költségsort NEM képez (a motor számolja) ──
  '2026/RH00010':        { target: 'acc:Sopronhorpács' },
  'KRSFD-2026-24':       { target: 'acc:Fertőrákos' },
  'SBTK-2026-11':        { target: 'acc:Beled' },

  // ── szándékosan kimarad ───────────────────────────────────────────
  'KS-728241S-2026/163': { skip: 'Petőháza bérleti díj — előbb a bérleti konstrukciót kell beállítani' },
  'INV-000007':          { skip: 'Gede László — tételesen újrarögzítjük a megelőlegezett tétellel' },
  '100005674787':        { skip: 'Soproni Vízmű 67 596 Ft — a fogyasztási hely még tisztázandó' },
};

(async () => {
  const accs = new Map((await query(
    `SELECT id, name FROM accommodations`)).rows.map((r) => [r.name, r.id]));

  const invs = (await query(
    `SELECT i.id, i.invoice_number, i.vendor_name, i.total_amount,
            coalesce(ic.name,'—') AS kategoria
       FROM invoices i LEFT JOIN invoice_categories ic ON ic.id = i.category_id
      WHERE i.deleted_at IS NULL ORDER BY i.vendor_name`)).rows;

  const done = []; const skipped = []; const unknown = [];

  for (const inv of invs) {
    const d = DECISIONS[String(inv.invoice_number || '').trim()];
    if (!d) { unknown.push(inv); continue; }
    if (d.skip) { skipped.push({ inv, reason: d.skip }); continue; }

    let row;
    if (d.target.startsWith('acc:')) {
      const name = d.target.slice(4);
      const accId = accs.get(name);
      if (!accId) { skipped.push({ inv, reason: `nincs "${name}" nevű szállás` }); continue; }
      row = { target_type: 'accommodation', accommodation_id: accId,
              expense_category: d.category || null, utility_line: d.utility || null };
    } else {
      row = { target_type: d.target };
    }

    if (!APPLY) { done.push({ inv, row, sync: null }); continue; }

    const total = Number(inv.total_amount);
    const res = await allocations.setAllocations(inv.id, [row], total, null);
    if (res.error) { skipped.push({ inv, reason: `HIBA: ${res.error}` }); continue; }
    done.push({ inv, row, sync: res.expense_sync });
  }

  const ft = (n) => Number(n).toLocaleString('hu-HU') + ' Ft';
  log(`\n${APPLY ? '── BESOROLVA' : '── PRÓBA (nem ír)'} ────────────────────────────────`);
  for (const x of done) {
    const where = x.row.target_type === 'accommodation'
      ? [...accs.entries()].find(([, id]) => id === x.row.accommodation_id)[0]
      : x.row.target_type;
    const made = x.sync ? `költségsor: +${x.sync.created} ~${x.sync.updated} −${x.sync.removed}` : '';
    log(`  ${x.inv.vendor_name.slice(0, 38).padEnd(38)} ${ft(x.inv.total_amount).padStart(14)}  → ${String(where).padEnd(16)} ${made}`);
    for (const s of (x.sync?.skipped || [])) log(`      ↳ nincs költségsor: ${s.reason}`);
  }
  if (skipped.length) {
    log(`\n── KIMARADT (szándékosan) ─────────────────────────────`);
    for (const s of skipped) log(`  ${s.inv.vendor_name.slice(0, 38).padEnd(38)} ${ft(s.inv.total_amount).padStart(14)}  — ${s.reason}`);
  }
  if (unknown.length) {
    log(`\n── NINCS DÖNTÉS ───────────────────────────────────────`);
    for (const u of unknown) log(`  ${u.vendor_name} ${ft(u.total_amount)} (${u.invoice_number})`);
  }
  log('');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
