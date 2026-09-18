/**
 * A szeptemberi előre kiszámlázott sorok szétbontása — JAVASLAT, nem rögzítés.
 *
 * A számlán a "Sarród" és a "Bük" ÖSSZEVONTAN szerepel, a rendszerben viszont Sarród I./II.
 * és négy Bük-ház van külön. A korrekció (ház × munkahely) kulcson számol, tehát az
 * összevont sorokat szét kell osztani.
 *
 * A SZÉTOSZTÁS ALAPJA a tényleges foglaltság aránya — ez a legjobb rendelkezésre álló
 * jel, de NEM tény: a számlázáskor valaki tudta, melyik ház hány ágyra szólt, csak az az
 * adat nincs meg nálunk. Ezért ez javaslat, és a végösszeg helyes akkor is, ha a
 * házankénti bontás nem pontos — a különbözet TELJES összege nem függ a szétosztástól,
 * csak az, hogy melyik ház sorában jelenik meg.
 *
 * LEGNAGYOBB MARADÉK módszer: az arányos ágyszámok egész részét kiosztjuk, a maradék
 * ágyakat pedig a legnagyobb törtrészű házak kapják. Így az összeg PONTOSAN annyi ágy
 * marad, amennyi a számlán van — kerekítéssel egy ággyal el lehetne csúszni.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const svc = require('../src/services/billingCorrection.service');

const HONAP = '2026-09';
const ft = (n) => `${Math.round(Number(n || 0)).toLocaleString('hu-HU')} Ft`;

// A számla összevont sorai, amiket szét kell bontani
const OSSZEVONT = [
  { csoport: 'Sarród', munkahely: 'Autoliv Kft', agy: 22, dij: 3476, minta: /^Sarród/ },
  { csoport: 'Sarród', munkahely: 'Ikea',        agy: 7,  dij: 3950, minta: /^Sarród/ },
  { csoport: 'Bük',    munkahely: 'Autoliv Kft', agy: 19, dij: 3476, minta: /^Bük/ },
];

/** Legnagyobb maradék: az összeg garantáltan pontosan a kiosztandó ágyszám. */
function legnagyobbMaradek(sulyok, osszesAgy) {
  const osszSuly = sulyok.reduce((s, x) => s + x.suly, 0);
  if (osszSuly === 0) return sulyok.map((x) => ({ ...x, agy: 0 }));
  const nyers = sulyok.map((x) => ({ ...x, pontos: (x.suly / osszSuly) * osszesAgy }));
  const alap = nyers.map((x) => ({ ...x, agy: Math.floor(x.pontos), maradek: x.pontos - Math.floor(x.pontos) }));
  let hianyzik = osszesAgy - alap.reduce((s, x) => s + x.agy, 0);
  alap.sort((a, b) => b.maradek - a.maradek);
  for (let i = 0; hianyzik > 0; i = (i + 1) % alap.length, hianyzik--) alap[i].agy += 1;
  return alap;
}

(async () => {
  const mb = (await query(
    `SELECT id, name FROM contractors WHERE name='Man At Work Győr'`)).rows[0];
  const teny = await svc.actualForMonth(HONAP, mb.id);
  const cov = await svc.coverage(HONAP);

  console.log(`\n══ ÖSSZEVONT SOROK SZÉTBONTÁSA — javaslat ═══════════════════\n`);
  console.log(`  Alap: a ${HONAP} tényleges foglaltsága (${cov.days_with_data}/${cov.days_in_month} nap)\n`);

  for (const o of OSSZEVONT) {
    const erintett = teny.filter((t) => o.minta.test(t.accommodation) && t.workplace === o.munkahely);
    if (erintett.length === 0) { console.log(`  ${o.csoport} / ${o.munkahely}: nincs tényleges adat — nem bontható`); continue; }

    const sulyok = erintett.map((t) => ({ haz: t.accommodation, suly: Number(t.bed_nights || 0) }));
    const eloszt = legnagyobbMaradek(sulyok, o.agy).sort((a, b) => a.haz.localeCompare(b.haz));

    console.log(`  ${o.csoport} / ${o.munkahely} — ${o.agy} ágy × 30 nap × ${ft(o.dij)}`);
    let ossz = 0;
    for (const e of eloszt) {
      const sor = o.agy ? Math.round(e.agy * 30 * o.dij) : 0;
      ossz += sor;
      console.log(`     ${e.haz.padEnd(24)} tényleges ${String(e.suly).padStart(4)} ágy-éj `
        + `→ ${String(e.agy).padStart(3)} ágy  (${(e.pontos).toFixed(2)})  ${ft(sor).padStart(12)}`);
    }
    console.log(`     ${'összesen'.padEnd(24)} ${String(eloszt.reduce((s, x) => s + x.agy, 0)).padStart(16)} ágy  `
      + `${' '.repeat(9)}${ft(ossz).padStart(12)}`);
    console.log();
  }

  // ── A 97 984 Ft eltérés — mit lát a rendszer ─────────────────────────────
  console.log(`══ A 97 984 Ft ELTÉRÉS — amit a rendszerből meg lehet nézni ═══\n`);
  const KULONBOZET = 30073744 - 29975760;
  console.log(`  számla végösszege .......... ${ft(30073744)}`);
  console.log(`  a két tétel összege ........ ${ft(29975760)}`);
  console.log(`  eltérés .................... ${ft(KULONBOZET)}\n`);
  for (const d of [3476, 3950]) {
    const ej = KULONBOZET / d;
    console.log(`  ${d} Ft/fő/éj mellett ez ${ej.toFixed(2)} ágy-éjszaka `
      + `${Number.isInteger(Math.round(ej * 100) / 100) ? '' : '→ NEM egész, tehát nem ezen a díjon van'}`);
  }
  console.log(`  30 napra vetítve ${(KULONBOZET / 30).toFixed(2)} Ft/nap — nem kerek ágyszám egyik díjon sem\n`);

  // Van-e harmadik munkahely vagy díj a rendszerben?
  const wp = (await query(
    `SELECT DISTINCT coalesce(w.name,'(nincs)') AS nev FROM occupancy_snapshots os
       JOIN employees e ON e.id=os.employee_id LEFT JOIN workplaces w ON w.id=e.workplace_id
      WHERE to_char(os.snapshot_date,'YYYY-MM')=$1`, [HONAP])).rows.map((r) => r.nev);
  const dijak = (await query(
    `SELECT DISTINCT rate_used FROM client_night_rates WHERE valid_to IS NULL ORDER BY 1`)).rows
    .map((r) => Number(r.rate_used));
  console.log(`  munkahelyek a szeptemberi foglaltságban: ${wp.join(', ')}`);
  console.log(`  élő díjak a rendszerben: ${dijak.join(', ')} Ft`);

  const ukran = (await query(
    `SELECT count(DISTINCT e.id)::int AS fo, count(*)::int AS ej
       FROM occupancy_snapshots os JOIN employees e ON e.id=os.employee_id
      WHERE to_char(os.snapshot_date,'YYYY-MM')=$1 AND upper(coalesce(e.nationality,''))='UA'`,
    [HONAP])).rows[0];
  console.log(`  ukrán (UA) lakó a szeptemberi foglaltságban: ${ukran.fo} fő, ${ukran.ej} fő-éjszaka`);
  console.log(`\n  → A rendszerben NINCS harmadik munkahely és NINCS harmadik díj.`);
  console.log(`    Az eltérés forrása csak a SZÁMLÁRÓL állapítható meg.\n`);
  process.exit(0);
})();
