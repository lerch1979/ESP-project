#!/usr/bin/env node
/**
 * Két tulajdonosi pontosítás átvezetése (2026-09-18).
 *
 * 1. FERTŐSZÉPLAK: a szerződő fél a ZÖLD-LAK BT., Hetényi Judit a tulajdonosa és a mi
 *    kapcsolattartónk. A szállásadó partner tehát MARAD Zöld-Lak Bt. — Hetényi Judit
 *    KAPCSOLATTARTÓKÉNT kerül be, nem külön magánszemély partnerként. (Ellenőrizve:
 *    magánszemély partnerként nem is létezik, tehát nincs mit visszabontani.)
 *
 * 2. BÜK_IFJÚSÁG 54. = a Bük_Barki Apartman MÁSIK NEVE, nem külön ház. A MaW-számlán
 *    ezen a néven szerepel. Az elnevezés a szállás jegyzetébe kerül, hogy a következő
 *    számlaegyeztetésnél ne ismeretlen házként bukkanjon fel.
 *
 *    ⚠️ Ez NEM old meg egy kérdést: ha a MaW-számla EGYSZERRE tartalmaz "Bük_Barki
 *    Apartman" és "Bük_Ifjúság 54." sort ugyanarra a hónapra, akkor ugyanaz a ház
 *    kétszer van kiszámlázva. Ezt csak a papír számlából lehet eldönteni.
 *
 * Száraz futás alapból; írni `--apply` kell.
 */
const { pool } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');
const MA = '2026-09-18';
const ALIAS = 'Bük_Ifjúság 54.';
const log = (...a) => console.log(...a);

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // ─── 1. FERTŐSZÉPLAK ────────────────────────────────────────────────────────
    log('── 1. FERTŐSZÉPLAK — Zöld-Lak Bt. a partner, Hetényi Judit a kapcsolattartó');

    const rossz = await c.query(
      `SELECT c.id, c.name FROM contractors c WHERE c.name ILIKE '%hetényi%'`);
    log(rossz.rows.length
      ? `   ⚠️ Hetényi Judit külön partnerként létezik (${rossz.rows[0].id}) — ELLENŐRIZENDŐ`
      : '   ✓ Hetényi Judit NEM szerepel külön magánszemély partnerként — nincs mit javítani');

    const zl = await c.query(`SELECT id FROM contractors WHERE name='ZÖLD-LAK BT.'`);
    if (!zl.rows.length) log('   ✗ nincs ZÖLD-LAK BT. partner');
    else {
      const fsz = await c.query(
        `SELECT current_contractor_id FROM accommodations WHERE name='Fertőszéplak'`);
      log(fsz.rows[0]?.current_contractor_id === zl.rows[0].id
        ? '   ✓ Fertőszéplak szállásadója már ZÖLD-LAK BT.'
        : '   ⚠️ Fertőszéplak szállásadója NEM a Zöld-Lak Bt. — kézi döntés kell');

      // A partner_contacts CHECK pontosan EGY fél-hivatkozást enged (lead / contractor /
      // accommodation). A kapcsolattartó a PARTNERHEZ tartozik, nem a házhoz: Hetényi
      // Judit a Zöld-Lak tulajdonosa, nem a fertőszéplaki ház gondnoka.
      const van = await c.query(
        `SELECT id FROM partner_contacts WHERE contractor_id=$1 AND name ILIKE '%hetényi%'`,
        [zl.rows[0].id]);
      if (van.rows.length) log('   a kapcsolattartó már rögzítve van');
      else if (!APPLY) log('   FELVENNÉ: Hetényi Judit — tulajdonos / kapcsolattartó, elsődleges');
      else {
        await c.query(
          `INSERT INTO partner_contacts (contractor_id, name, role_title, is_primary, is_active, notes)
           VALUES ($1,'Hetényi Judit','Tulajdonos / kapcsolattartó',true,true,$2)`,
          [zl.rows[0].id,
           `[${MA}] A Zöld-Lak Bt. tulajdonosa és a mi kapcsolattartónk. A SZERZŐDŐ FÉL a Zöld-Lak Bt., `
           + 'nem ő magánszemélyként — ezért nem külön szállásadó partnerként szerepel.']);
        log('   ✓ Hetényi Judit felvéve kapcsolattartóként a Zöld-Lak Bt.-hez');
      }
    }

    // ─── 2. BÜK_IFJÚSÁG 54. = BÜK_BARKI APARTMAN ────────────────────────────────
    log(`\n── 2. "${ALIAS}" = Bük_Barki Apartman`);
    const b = await c.query(`SELECT id, notes FROM accommodations WHERE name='Bük_Barki Apartman'`);
    if (!b.rows.length) log('   ✗ nincs Bük_Barki Apartman');
    else {
      const jegyzet = `[${MA}] MÁSIK NEVE: "${ALIAS}" — a Man At Work számláin ezen a néven szerepel. `
        + 'NEM külön ház. Bérbeadó: Barki Csabáné. Ha egy számlán mindkét elnevezés külön soron '
        + 'szerepel ugyanarra a hónapra, az ugyanannak a háznak a kétszeri kiszámlázása.';
      const regi = b.rows[0].notes || '';
      if (regi.includes(ALIAS)) log('   a másik név már bent van a jegyzetben');
      else if (!APPLY) log(`   JEGYZETBE ÍRNÁ a "${ALIAS}" elnevezést`);
      else {
        await c.query('UPDATE accommodations SET notes=$1, updated_at=now() WHERE id=$2',
          [regi ? `${regi}\n${jegyzet}` : jegyzet, b.rows[0].id]);
        log(`   ✓ "${ALIAS}" rögzítve a szállás jegyzetében`);
      }
    }

    // ─── 3. VAN-E BÁRMI EZEN A NÉVEN? ───────────────────────────────────────────
    // Nem elég a szállás-táblát nézni: ha bárhol szerepel ez a név, azt át kell sorolni.
    log(`\n── 3. Adat a(z) "${ALIAS}" néven — mit kell átsorolni?`);
    const talalatok = [];
    const oszlopok = await c.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND data_type IN ('text','character varying','jsonb')`);
    for (const o of oszlopok.rows) {
      try {
        const r = await c.query(
          `SELECT count(*)::int AS n FROM ${JSON.stringify(o.table_name).replace(/"/g, '"')} `
          + `WHERE ${JSON.stringify(o.column_name).replace(/"/g, '"')}::text ILIKE '%ifjúság 54%'`);
        if (r.rows[0].n > 0) talalatok.push(`${o.table_name}.${o.column_name} → ${r.rows[0].n} sor`);
      } catch { /* nem szkennelhető oszlop — átlépjük */ }
    }
    log(talalatok.length
      ? `   ⚠️ ÁTSOROLANDÓ:\n     ${talalatok.join('\n     ')}`
      : '   ✓ a szállás jegyzetén kívül SEHOL nem szerepel — nincs mit átsorolni');

    if (APPLY) { await c.query('COMMIT'); log('\n✅ COMMIT'); }
    else { await c.query('ROLLBACK'); log('\n↩️  ROLLBACK (száraz futás)'); }
  } catch (e) {
    await c.query('ROLLBACK');
    log(`\n❌ HIBA, minden visszagördítve: ${e.message}`);
    process.exitCode = 1;
  } finally { c.release(); }
  process.exit(process.exitCode || 0);
})();
