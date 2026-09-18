/**
 * Mit lát a korrekciós modul élesben? Olvasás, nem írás.
 *
 * Végigveszi a számlázott hónapokat megbízónként, és kiszámolja, mennyi a TÉNYLEGES
 * foglaltság szerinti összeg. Az előre számlázottat NEM tudja — az kézi bevitel —, ezért
 * nem javaslatot készít, hanem megmutatja, mihez képest kellene összevetni.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const svc = require('../src/services/billingCorrection.service');

const ft = (n) => `${Math.round(Number(n || 0)).toLocaleString('hu-HU')} Ft`;

(async () => {
  console.log('\n══ KORREKCIÓS MODUL — éles állapot ════════════════════════\n');

  const nyitott = await svc.open({});
  console.log(`  nyitott korrekciók: ${nyitott.rows.length} db`);
  console.log(`     döntésre vár ...... ${nyitott.javaslat} db, ${ft(nyitott.javaslat_osszeg)}`);
  console.log(`     jóváhagyva ........ ${nyitott.jovahagyva} db, ${ft(nyitott.jovahagyva_osszeg)}`);
  for (const r of nyitott.rows) {
    console.log(`     · ${r.contractor_name} ${r.affected_month} — ${ft(r.open_amount)} (${r.status}, ${r.aging_bucket})`);
  }

  const beszamitva = (await query(
    `SELECT c.name, bc.affected_month, bc.amount, bc.status
       FROM billing_corrections bc JOIN contractors c ON c.id=bc.contractor_id
      WHERE bc.status='beszamitva' ORDER BY bc.affected_month`)).rows;
  console.log(`\n  lezárt korrekciók: ${beszamitva.length} db`);
  for (const r of beszamitva) console.log(`     · ${r.name} ${r.affected_month} — ${ft(r.amount)} (${r.status})`);

  // ── Mely hónapokra VAN egyáltalán tényleges adat, amihez viszonyítani lehetne ──
  console.log('\n══ MELY HÓNAPOKRA SZÁMOLNA KÜLÖNBÖZETET ═══════════════════\n');
  const honapok = (await query(
    `SELECT ab.billing_month, c.name AS megbizo, ab.partner_contractor_id AS id,
            sum(ab.total_amount)::numeric AS tenyleges,
            sum(ab.total_employee_days)::int AS fo_ej
       FROM accommodation_billings ab
       JOIN billing_runs br ON br.id=ab.billing_run_id
       JOIN contractors c ON c.id=ab.partner_contractor_id
      WHERE br.status <> 'cancelled' AND ab.status <> 'cancelled' AND ab.total_amount > 0
      GROUP BY 1,2,3 ORDER BY 1`)).rows;

  for (const h of honapok) {
    const cov = await svc.coverage(h.billing_month);
    const van = (await query(
      `SELECT status FROM billing_corrections
        WHERE contractor_id=$1 AND affected_month=$2 AND status <> 'elvetve'`,
      [h.id, h.billing_month])).rows[0];
    console.log(`  ${h.billing_month}  ${h.megbizo.padEnd(22)} tényleges: ${ft(h.tenyleges).padStart(14)}`
      + `  ${String(h.fo_ej).padStart(5)} fő-éj  adat: ${cov.days_with_data}/${cov.days_in_month} nap`
      + (van ? `  → van korrekció (${van.status})` : '  → nincs korrekció'));
  }

  console.log('\n  A modul MAGÁTÓL nem számol: az előre számlázott oldal kézi bevitel.');
  console.log('  Ezek a hónapok azok, amikhez van mihez viszonyítani.\n');
  process.exit(0);
})();
