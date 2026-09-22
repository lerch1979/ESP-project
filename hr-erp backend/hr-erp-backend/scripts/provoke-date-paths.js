/**
 * A DATE-parser váltás (mig — connection.js setTypeParser 1082) utáni PROVOKÁCIÓS futás.
 *
 * MIÉRT KELL: a 287 functest zöld, de a lefedetlen területeken — ritkán futó riportok,
 * PDF/XLSX generálás, hónapzárás-ellenőrzés — maradhat olyan kód, ami IMPLICIT módon
 * `Date` objektumra számít. Ezeket nem megvárni kell, hanem kiprovokálni.
 *
 * Minden hívás külön try/catch-ben: egy elszálló riport ne akadályozza meg a többi
 * kipróbálását. A végén összesítés, hogy egy pillantással látszódjon, mi tört.
 *
 * READ-ONLY: a hónapzárásnál CSAK az ellenőrzés fut, a zárás nem.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');

const eredmeny = [];
async function probal(nev, fn) {
  const t0 = Date.now();
  try {
    const out = await fn();
    eredmeny.push({ nev, ok: true, info: out, ms: Date.now() - t0 });
    console.log(`   ✓ ${nev.padEnd(46)} ${String(out || '').slice(0, 40)}`);
  } catch (e) {
    eredmeny.push({ nev, ok: false, hiba: e.message, ms: Date.now() - t0 });
    console.log(`   ✗ ${nev.padEnd(46)} ${e.message.slice(0, 60)}`);
  }
}

(async () => {
  const HONAP = '2026-09';
  console.log(`\n══ DATE-provokáció — ${HONAP} ═══════════════════════════════\n`);

  // ── 1. ELSZÁMOLÓ LAPOK, mindkét fél, mindkét formátum ────────────────────
  console.log('── Elszámoló lapok');
  const sheet = require('../src/services/settlementSheet.service');
  const partnerek = await query(`
    SELECT DISTINCT a.current_contractor_id AS id, c.name
      FROM accommodations a JOIN contractors c ON c.id = a.current_contractor_id
     WHERE a.is_active AND a.current_contractor_id IS NOT NULL LIMIT 3`);
  const megbizok = await query(`
    SELECT DISTINCT ab.partner_contractor_id AS id, c.name
      FROM accommodation_billings ab JOIN contractors c ON c.id = ab.partner_contractor_id
     WHERE ab.billing_month = $1 LIMIT 2`, [HONAP]);

  for (const p of partnerek.rows) {
    await probal(`szállásadói lap — ${p.name.slice(0, 22)}`, async () => {
      const s = await sheet.landlordSheet({ month: HONAP, landlordId: p.id });
      return `${(s.accommodations || []).length} ház, fizetendő ${s.totals?.net_payable}`;
    });
  }
  for (const m of megbizok.rows) {
    await probal(`megbízói lap — ${m.name.slice(0, 26)}`, async () => {
      const s = await sheet.clientSheet({ month: HONAP, clientId: m.id });
      return `${(s.sites || []).length} telephely, nettó ${s.totals?.net}`;
    });
  }

  // XLSX + PDF mindkét lapfajtára — a PDF a legérzékenyebb, ott dátumot RAJZOLUNK
  const render = require('../src/services/settlementRender.service');
  for (const [cimke, betolt] of [
      ['szállásadói', () => sheet.landlordSheet({ month: HONAP, landlordId: partnerek.rows[0].id })],
      ['megbízói',    () => sheet.clientSheet({ month: HONAP, clientId: megbizok.rows[0].id })]]) {
    await probal(`${cimke} lap → XLSX`, async () => {
      const buf = render.renderXlsx(await betolt());
      return `${Buffer.isBuffer(buf) ? buf.length : '?'} bájt`;
    });
    await probal(`${cimke} lap → PDF`, async () => {
      const buf = await render.renderPdf(await betolt());
      return `${Buffer.isBuffer(buf) ? buf.length : '?'} bájt`;
    });
    await probal(`${cimke} lap → fájlnév`, async () => render.fileBase(await betolt()));
  }

  // ── 2. RIPORTOK ──────────────────────────────────────────────────────────
  console.log('\n── Riportok');
  const profit = require('../src/services/profit.service');
  await probal('profit — by accommodation', async () => {
    const r = await profit.getByAccommodation({ month: HONAP });
    return `${(r.data?.by_accommodation || []).length} ház`;
  });

  // MINDEN riporttípus, a szolgáltatás saját listájából — így egy újonnan hozzáadott
  // típus is automatikusan bekerül a provokációba.
  const rep = require('../src/services/report-scheduler.service');
  for (const tipus of Object.keys(rep.DATA_GENERATORS || {})) {
    await probal(`riport — ${tipus}`, async () => {
      // Ugyanaz a hívási alak, mint az `executeReport`-ban: szűrő-TÖMB be,
      // `{ records, sheetName }` ki. Ha a provokáció más alakot használna, a saját
      // hibáját mérné, nem a rendszerét.
      const { records, sheetName } = await rep.DATA_GENERATORS[tipus]([]);
      // Az XLSX-generálás külön kockázat: ott a dátumokat cellába írjuk.
      const buf = rep.generateExcelBuffer(records, sheetName);
      return `${records.length} sor, xlsx ${buf.length} bájt`;
    });
  }

  // ── 3. SZÁMLÁZÁSI VÁZLAT + HÓNAPZÁRÁS-ELLENŐRZÉS (zárás NÉLKÜL) ──────────
  console.log('\n── Számlázás');
  const engine = require('../src/services/billingEngine.service');
  await probal('számlázási vázlat (dry-run)', async () => {
    const r = await engine.calculateMonthlyBilling(HONAP, { dryRun: true });
    return `${r.billing_count} számlasor, ${r.billable_days}/${r.days_in_month} nap, `
      + `${Number(r.total_amount).toLocaleString('hu-HU')} Ft`;
  });

  const corrections = require('../src/services/billingCorrection.service');
  await probal('hónapzárás-ellenőrzés (NEM zár)', async () => {
    const b = await corrections.blockingForMonth(HONAP);
    return `${b.blocking.length} blokkoló, ${b.warnings.length} figyelmeztetés`;
  });
  await probal('lezáratlan árfolyam-tételek', async () => {
    const r = await query(
      `SELECT count(*)::int AS n FROM accommodation_expenses
        WHERE billing_month=$1 AND rate_status='missing' AND deleted_at IS NULL`, [HONAP]);
    return `${r.rows[0].n} tétel`;
  });

  // ── 4. EGYÉB DATE-NEHÉZ UTAK ─────────────────────────────────────────────
  console.log('\n── Egyéb dátum-nehéz utak');
  await probal('lejárat-figyelő', async () => {
    const em = require('../src/services/expiryMonitor.service');
    const r = await (em.runCheck?.() ?? em.check?.() ?? Promise.resolve(null));
    return r ? JSON.stringify(r).slice(0, 40) : 'lefutott';
  });
  await probal('foglaltsági pillanatkép (dry)', async () => {
    const ot = require('../src/services/occupancyTracking.service');
    const r = await query(
      `SELECT max(snapshot_date) AS d, count(*)::int AS n FROM occupancy_snapshots
        WHERE to_char(snapshot_date,'YYYY-MM')=$1`, [HONAP]);
    return `utolsó: ${r.rows[0].d} (${typeof r.rows[0].d}), ${r.rows[0].n} sor`;
  });
  await probal('megelőlegezett követelések (korosítva)', async () => {
    const pr = require('../src/services/prepaidRecovery.service');
    const r = await pr.openClaims({});
    return `${r.rows.length} követelés`;
  });
  await probal('nyitott korrekciók (korosítva)', async () => {
    const r = await corrections.open({});
    return `${r.rows.length} korrekció, vödrök: ${Object.keys(r.korosites).join('/')}`;
  });

  // ── ÖSSZESÍTÉS ───────────────────────────────────────────────────────────
  const buktak = eredmeny.filter((x) => !x.ok);
  console.log(`\n══ ÖSSZESÍTÉS ═══════════════════════════════════════════════`);
  console.log(`   ${eredmeny.length - buktak.length} rendben / ${buktak.length} hibás\n`);
  for (const b of buktak) console.log(`   ✗ ${b.nev}\n     ${b.hiba}`);
  // A dátum-típusú hibák külön: ezek a mostani váltás közvetlen következményei
  const datumHibak = buktak.filter((x) => /is not a function|getFullYear|getMonth|getDate|toISOString/i.test(x.hiba));
  console.log(`\n   ebből DÁTUM-TÍPUSÚ: ${datumHibak.length}`);
  for (const d of datumHibak) console.log(`     ⚠️  ${d.nev}: ${d.hiba}`);
  process.exit(0);
})();
