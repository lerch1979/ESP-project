/**
 * Számlán szereplő ágyszám vs. TÉNYLEGES foglaltság, házanként — olvasás, nem írás.
 *
 * A szeptemberi számla ágyszámait a tulajdonos adta meg (a Sarród és a Bük összevontan
 * szerepel rajta, ezért csoportként hasonlítjuk). Az augusztusi számla ágyszámait NEM
 * ismerjük, ezért augusztusra csak a tényleges oldal íródik ki — ahhoz a papír számla kell.
 *
 * ⚠️ A HÓNAP NEM TELJES. A foglaltsági pillanatképek csak addig a napig vannak meg,
 * ameddig a cron elért. Ezért NEM ágy-éjszakát hasonlítunk ágy-éjszakához (az a hiányzó
 * napok miatt mindig alulmérne), hanem ÁTLAGOS NAPI LÉTSZÁMOT a számlázott ágyszámhoz —
 * ez a kettő akkor is összevethető, ha a hónap fele van meg.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');

const ft = (n) => `${Math.round(Number(n || 0)).toLocaleString('hu-HU')} Ft`;

// A szeptemberi számla ágyszámai (tulajdonosi adat). A Bük és a Sarród összevont sor.
const SZAMLA_09 = {
  'Autoliv Kft': { 'Beled': 35, 'Petőháza': 21, 'Sarród (2 ház)': 22, 'Sopronhorpács': 42, 'Bük (4 ház)': 19, 'Fertőd': 3 },
  'Ikea':        { 'Röjtökmuzsaj': 51, 'Fertőszéplak': 20, 'Sarród (2 ház)': 7, 'Petőháza': 8, 'Sopronhorpács': 17, 'Fertőrákos': 25 },
};
const DIJ = { 'Autoliv Kft': 3476, 'Ikea': 3950 };

/** A Bük és a Sarród a számlán egy sor — a rendszerben több ház. */
const csoport = (nev) => (nev.startsWith('Bük') ? 'Bük (4 ház)'
  : nev.startsWith('Sarród') ? 'Sarród (2 ház)' : nev);

/** A munkahely szabadszövegben "Autoliv" és "Autoliv Kft" alakban is él. */
const mhNorm = (s) => (/^autoliv/i.test(s || '') ? 'Autoliv Kft' : /^ikea$/i.test(s || '') ? 'Ikea' : (s || '(nincs)'));

async function tenyleges(honap) {
  const napok = (await query(
    `SELECT count(DISTINCT snapshot_date)::int AS n, max(snapshot_date) AS utolso
       FROM occupancy_snapshots WHERE to_char(snapshot_date,'YYYY-MM')=$1`, [honap])).rows[0];
  const r = await query(`
    SELECT a.name AS haz, e.workplace AS mh, count(*)::int AS agyej
      FROM occupancy_snapshots os
      JOIN employees e ON e.id = os.employee_id
      JOIN accommodations a ON a.id = os.accommodation_id
     WHERE to_char(os.snapshot_date,'YYYY-MM') = $1
     GROUP BY 1,2`, [honap]);

  const map = new Map();
  for (const x of r.rows) {
    const kulcs = `${mhNorm(x.mh)}|${csoport(x.haz)}`;
    map.set(kulcs, (map.get(kulcs) || 0) + Number(x.agyej));
  }
  return { map, napok: napok.n, utolso: napok.utolso };
}

(async () => {
  // ─── SZEPTEMBER ──────────────────────────────────────────────────────────
  const sz = await tenyleges('2026-09');
  const [y, m] = [2026, 9];
  const honapNapjai = new Date(y, m, 0).getDate();

  console.log(`\n══ 2026-09 — SZÁMLA vs TÉNYLEGES ═══════════════════════════════`);
  console.log(`   ${sz.napok}/${honapNapjai} napra van foglaltsági adat\n`);
  console.log(`   ${'Munkahely'.padEnd(12)} ${'Ház'.padEnd(16)} ${'számla'.padStart(7)} ${'átlag'.padStart(7)} ${'eltérés'.padStart(8)}  ${'30 napra'.padStart(14)}`);
  console.log(`   ${'-'.repeat(72)}`);

  let osszEltAgy = 0; let osszEltFt = 0;
  const sorok = [];
  for (const [mh, hazak] of Object.entries(SZAMLA_09)) {
    for (const [haz, agy] of Object.entries(hazak)) {
      const agyej = sz.map.get(`${mh}|${haz}`) || 0;
      const atlag = sz.napok ? agyej / sz.napok : 0;
      const elteres = atlag - agy;                 // + = alulszámlázás, − = túlszámlázás
      const ftElt = elteres * honapNapjai * DIJ[mh];
      osszEltAgy += elteres; osszEltFt += ftElt;
      sorok.push({ mh, haz, agy, atlag, elteres, ftElt });
      sz.map.delete(`${mh}|${haz}`);
    }
  }
  // Ami a TÉNYLEGESBEN van, de a számlán nincs — ezek a teljesen kimaradt sorok.
  for (const [kulcs, agyej] of sz.map.entries()) {
    const [mh, haz] = kulcs.split('|');
    if (!DIJ[mh]) continue;
    const atlag = sz.napok ? agyej / sz.napok : 0;
    const ftElt = atlag * honapNapjai * DIJ[mh];
    osszEltAgy += atlag; osszEltFt += ftElt;
    sorok.push({ mh, haz, agy: 0, atlag, elteres: atlag, ftElt, hianyzo: true });
  }

  sorok.sort((a, b) => b.ftElt - a.ftElt);
  for (const s of sorok) {
    const jel = s.elteres > 0.5 ? 'ALUL' : s.elteres < -0.5 ? 'TÚL ' : '  ok';
    console.log(`   ${s.mh.padEnd(12)} ${s.haz.padEnd(16)} ${String(s.agy).padStart(7)} `
      + `${s.atlag.toFixed(1).padStart(7)} ${(s.elteres >= 0 ? '+' : '') + s.elteres.toFixed(1)}`.padStart(9)
      + `  ${ft(s.ftElt).padStart(14)}  ${jel}${s.hianyzo ? '  ← nincs a számlán' : ''}`);
  }
  console.log(`   ${'-'.repeat(72)}`);
  console.log(`   ${'EGYENLEG'.padEnd(29)} ${(osszEltAgy >= 0 ? '+' : '') + osszEltAgy.toFixed(1)}`.padEnd(45)
    + `${ft(osszEltFt).padStart(14)}  ${osszEltFt > 0 ? 'PÓTSZÁMLÁZANDÓ' : 'VISSZAJÁR'}`);

  // ─── AUGUSZTUS ───────────────────────────────────────────────────────────
  const au = await tenyleges('2026-08');
  console.log(`\n\n══ 2026-08 — csak a TÉNYLEGES oldal ════════════════════════════`);
  console.log(`   ${au.napok}/31 napra van foglaltsági adat`);
  console.log(`   (az augusztusi számla ágyszámait nem ismerjük — az a papíron van)\n`);
  console.log(`   ${'Munkahely'.padEnd(12)} ${'Ház'.padEnd(16)} ${'ágy-éj'.padStart(8)} ${'átlag fő'.padStart(9)}`);
  console.log(`   ${'-'.repeat(50)}`);
  const auSorok = [...au.map.entries()].map(([k, v]) => {
    const [mh, haz] = k.split('|');
    return { mh, haz, agyej: v, atlag: au.napok ? v / au.napok : 0 };
  }).filter((x) => DIJ[x.mh]).sort((a, b) => a.mh.localeCompare(b.mh) || a.haz.localeCompare(b.haz));
  for (const s of auSorok) {
    console.log(`   ${s.mh.padEnd(12)} ${s.haz.padEnd(16)} ${String(s.agyej).padStart(8)} ${s.atlag.toFixed(1).padStart(9)}`);
  }
  const auOssz = auSorok.reduce((s, x) => s + x.agyej, 0);
  console.log(`   ${'-'.repeat(50)}`);
  console.log(`   ${'ÖSSZESEN'.padEnd(29)} ${String(auOssz).padStart(8)}`);
  process.exit(0);
})();
