/**
 * A `billing_client_id` előtöltésének JAVASLATA a munkahely alapján.
 *
 * MIÉRT CSAK JAVASLAT
 * -------------------
 * A munkahely NEM azonos a megbízóval. A rendszerben volt rá bizonyíték, mielőtt bárki
 * kimondta: 18 dolgozónál a workplace "Autoliv Kft", a megbízó viszont "Man At Work" —
 * ők közvetítik a lakókat az Autolivhoz. Ha a workplace-t vakon megbízónak vennénk, 474
 * embert kötnénk egy olyan partnerhez, aki nem is a megbízónk. Ezért a leképezést ember
 * adja meg (MAPPING alább), a szkript pedig csak végrehajtja — `--apply` nélkül semmit
 * nem ír.
 *
 *   node scripts/propose-billing-client.js            # javaslat, nem ír
 *   node scripts/propose-billing-client.js --apply    # végrehajtás
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const { nameKey } = require('../src/utils/nameMatch');

const APPLY = process.argv.includes('--apply');

// A tulajdonos döntése: minden lakónk után jelenleg a Man At Work a megbízó — ők
// közvetítik őket az Autolivhoz és az IKEA-hoz egyaránt.
// Kulcs: a munkahely NORMALIZÁLT alakja (ékezet- és kisbetű-független), hogy az
// "Autoliv Kft" / "Autoliv" és az "Ikea" / "IKEA" írásmód ne essen szét.
const MAPPING = {
  'autoliv kft': 'Man At Work',
  'autoliv':     'Man At Work',
  'ikea':        'Man At Work',
};

(async () => {
  const partners = new Map((await query(
    `SELECT id, name FROM contractors WHERE is_active`)).rows.map((r) => [r.name, r.id]));

  // CSAK AKTÍV dolgozók. A kiléptetett sorokra megbízót rendelni értelmetlen: nem
  // számláznak utánuk, viszont a művelet elfedné, hogy valójában hány emberről van szó —
  // a 835-ös szám is így jött ki korábban, a kiléptetetteket is beleszámolva.
  const rows = (await query(`
    SELECT coalesce(nullif(btrim(e.workplace), ''), '') AS workplace,
           count(*)::int AS fo,
           count(e.billing_client_id)::int AS mar_van,
           count(*) FILTER (WHERE e.accommodation_id IS NOT NULL)::int AS elszallasolva
      FROM employees e WHERE e.end_date IS NULL GROUP BY 1 ORDER BY 2 DESC`)).rows;

  const terv = []; const kimarad = [];
  for (const r of rows) {
    const cel = MAPPING[nameKey(r.workplace)];
    if (!cel) { kimarad.push(r); continue; }
    const id = partners.get(cel);
    if (!id) { kimarad.push({ ...r, ok: `nincs "${cel}" nevű partner` }); continue; }
    terv.push({ ...r, cel, celId: id });
  }

  console.log(`\n── ${APPLY ? 'VÉGREHAJTÁS' : 'JAVASLAT (nem ír)'} ────────────────────────────`);
  let ossz = 0; let valtozik = 0;
  for (const t of terv) {
    ossz += t.fo; valtozik += (t.fo - t.mar_van);
    console.log(`  "${t.workplace}"`.padEnd(22)
      + `${String(t.fo).padStart(4)} fő  →  ${t.cel}`
      + `   (${t.mar_van} már be van állítva, ${t.fo - t.mar_van} változik,`
      + ` ${t.elszallasolva} elszállásolva)`);
  }
  console.log(`  ${''.padEnd(20)} ────`);
  console.log(`  ÖSSZESEN            ${String(ossz).padStart(4)} fő, ebből ${valtozik} változik`);

  if (kimarad.length) {
    console.log(`\n── KIMARAD (nincs leképezés) ──────────────────────────`);
    for (const k of kimarad) {
      console.log(`  "${k.workplace || '(üres)'}"`.padEnd(22) + `${String(k.fo).padStart(4)} fő`
        + (k.ok ? `  — ${k.ok}` : '  — kézzel kell megadni'));
    }
  }

  if (APPLY) {
    let total = 0;
    for (const t of terv) {
      const r = await query(
        `UPDATE employees SET billing_client_id = $1
          WHERE coalesce(nullif(btrim(workplace), ''), '') = $2
            AND end_date IS NULL
            AND (billing_client_id IS NULL OR billing_client_id <> $1)`,
        [t.celId, t.workplace]);
      total += r.rowCount;
    }
    console.log(`\n✓ ${total} dolgozó megbízója beállítva.\n`);
  } else {
    console.log('\n(--apply nélkül semmi nem íródott)\n');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
