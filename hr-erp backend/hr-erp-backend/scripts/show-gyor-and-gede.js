/**
 * A győri költség-kimutatás és a Gede László felé menő elszámoló lap — olvasás, nem írás.
 * Azt mutatja meg, hogyan látszik a három rögzített számla a két végén.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const profit = require('../src/services/profit.service');
const sheet = require('../src/services/settlementSheet.service');

const HONAP = '2026-09';
const ft = (n) => `${Math.round(Number(n || 0)).toLocaleString('hu-HU')} Ft`;

(async () => {
  // ── 1. GYŐR A KÖLTSÉG-KIMUTATÁSBAN ────────────────────────────────────────
  console.log(`\n══ GYŐR — költség-kimutatás, ${HONAP} ═══════════════════════════\n`);
  const p = await profit.getByAccommodation({ month: HONAP });
  const gyor = (p.data?.by_accommodation || []).find((r) => r.accommodation_name === 'Győr');
  if (!gyor) console.log('  Győr nem szerepel a kimutatásban.');
  else {
    console.log(`  bevétel ............ ${ft(gyor.income)}`);
    console.log(`  bérleti díj ........ ${ft(gyor.rent)}`);
    console.log(`  üzemeltetési ktg ... ${ft(gyor.expenses.total)}`);
    for (const [nev, ertek] of Object.entries(gyor.expenses)) {
      if (nev === 'total' || !Number(ertek)) continue;
      console.log(`     ${nev.padEnd(18)} ${ft(ertek)}`);
    }
    console.log(`  eredmény ........... ${ft(gyor.profit)}`);
  }

  // ── 2. MI MARADT KI SZÁNDÉKOSAN ───────────────────────────────────────────
  const claim = (await query(`
    SELECT e.amount, e.net_amount, e.recovered_amount, e.recovery_status, c.name AS kitol
      FROM accommodation_expenses e
      JOIN accommodations a ON a.id=e.accommodation_id
      LEFT JOIN contractors c ON c.id=e.recoverable_from_contractor_id
     WHERE a.name='Győr' AND e.cost_bearer='megelolegezett' AND e.deleted_at IS NULL`)).rows;
  console.log(`\n  ── megelőlegezett, ezért NEM költség ──`);
  for (const x of claim) {
    console.log(`     ${ft(x.amount)} (nettó ${ft(x.net_amount)}) — követelés: ${x.kitol}, ${x.recovery_status}`);
  }

  // ── 3. GEDE LÁSZLÓ ELSZÁMOLÓ LAPJA ────────────────────────────────────────
  console.log(`\n══ GEDE LÁSZLÓ — szállásadói elszámoló lap, ${HONAP} ═══════════\n`);
  const gede = (await query(`SELECT id FROM contractors WHERE name='Gede László'`)).rows[0];
  const lap = await sheet.landlordSheet({ month: HONAP, landlordId: gede.id });
  for (const a of lap.accommodations || []) {
    console.log(`  ${a.accommodation_name.padEnd(24)} ${String(a.rent_basis || '-').padEnd(14)} ${ft(a.cost_total)}`);
  }
  console.log(`  ${'BRUTTÓ BÉRLETI DÍJ'.padEnd(39)} ${ft(lap.totals?.gross_total)}`);
  console.log(`\n  LEVONÁSOK:`);
  for (const d of lap.deductions || []) {
    console.log(`     ${String(d.label || d.vendor_name).padEnd(55)} −${ft(d.amount)}`);
  }
  console.log(`  ${'levonások összesen'.padEnd(39)} −${ft(lap.totals?.deductions_total)}`);
  console.log(`  ${'FIZETENDŐ'.padEnd(39)} ${ft(lap.totals?.net_payable)}`);
  process.exit(0);
})();
