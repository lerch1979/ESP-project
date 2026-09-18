/**
 * Váz a szeptemberi ELŐRE KISZÁMLÁZOTT adat bevitelhez — olvasás, nem írás.
 *
 * A korrekciós modul a TÉNYLEGES oldalt magától számolja, az előre kiszámlázottat viszont
 * ember viszi be (a Számlázz.hu-integráció nincs megépítve). Ez a szkript kiírja, mely
 * (ház × munkahely) párokra van egyáltalán tényleges adat, mennyi az ágy-éjszaka és
 * milyen díjjal — hogy az űrlapon ne nulláról kelljen kitalálni a sorokat.
 *
 * Amit NEM tesz: nem javasol ágyszámot. Az előre kiszámlázott ágyszám a SZÁMLÁN van, nem
 * a foglaltságban — pont az a különbözet lényege, hogy a kettő eltér.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const svc = require('../src/services/billingCorrection.service');

const HONAP = process.argv[2] || '2026-09';
const ft = (n) => `${Math.round(Number(n || 0)).toLocaleString('hu-HU')} Ft`;
/** Helyi dátumrészekből — a pg DATE Date objektumként jön, a String()-je "Thu Sep 17 2026". */
const ymd = (d) => {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? String(d)
    : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

(async () => {
  const mb = (await query(
    `SELECT c.id, c.name FROM contractors c
      JOIN contractor_roles cr ON cr.contractor_id=c.id AND cr.role='megbizo'
     WHERE c.name='Man At Work Győr'`)).rows[0];
  if (!mb) { console.error('nincs meg a megbízó'); process.exit(1); }

  const sorok = await svc.actualForMonth(HONAP, mb.id);
  const cov = await svc.coverage(HONAP);

  console.log(`\n══ ${HONAP} — TÉNYLEGES foglaltság, ${mb.name} ════════════════════\n`);
  console.log(`  ${'Szálláshely'.padEnd(26)} ${'Munkahely'.padEnd(14)} ${'ágy-éj'.padStart(7)} ${'díj'.padStart(8)} ${'tényleges'.padStart(13)}`);
  console.log(`  ${'-'.repeat(74)}`);

  let osszEj = 0; let osszFt = 0;
  for (const r of sorok) {
    osszEj += Number(r.bed_nights || 0);
    osszFt += Number(r.net_amount || 0);
    console.log(`  ${String(r.accommodation).padEnd(26)} ${String(r.workplace).padEnd(14)} `
      + `${String(r.bed_nights).padStart(7)} ${String(r.rate_used ? Math.round(r.rate_used) : '—').padStart(8)} `
      + `${ft(r.net_amount).padStart(13)}`);
  }
  console.log(`  ${'-'.repeat(74)}`);
  console.log(`  ${'ÖSSZESEN'.padEnd(41)} ${String(osszEj).padStart(7)} ${''.padStart(8)} ${ft(osszFt).padStart(13)}`);

  console.log(`\n  Foglaltsági adat: ${cov.days_with_data}/${cov.days_in_month} nap`
    + (cov.complete ? '' : `  ⚠️ a hónap még nem teljes (utolsó nap: ${ymd(cov.last_day)})`));
  console.log(`  Ennyi sort kell kitölteni az űrlapon: ${sorok.length}\n`);
  process.exit(0);
})();
