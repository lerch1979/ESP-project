#!/usr/bin/env node
/**
 * A MiniCRM-es kör folytatása a két megválaszolt kérdés alapján (2026-09-18).
 *
 *   • Budapest, Ungvár utca → ÚJ MEGBÍZÓ: "Man At Work Budapest", saját díjsorral
 *     (3 500 Ft/fő/éj). Külön entitás, tehát külön elszámoló lap és külön profit-sor.
 *   • Szigetszentmiklós → AKTÍV; a létszám és a bevételi díj még jön.
 *
 * Száraz futás alapból; írni `--apply` kell.
 *
 * AMIT NEM TALÁL KI: a budapesti bevétel ÁFA-kulcsát a kérés nem mondta ki. A bérleti
 * díj ÁFAMENTES (magánszemély bérbeadó), de az a MI költségünk — a megbízó felé kimenő
 * számla ettől független. A többi díjsor mind 27%-os, ezért ez is 27%-kal kerül be, és
 * a jelentés ezt kimondja.
 */
const { query, pool } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');
const MA = '2026-09-18';
const log = (...a) => console.log(...a);

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // ─── 1. ÚJ MEGBÍZÓ ──────────────────────────────────────────────────────────
    log('── 1. ÚJ MEGBÍZÓ: Man At Work Budapest');
    let mawbId;
    const van = await c.query(`SELECT id FROM contractors WHERE lower(name)=lower('Man At Work Budapest')`);
    if (van.rows.length) { mawbId = van.rows[0].id; log('   már létezik'); }
    else if (!APPLY) { log('   LÉTREHOZNÁ (megbízó szerepkörrel)'); }
    else {
      const r = await c.query(
        `INSERT INTO contractors (name, slug, type, is_active, address)
         VALUES ('Man At Work Budapest','man-at-work-budapest','service_provider',true,'Budapest')
         RETURNING id`);
      mawbId = r.rows[0].id;
      await c.query(`INSERT INTO contractor_roles (contractor_id, role) VALUES ($1,'megbizo') ON CONFLICT DO NOTHING`, [mawbId]);
      log('   létrehozva (megbízó)');
    }

    // ─── 2. BEVÉTELI DÍJ: Budapest, Ungvár utca — 3 500 Ft/fő/éj ────────────────
    log('\n── 2. BEVÉTELI DÍJ — Budapest, Ungvár utca 2.');
    const bp = await c.query(`SELECT id FROM accommodations WHERE name='Budapest - Ungvár utca 2.'`);
    if (!bp.rows.length) log('   ✗ nincs meg a szállás');
    else if (!mawbId) log('   (a megbízó létrehozása után rögzülne — száraz futásban nincs azonosító)');
    else {
      const vanD = await c.query(
        `SELECT id, rate_used FROM client_night_rates
          WHERE contractor_id=$1 AND accommodation_id=$2 AND valid_to IS NULL`, [mawbId, bp.rows[0].id]);
      if (vanD.rows.length) log(`   már van élő díjsor: ${vanD.rows[0].rate_used} Ft/fő/éj`);
      else if (!APPLY) log('   RÖGZÍTENE: 3 500 Ft/fő/éj, per_bed_night, 27% ÁFA, 2026-09-01-től');
      else {
        // workplace_id NÉLKÜL: ez házszintű díj, nem munkahelyenkénti. A budapesti
        // szállásnak nincs Autoliv/IKEA bontása, és a feloldó a specifikusabb sort
        // választja — egy házra szóló sor pont elég.
        await c.query(
          `INSERT INTO client_night_rates
             (contractor_id, accommodation_id, billing_basis, rate_used, rate_empty,
              vat_rate, vat_exempt, currency, valid_from, notes)
           VALUES ($1,$2,'per_bed_night',3500,0,0.27,false,'HUF','2026-09-01',$3)`,
          [mawbId, bp.rows[0].id,
           `[${MA}] Budapest, Ungvár utca — 3 500 Ft/fő/éj. Az ÁFA-kulcs 27%, a többi díjsorral egyezően; `
           + 'a bérleti díj ÁFAMENTESSÉGE a költségoldalra vonatkozik, nem erre.']);
        log('   rögzítve: 3 500 Ft/fő/éj, 2026-09-01-től');
      }
    }

    // ─── 3. SZIGETSZENTMIKLÓS — aktív ───────────────────────────────────────────
    log('\n── 3. SZIGETSZENTMIKLÓS — aktívra állítás');
    const sz = await c.query(`SELECT id, status, notes FROM accommodations WHERE name='Szigetszentmiklós - Komp utca'`);
    if (!sz.rows.length) log('   ✗ nincs meg a szállás');
    else {
      const ujJegyzet = (sz.rows[0].notes || '').replace(
        'HIÁNYZIK: aktív-e, hány fő lakik ott, bevételi díj, megbízó, pontos cím (házszám).',
        `[${MA}] AKTÍV (megerősítve). HIÁNYZIK MÉG: hány fő lakik ott, bevételi díj (Ft/fő/éj), megbízó, pontos cím (házszám).`);
      if (!APPLY) log("   'occupied'-re állítaná, és a jegyzetben rögzítené, hogy aktív");
      else {
        await c.query(
          `UPDATE accommodations SET status='occupied', notes=$1, updated_at=now() WHERE id=$2`,
          [ujJegyzet, sz.rows[0].id]);
        log("   status: reserve → occupied, jegyzet frissítve");
      }
    }

    if (APPLY) { await c.query('COMMIT'); log('\n✅ COMMIT'); }
    else { await c.query('ROLLBACK'); log('\n↩️  ROLLBACK (száraz futás)'); }
  } catch (e) {
    await c.query('ROLLBACK');
    log(`\n❌ HIBA, minden visszagördítve: ${e.message}`);
    process.exitCode = 1;
  } finally { c.release(); }
  process.exit(process.exitCode || 0);
})();
