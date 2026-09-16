/**
 * Egy vagy több hónap számlázási futásának újraszámolása, ELŐTTE/UTÁNA összevetéssel.
 *
 * MIÉRT KELL
 * ----------
 * A `cost_amount` a futás pillanatában befagy. Ha utólag kerül be költség (például egy
 * számla besorolásából képzett költségsor), a kimutatás számai attól még a régiek — sőt,
 * átmenetileg félrevezetők: a profit-nézet a bérleti díjat `cost_amount − üzemeltetési
 * költség`-ként vezeti le, így egy be nem számolt költség NEGATÍV bérleti díjként jelenik
 * meg. Ez a szkript hozza szinkronba a kettőt, és megmutatja, mi változott.
 *
 * VÉDELEM
 * -------
 * Lezárt (finalized) hónaphoz nem nyúl: azt a motor is visszautasítaná, de itt előbb
 * megállunk, hogy a hiba ne egy tranzakció közepén derüljön ki.
 *
 *   node scripts/recalc-months.js 2026-07 2026-09            # csak az összevetés
 *   node scripts/recalc-months.js 2026-07 2026-09 --apply    # újraszámolás
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const engine = require('../src/services/billingEngine.service');

const APPLY = process.argv.includes('--apply');
const months = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));

const ft = (n) => Number(n || 0).toLocaleString('hu-HU') + ' Ft';

async function snapshot(month) {
  const r = await query(
    `SELECT a.name, ab.total_amount AS bevetel, ab.cost_amount AS koltseg, ab.margin_amount AS margin,
            coalesce(ab.total_employee_days, 0) AS fo_ej
       FROM accommodation_billings ab
       JOIN accommodations a ON a.id = ab.accommodation_id
       JOIN billing_runs br ON br.id = ab.billing_run_id
      WHERE ab.billing_month = $1 AND br.status <> 'cancelled' AND ab.status <> 'cancelled'`, [month]);
  const by = new Map();
  for (const x of r.rows) {
    const cur = by.get(x.name) || { bevetel: 0, koltseg: 0, margin: 0, fo_ej: 0 };
    cur.bevetel += Number(x.bevetel || 0);
    cur.koltseg += Number(x.koltseg || 0);
    cur.margin  += Number(x.margin  || 0);
    cur.fo_ej   += Number(x.fo_ej   || 0);
    by.set(x.name, cur);
  }
  return by;
}

(async () => {
  if (months.length === 0) { console.error('Adj meg legalább egy hónapot: YYYY-MM'); process.exit(1); }

  for (const month of months) {
    const lock = await query(
      `SELECT finalized_at FROM billing_runs
        WHERE billing_month = $1 AND finalized_at IS NOT NULL AND status <> 'cancelled' LIMIT 1`, [month]);
    if (lock.rows.length > 0) {
      console.log(`\n⛔ ${month} LE VAN ZÁRVA (${lock.rows[0].finalized_at}) — nem számoljuk újra.`);
      continue;
    }

    const before = await snapshot(month);
    if (APPLY) await engine.calculateMonthlyBilling(month, { notes: '[recalc — számlabesorolás után]' });
    const after = APPLY ? await snapshot(month) : before;

    const names = [...new Set([...before.keys(), ...after.keys()])].sort();
    console.log(`\n── ${month} ${APPLY ? '' : '(csak összevetés, nem írt)'} ─────────────────────────`);
    console.log('  szállás              fő-éj        bevétel              költség               margin');
    let vb = 0; let vk = 0; let vm = 0; let ub = 0; let uk = 0; let um = 0; let vf = 0; let uf = 0;
    for (const n of names) {
      const b = before.get(n) || { bevetel: 0, koltseg: 0, margin: 0, fo_ej: 0 };
      const a = after.get(n)  || { bevetel: 0, koltseg: 0, margin: 0, fo_ej: 0 };
      vb += b.bevetel; vk += b.koltseg; vm += b.margin; vf += b.fo_ej;
      ub += a.bevetel; uk += a.koltseg; um += a.margin; uf += a.fo_ej;
      const valt = b.koltseg !== a.koltseg || b.bevetel !== a.bevetel || b.fo_ej !== a.fo_ej;
      const jel = valt ? '→' : ' ';
      const p2 = (x, y, w) => (valt && x !== y ? `${String(x).padStart(w)}→${String(y).padStart(w)}` : String(x).padStart(w * 2 + 1));
      console.log(`  ${jel} ${n.padEnd(20)} ${p2(b.fo_ej, a.fo_ej, 5)}  ${p2(ft(b.bevetel), ft(a.bevetel), 13)}`
                + `  ${p2(ft(b.koltseg), ft(a.koltseg), 12)}  ${p2(ft(b.margin), ft(a.margin), 12)}`);
    }
    console.log(`    ${'ÖSSZESEN'.padEnd(20)} ${String(vf).padStart(5)}${APPLY ? '→' + String(uf).padStart(5) : ''}`
              + `  ${ft(vb)}${APPLY ? ' → ' + ft(ub) : ''}`
              + `  ${ft(vk)}${APPLY ? ' → ' + ft(uk) : ''}`
              + `  ${ft(vm)}${APPLY ? ' → ' + ft(um) : ''}`);
  }
  console.log('');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
