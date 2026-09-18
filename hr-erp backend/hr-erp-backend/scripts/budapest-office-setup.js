#!/usr/bin/env node
/**
 * A budapesti iroda három szállása + a megbízó kettéválasztása (2026-09-18).
 *
 * A HELYZET: a budapesti irodához tartozó 12 ember (Ungvár 5, Szigetszentmiklós 3,
 * Győr 4) MÉG NINCS a rendszerben. A három szállás tehát költségoldallal, lakók nélkül
 * kerül be, és addig 550 000 Ft/hó költséget mutat bevétel nélkül. Ez így SZÁNDÉKOS —
 * nem hiba, amit "meg kell javítani" egy kitalált lakóval.
 *
 * A bevételi díjsorok viszont MOST kerülnek be, nem a lakókkal együtt: így abban a
 * pillanatban, ahogy a 12 ember bekerül, a számlázás magától megindul. Egy hiányzó
 * díjsor pont az a hiba, ami a kiléptetetteknél 15,2%-os bevételkiesést okozott.
 *
 * Száraz futás alapból; írni `--apply` kell.
 */
const { pool } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');
const MA = '2026-09-18';
const log = (...a) => console.log(...a);

/**
 * A három szállás státusza 'available', nem 'occupied'.
 *
 * A valóságban laknak bennük, de a RENDSZERBEN nincs egyetlen hozzárendelt lakó sem.
 * Egy "Foglalt" címke nulla lakó mellett azt sugallná, hogy a rendszer tud róluk —
 * holott pont az a lényeg, hogy még nem. A 'available' azt mondja: van szabad ágy,
 * ide még be kell tölteni az embereket.
 */
const SZALLASOK = [
  {
    nev: 'Budapest - Ungvár utca 2.', berbeado: 'Lovászné Hideghéthy Rita',
    capacity: 5, rent_basis: 'flat', rent_amount: 200000, rent_per_bed_night: null,
    vat: 'afamentes', utilities: 'we_pay', status: 'available',
    jegyzet: `[${MA}] Bérbeadó magánszemély. 200 000 Ft/hó, ÁFAMENTES. Rezsi: alkalmankénti, a mi költségünk.\n`
      + 'Bevétel: 3 500 Ft/fő/éj, Man At Work Budapest. A HOZZÁ TARTOZÓ 5 FŐ MÉG NINCS FELTÖLTVE — '
      + 'amíg nincs, a ház bevétel nélküli költséget mutat. Ez ismert és szándékos.',
  },
  {
    nev: 'Győr', berbeado: 'Gede László',
    capacity: 5, rent_basis: 'flat', rent_amount: 200000, rent_per_bed_night: null,
    // A kérés nem mondta ki Győrre az ÁFA-kezelést (a másik kettőre igen). NEM találjuk
    // ki: a mező üresen marad, és a jelentés hiányként sorolja fel.
    vat: null, utilities: 'billed_separately', status: 'available',
    jegyzet: `[${MA}] Bérbeadó magánszemély. 200 000 Ft/hó. Rezsi: KÜLÖN, utólagos elszámolással.\n`
      + 'Kapacitás 4-5 fő — 5-tel van felvéve (felső érték). Bevétel: 3 500 Ft/fő/éj, Man At Work Budapest.\n'
      + 'HIÁNYZIK: ÁFA-kezelés. A HOZZÁ TARTOZÓ 4 FŐ MÉG NINCS FELTÖLTVE.',
  },
  {
    nev: 'Szigetszentmiklós - Komp utca', berbeado: 'Bihari Ildikó',
    capacity: 3, rent_basis: 'flat', rent_amount: 150000, rent_per_bed_night: null,
    vat: 'afamentes', utilities: 'we_pay', status: 'available',
    jegyzet: `[${MA}] Bérbeadó magánszemély. 150 000 Ft/hó, ÁFAMENTES. Rezsi: alkalmankénti, a mi költségünk.\n`
      + 'Bevétel: 3 500 Ft/fő/éj, Man At Work Budapest. A HOZZÁ TARTOZÓ 3 FŐ MÉG NINCS FELTÖLTVE.\n'
      + 'HIÁNYZIK: pontos cím (házszám).',
  },
];

async function egy_szallas(c, sp) {
  const a = await c.query('SELECT id, notes FROM accommodations WHERE name=$1', [sp.nev]);
  if (!a.rows.length) return `✗ NINCS ILYEN SZÁLLÁS: ${sp.nev}`;
  const b = await c.query('SELECT id FROM contractors WHERE lower(name)=lower($1)', [sp.berbeado]);
  if (!b.rows.length) return `✗ NINCS ILYEN BÉRBEADÓ: ${sp.berbeado}`;

  const regi = (a.rows[0].notes || '');
  const jegyzet = regi.includes(sp.jegyzet) ? regi : (regi ? `${regi}\n${sp.jegyzet}` : sp.jegyzet);
  if (!APPLY) return `beállítaná: ${sp.capacity} fő, ${sp.rent_basis} ${sp.rent_amount || sp.rent_per_bed_night} Ft, rezsi=${sp.utilities}, státusz=${sp.status}`;

  await c.query(
    `UPDATE accommodations
        SET current_contractor_id=$1, capacity=$2, rent_basis=$3, rent_amount=$4,
            rent_per_bed_night=$5, rent_vat_treatment=$6, utilities_billing=$7,
            status=$8, is_active=true, notes=$9, updated_at=now()
      WHERE id=$10`,
    [b.rows[0].id, sp.capacity, sp.rent_basis, sp.rent_amount, sp.rent_per_bed_night,
     sp.vat, sp.utilities, sp.status, jegyzet, a.rows[0].id]);
  return `beállítva: ${sp.capacity} fő, ${sp.rent_amount} Ft/hó, rezsi=${sp.utilities}, státusz=${sp.status}`;
}

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // ─── 1. A HÁROM SZÁLLÁS KÖLTSÉGOLDALA ───────────────────────────────────────
    log('── 1. SZÁLLÁSOK — költségoldal, lakók nélkül');
    for (const sp of SZALLASOK) log(`   ${sp.nev.padEnd(30)} → ${await egy_szallas(c, sp)}`);

    // ─── 2. MEGBÍZÓ KETTÉVÁLASZTÁSA ─────────────────────────────────────────────
    log('\n── 2. MEGBÍZÓ — Man At Work → Man At Work Győr, mellette Budapest');
    const gyor = await c.query(`SELECT id, name FROM contractors WHERE name='Man At Work'`);
    if (gyor.rows.length) {
      if (!APPLY) log("   átnevezné: 'Man At Work' → 'Man At Work Győr' (slug: man-at-work-gyor)");
      else {
        await c.query(
          `UPDATE contractors SET name='Man At Work Győr', slug='man-at-work-gyor', updated_at=now() WHERE id=$1`,
          [gyor.rows[0].id]);
        log("   átnevezve: 'Man At Work' → 'Man At Work Győr'");
      }
    } else {
      const mar = await c.query(`SELECT id FROM contractors WHERE name='Man At Work Győr'`);
      log(mar.rows.length ? '   már át van nevezve' : "   ✗ nincs 'Man At Work' nevű partner");
    }

    // A két partner SZÁNDÉKOSAN külön áll. A duplikátum-kereső nélkül ez a következő
    // adattisztításnál összevonásra jelölt párként bukkanna fel — a vendor_keep_separate
    // pont ezért készült (mig 161), és a merge-szkript még --force-szal sem nyúl hozzájuk.
    const kulcs = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
    const A = kulcs('Man At Work Győr'); const B = kulcs('Man At Work Budapest');
    const [a1, b1] = [A, B].sort();
    const vanPar = await c.query('SELECT id FROM vendor_keep_separate WHERE name_key_a=$1 AND name_key_b=$2', [a1, b1]);
    if (vanPar.rows.length) log('   a "ne vond össze" jelölés már megvan');
    else if (!APPLY) log('   rögzítené: Man At Work Győr ↔ Man At Work Budapest = KÜLÖN TARTANDÓ');
    else {
      await c.query(
        `INSERT INTO vendor_keep_separate (name_key_a, name_key_b, reason) VALUES ($1,$2,$3)`,
        [a1, b1, 'Ugyanaz a cég, KÉT TELEPHELY, külön számlázással. Szándékosan két külön partner — '
          + `a budapesti szállások bevétele a budapesti irodához tartozik. Rögzítve: ${MA}.`]);
      log('   rögzítve: KÜLÖN TARTANDÓ pár');
    }

    // ─── 3. BEVÉTELI DÍJSOROK ───────────────────────────────────────────────────
    log('\n── 3. BEVÉTELI DÍJ — 3 500 Ft/fő/éj, Man At Work Budapest');
    const bp = await c.query(`SELECT id FROM contractors WHERE name='Man At Work Budapest'`);
    if (!bp.rows.length) log('   ✗ nincs Man At Work Budapest partner');
    else for (const nev of SZALLASOK.map((x) => x.nev)) {
      const a = await c.query('SELECT id FROM accommodations WHERE name=$1', [nev]);
      if (!a.rows.length) { log(`   ✗ ${nev}: nincs ilyen szállás`); continue; }
      const van = await c.query(
        `SELECT rate_used FROM client_night_rates
          WHERE contractor_id=$1 AND accommodation_id=$2 AND valid_to IS NULL`, [bp.rows[0].id, a.rows[0].id]);
      if (van.rows.length) { log(`   ${nev.padEnd(30)} → már van: ${Number(van.rows[0].rate_used)} Ft/fő/éj`); continue; }
      if (!APPLY) { log(`   ${nev.padEnd(30)} → RÖGZÍTENE 3 500 Ft/fő/éj`); continue; }
      await c.query(
        `INSERT INTO client_night_rates
           (contractor_id, accommodation_id, billing_basis, rate_used, rate_empty,
            vat_rate, vat_exempt, currency, valid_from, notes)
         VALUES ($1,$2,'per_bed_night',3500,0,0.27,false,'HUF','2026-09-01',$3)`,
        [bp.rows[0].id, a.rows[0].id,
         `[${MA}] 3 500 Ft/fő/éj. Előre rögzítve, hogy a 12 fő feltöltésekor azonnal számoljon. `
         + 'ÁFA 27%, a többi díjsorral egyezően; a bérleti díj ÁFAMENTESSÉGE a költségoldalra vonatkozik.']);
      log(`   ${nev.padEnd(30)} → rögzítve 3 500 Ft/fő/éj`);
    }

    // ─── 4. KAPUVÁR — csak ellenőrzés ───────────────────────────────────────────
    log('\n── 4. KAPUVÁR — tartalék, ellenőrzés');
    const kap = await c.query(
      `SELECT a.capacity, a.status, a.rent_basis, a.rent_per_bed_night, c2.name AS berbeado
         FROM accommodations a LEFT JOIN contractors c2 ON c2.id=a.current_contractor_id
        WHERE a.name='Kapuvár - Szent László u. 12.'`);
    if (!kap.rows.length) log('   ✗ nincs meg');
    else {
      const k = kap.rows[0];
      const ok = k.capacity === 11 && k.status === 'reserve' && Number(k.rent_per_bed_night) === 3000
        && k.rent_basis === 'per_bed_night' && k.berbeado === 'Ré-Levu Kft.';
      log(`   ${ok ? '✓' : '✗'} ${k.berbeado}, ${k.capacity} férőhely, ${Number(k.rent_per_bed_night)} Ft/fő/éj, státusz=${k.status}`);
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
