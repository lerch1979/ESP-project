/**
 * A 97 984 Ft-os eltérés visszafejtése — kimerítő keresés, nem találgatás.
 *
 * A szeptemberi számla végösszege (30 073 744) és a két ágy-éjszaka tétel összege
 * (29 975 760) között 97 984 Ft a különbség. Ez a szkript MINDEN olyan egész kombinációt
 * megkeres, ami a rendszerben előforduló egységárakból pontosan kiadja.
 *
 * MIÉRT KIMERÍTŐ KERESÉS: egy "ez lehet" típusú tipp itt semmit nem ér. Vagy van pontos
 * felbontás, vagy nincs — és ha több is van, akkor az számít, hogy melyik illeszkedik a
 * tényleges foglaltsághoz. A szkript ezért mindet kiírja, és NEM dönt helyettünk.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');

const CEL = 30073744 - 29975760;   // 97 984

// Az egységárak, amik a rendszerben ténylegesen előfordulnak, plusz a kérdésben megadottak.
const EGYSEGEK = [
  { nev: 'Autoliv fő/éj',            ertek: 3476 },
  { nev: 'IKEA fő/éj',               ertek: 3950 },
  { nev: 'Beled bérleti fő/éj',      ertek: 2200 },
  { nev: 'MaW Budapest fő/éj',       ertek: 3500 },
  { nev: 'átsorolási különbözet',    ertek: 474 },    // 3950 − 3476
  { nev: 'beköltözési díj / fő',     ertek: 79000 },  // 790 000 / 10 fő (augusztusi számla)
];

(async () => {
  console.log(`\n══ 97 984 Ft VISSZAFEJTÉSE ═══════════════════════════════════\n`);
  console.log(`  cél: ${CEL.toLocaleString('hu-HU')} Ft`);
  console.log(`  egységárak: ${EGYSEGEK.map((e) => `${e.ertek} (${e.nev})`).join(', ')}\n`);

  // ── 1. EGY egységár önmagában ────────────────────────────────────────────
  console.log('  ── egyetlen egységáron, egész darabszámmal ──');
  let vanEgyszeru = false;
  for (const e of EGYSEGEK) {
    const db = CEL / e.ertek;
    const egesz = Number.isInteger(db);
    if (egesz) vanEgyszeru = true;
    console.log(`     ${String(e.ertek).padStart(6)} Ft × ${db.toFixed(3).padStart(9)} `
      + `${egesz ? '✅ PONTOS' : '✗'}  (${e.nev})`);
  }
  if (!vanEgyszeru) console.log('     → egyetlen egységár sem adja ki egész darabszámmal\n');

  // ── 2. KIMERÍTŐ keresés a hat egységár tetszőleges kombinációjára ────────
  const [A, I, B, BP, D, BE] = EGYSEGEK.map((e) => e.ertek);
  const talalatok = [];
  for (let be = 0; be * BE <= CEL; be++) {
    for (let i = 0; i * I <= CEL - be * BE; i++) {
      for (let bp = 0; bp * BP <= CEL - be * BE - i * I; bp++) {
        for (let a = 0; a * A <= CEL - be * BE - i * I - bp * BP; a++) {
          for (let b = 0; b * B <= CEL - be * BE - i * I - bp * BP - a * A; b++) {
            const maradek = CEL - be * BE - i * I - bp * BP - a * A - b * B;
            if (maradek % D !== 0) continue;
            const d = maradek / D;
            const tagok = [
              be && `${be} × 79 000 (beköltözési)`,
              i && `${i} × 3 950 (IKEA éj)`,
              bp && `${bp} × 3 500 (MaW BP éj)`,
              a && `${a} × 3 476 (Autoliv éj)`,
              b && `${b} × 2 200 (Beled éj)`,
              d && `${d} × 474 (átsorolás)`,
            ].filter(Boolean);
            talalatok.push({ tagok, tagszam: tagok.length, osszDb: be + i + bp + a + b + d });
          }
        }
      }
    }
  }

  console.log(`\n  ── kimerítő keresés: ${talalatok.length} pontos kombináció ──\n`);
  // A kevés tagból álló, kis darabszámú megoldások az életszerűek: egy számlasor
  // ritkán áll össze ötféle egységárból.
  talalatok.sort((x, y) => x.tagszam - y.tagszam || x.osszDb - y.osszDb);
  for (const t of talalatok.slice(0, 12)) {
    console.log(`     ${t.tagok.join('  +  ')}`);
  }
  if (talalatok.length > 12) console.log(`     … és még ${talalatok.length - 12} kombináció`);

  // ── 3. A legegyszerűbbek külön ───────────────────────────────────────────
  const egytagu = talalatok.filter((t) => t.tagszam === 1);
  const kettagu = talalatok.filter((t) => t.tagszam === 2);
  console.log(`\n  egytagú megoldás: ${egytagu.length} db`);
  for (const t of egytagu) console.log(`     ✅ ${t.tagok[0]}`);
  console.log(`  kéttagú megoldás: ${kettagu.length} db`);
  for (const t of kettagu.slice(0, 8)) console.log(`     · ${t.tagok.join('  +  ')}`);

  // ── 4. Az augusztusi beköltözési díj mintája ─────────────────────────────
  console.log(`\n  ── augusztusi minta: 790 000 Ft / 10 fő = ${(790000 / 10).toLocaleString('hu-HU')} Ft/fő ──`);
  console.log(`     97 984 / 79 000 = ${(CEL / 79000).toFixed(3)} fő → nem egész, tehát önmagában nem beköltözési díj`);

  // ── 5. Illeszkedik-e bármelyik a tényleges szeptemberi foglaltsághoz? ────
  const uj = (await query(`
    SELECT count(DISTINCT h.employee_id)::int AS fo
      FROM employee_accommodation_history h
     WHERE h.check_in_date >= '2026-09-01' AND h.check_in_date < '2026-10-01'`)).rows[0];
  console.log(`\n  szeptemberben beköltözött (a rendszer szerint): ${uj.fo} fő`);
  process.exit(0);
})();
