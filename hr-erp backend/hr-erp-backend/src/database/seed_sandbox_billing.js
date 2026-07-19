/**
 * Sandbox BILLING topology augmentation — layers a realistic per-employee-megbízó
 * billing model on top of the base sandbox seed (run seed_sandbox.js first).
 *
 * Creates, all synthetic:
 *   • Szállásadók (landlords we pay rent) → linked to accommodations.current_contractor_id
 *   • Megbízók (clients we invoice)       → client_night_rates + employees.billing_client_id
 *   • One DUAL-role contractor (both szállásadó AND megbízó) — proves the multi-role tag
 *   • One SHARED accommodation split between two megbízók — proves per-megbízó billing split
 *
 * This does NOT write contractor_roles — migration 140's backfill derives roles from
 * this usage, which is exactly what we want to verify.
 *
 *   DB_NAME=hr_erp_sandbox node src/database/seed_sandbox_billing.js
 */
require('dotenv').config();
const { pool } = require('../database/connection');

const DB = process.env.DB_NAME || 'hr_erp_db';
if (!/sandbox/i.test(DB) && process.env.FORCE_SEED !== '1') {
  console.error(`\n✋ Refusing to seed: DB_NAME="${DB}" is not a sandbox.\n`);
  process.exit(1);
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function mkContractor(c, name, type) {
  const slug = `${slugify(name)}-sbx`;
  return (await c.query(
    `INSERT INTO contractors (name, slug, email, phone, address, type, is_active)
     VALUES ($1,$2,$3,'+36 30 000 0000','Sandbox cím', $4, true)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, slug, `${slugify(name)}@sandbox.local`, type]
  )).rows[0].id;
}

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // Clean prior augmentation (idempotent): drop rates + null-out partners we set,
    // then delete our synthetic billing contractors by slug suffix.
    await c.query(`DELETE FROM client_night_rates WHERE contractor_id IN (SELECT id FROM contractors WHERE slug LIKE '%-sbx')`);
    await c.query(`UPDATE employees SET billing_client_id = NULL WHERE billing_client_id IN (SELECT id FROM contractors WHERE slug LIKE '%-sbx')`);
    await c.query(`UPDATE accommodations SET current_contractor_id = (SELECT id FROM contractors WHERE slug='sandbox-kft') WHERE current_contractor_id IN (SELECT id FROM contractors WHERE slug LIKE '%-sbx')`);
    await c.query(`DELETE FROM contractor_roles WHERE contractor_id IN (SELECT id FROM contractors WHERE slug LIKE '%-sbx')`).catch(() => {});
    await c.query(`DELETE FROM contractors WHERE slug LIKE '%-sbx'`);

    // ── contractors by intended role ──
    const szallasado1 = await mkContractor(c, 'Bérbeadó Kft', 'property_owner');
    const szallasado2 = await mkContractor(c, 'Ingatlanos Bt', 'property_owner');
    const megbizo1 = await mkContractor(c, 'Autoliv Megbízó Zrt', 'service_provider');
    const megbizo2 = await mkContractor(c, 'IKEA Megbízó Kft', 'service_provider');
    const megbizo3 = await mkContractor(c, 'Mercedes Megbízó Zrt', 'service_provider'); // rate but no employees yet
    const dual = await mkContractor(c, 'Dupla Szerep Kft', 'property_owner');           // BOTH szállásadó + megbízó

    // ── accommodations: assign szállásadók (cost side) ──
    const accs = (await c.query(`SELECT id FROM accommodations ORDER BY name LIMIT 6`)).rows.map(r => r.id);
    if (accs.length < 4) throw new Error('Need ≥4 sandbox accommodations — run seed_sandbox.js first.');
    await c.query(`UPDATE accommodations SET current_contractor_id=$1 WHERE id=$2`, [szallasado1, accs[0]]);
    await c.query(`UPDATE accommodations SET current_contractor_id=$1 WHERE id=$2`, [szallasado1, accs[1]]);
    await c.query(`UPDATE accommodations SET current_contractor_id=$1 WHERE id=$2`, [szallasado2, accs[2]]);
    await c.query(`UPDATE accommodations SET current_contractor_id=$1 WHERE id=$2`, [dual, accs[3]]);      // dual owns this one

    // ── client_night_rates: megbízók (revenue side). Default (null acc) + a site rate. ──
    const addRate = (contractorId, accommodationId, rate) =>
      c.query(
        `INSERT INTO client_night_rates (contractor_id, accommodation_id, billing_basis, rate_per_night, vat_rate, currency, valid_from)
         VALUES ($1,$2,'per_person',$3,0.27,'HUF','2020-01-01')`,
        [contractorId, accommodationId, rate]
      );
    await addRate(megbizo1, null, 3500);       // Autoliv default
    await addRate(megbizo1, accs[0], 3800);    // Autoliv site-specific
    await addRate(megbizo2, null, 3200);       // IKEA default
    await addRate(megbizo3, null, 4000);       // Mercedes default (no employees → coverage should note this)
    await addRate(dual, null, 3600);           // Dupla is also a megbízó (→ dual role)

    // ── employees.billing_client_id (megbízó on employee) ──
    // accs[0]: all Autoliv. accs[1]: all IKEA. accs[3] (dual-owned): SHARED Autoliv+IKEA.
    await c.query(`UPDATE employees SET billing_client_id=$1 WHERE accommodation_id=$2`, [megbizo1, accs[0]]);
    await c.query(`UPDATE employees SET billing_client_id=$1 WHERE accommodation_id=$2`, [megbizo2, accs[1]]);
    // shared accommodation: half Autoliv, half IKEA (by row order)
    const sharedEmps = (await c.query(`SELECT id FROM employees WHERE accommodation_id=$1 ORDER BY id`, [accs[3]])).rows.map(r => r.id);
    for (let i = 0; i < sharedEmps.length; i++) {
      await c.query(`UPDATE employees SET billing_client_id=$1 WHERE id=$2`, [i % 2 === 0 ? megbizo1 : megbizo2, sharedEmps[i]]);
    }

    // ── re-run migration 140's backfill so contractor_roles reflects this topology ──
    // (idempotent; the same INSERT…SELECT…ON CONFLICT statements as the migration.)
    await c.query(`INSERT INTO contractor_roles (contractor_id, role)
      SELECT DISTINCT current_contractor_id, 'szallasado' FROM accommodations WHERE current_contractor_id IS NOT NULL
      ON CONFLICT (contractor_id, role) DO NOTHING`);
    await c.query(`INSERT INTO contractor_roles (contractor_id, role)
      SELECT DISTINCT contractor_id, 'megbizo' FROM client_night_rates WHERE contractor_id IS NOT NULL
      ON CONFLICT (contractor_id, role) DO NOTHING`);
    await c.query(`INSERT INTO contractor_roles (contractor_id, role)
      SELECT DISTINCT billing_client_id, 'megbizo' FROM employees WHERE billing_client_id IS NOT NULL
      ON CONFLICT (contractor_id, role) DO NOTHING`);

    await c.query('COMMIT');

    const q = async (s, p = []) => (await pool.query(s, p)).rows;
    console.log('\n✅ Sandbox billing topology layered (all synthetic):');
    console.log('   szállásadók:', szallasado1.slice(0, 8), szallasado2.slice(0, 8), '  dual:', dual.slice(0, 8));
    console.log('   megbízók:   ', megbizo1.slice(0, 8), megbizo2.slice(0, 8), megbizo3.slice(0, 8));
    console.log('   rates:', (await q(`SELECT COUNT(*)::int c FROM client_night_rates WHERE contractor_id IN (SELECT id FROM contractors WHERE slug LIKE '%-sbx')`))[0].c);
    console.log('   accs w/ szállásadó:', (await q(`SELECT COUNT(*)::int c FROM accommodations WHERE current_contractor_id IN (SELECT id FROM contractors WHERE slug LIKE '%-sbx')`))[0].c);
    console.log('   employees w/ megbízó:', (await q(`SELECT COUNT(*)::int c FROM employees WHERE billing_client_id IN (SELECT id FROM contractors WHERE slug LIKE '%-sbx')`))[0].c);
    console.log('   shared-acc megbízó split:', (await q(`SELECT c.name, COUNT(*)::int n FROM employees e JOIN contractors c ON c.id=e.billing_client_id WHERE e.accommodation_id=$1 GROUP BY c.name`, [accs[3]])).map(r => `${r.name}=${r.n}`).join('  '));
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Billing augmentation failed:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}
main();
