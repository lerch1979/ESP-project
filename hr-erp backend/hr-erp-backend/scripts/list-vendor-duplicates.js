#!/usr/bin/env node
/**
 * Gyanús beszállító-párok listázása — a (b) lépés előkészítése.
 *
 * Ékezet- és kisbetű-független egyezést keres, ugyanazzal a szabállyal, amit a
 * `scan-partner-name-leaks.js` használ (`utils/nameMatch`). Az írásjeleket is kidobja,
 * mert a `"RÁBA" Lakásfenntartó` és a `Rába Lakásfenntartó` ugyanaz a cég.
 *
 * CSAK LISTÁZ. Nem von össze és nem javít: azt, hogy melyik a helyes írásmód, egy ember
 * dönti el. Egy automatikus összevonás itt pont azt a hibát követné el, amit a mig 127
 * óta kerülünk — nevek alapján egyesíteni olyasmit, aminek nincs közös azonosítója.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const { nameKey } = require('../src/utils/nameMatch');

(async () => {
  const db = (await query('SELECT current_database() AS d')).rows[0].d;
  console.log(`adatbázis: ${db}\n`);

  const rows = (await query(`
    SELECT vendor_name AS nev, vendor_tax_number AS adoszam, 'számla' AS honnan, count(*) AS db
      FROM invoices WHERE deleted_at IS NULL AND vendor_name IS NOT NULL AND btrim(vendor_name) <> ''
     GROUP BY 1,2,3
    UNION ALL
    SELECT vendor_name, vendor_tax_number, 'költség', count(*)
      FROM accommodation_expenses WHERE deleted_at IS NULL AND vendor_name IS NOT NULL AND btrim(vendor_name) <> ''
     GROUP BY 1,2,3`)).rows;

  const csoport = new Map();
  for (const r of rows) {
    const k = nameKey(r.nev);
    if (!csoport.has(k)) csoport.set(k, []);
    csoport.get(k).push(r);
  }

  // Gyanús: egy kulcsra több KÜLÖNBÖZŐ leírt név jut.
  const gyanus = [...csoport.entries()]
    .map(([k, list]) => [k, list, new Set(list.map((x) => x.nev))])
    .filter(([, , nevek]) => nevek.size > 1);

  console.log(`összes beszállító-változat : ${rows.length}`);
  console.log(`különböző cégek (kulcs)    : ${csoport.size}`);
  console.log(`GYANÚS PÁROK               : ${gyanus.length}\n`);

  if (gyanus.length === 0) {
    console.log('Nincs eltérő írásmódú pár. (Ez nem jelenti, hogy nincs duplikátum —');
    console.log('csak azt, hogy név szerint nem különböznek.)');
  }
  for (const [, list] of gyanus) {
    console.log('── ugyanaz a cég, több írásmóddal:');
    for (const x of list) {
      console.log(`     "${x.nev}"`);
      console.log(`        adószám: ${x.adoszam || '—'}   forrás: ${x.honnan}   ${x.db} tétel`);
    }
    const adoszamok = [...new Set(list.map((x) => x.adoszam).filter(Boolean))];
    if (adoszamok.length > 1) {
      console.log(`     ⚠️  ELTÉRŐ ADÓSZÁM: ${adoszamok.join(' vs ')} — lehet, hogy MÉGSEM ugyanaz a cég!`);
    }
    console.log('');
  }

  // Fordított eset: azonos adószám, eltérő név — ez a legbiztosabb duplikátum-jel.
  const adoCsoport = new Map();
  for (const r of rows.filter((x) => x.adoszam)) {
    const k = String(r.adoszam).replace(/[^0-9A-Za-z]/g, '');
    if (!adoCsoport.has(k)) adoCsoport.set(k, new Set());
    adoCsoport.get(k).add(r.nev);
  }
  const adoDupl = [...adoCsoport.entries()].filter(([, s]) => s.size > 1);
  if (adoDupl.length) {
    console.log('── AZONOS ADÓSZÁM, eltérő név (ez biztosan ugyanaz a cég):');
    for (const [ado, nevek] of adoDupl) console.log(`     ${ado}: ${[...nevek].map((n) => `"${n}"`).join('  |  ')}`);
  }
  process.exit(0);
})().catch((e) => { console.error('HIBA:', e.message); process.exit(1); });
