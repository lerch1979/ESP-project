#!/usr/bin/env node
/**
 * A MiniCRM-es szerződés-export alapján kért javítások és kiegészítések (2026-09-18).
 *
 * Alapértelmezetten SZÁRAZ FUTÁS — kiírja, mit tenne, és nem ír semmit. Írni csak
 * `--apply` kapcsolóval ír.
 *
 * MIÉRT VAN ELLENŐRZŐ RÉSZ: a kérés négy tétele (Röjtökmuzsaj, Beled, Bük, Fertőrákos)
 * azt mondja ki, hogy a MOSTANI beállítás a helyes, a MiniCRM adata az elavult. Ezeket
 * tehát nem átírni kell, hanem BIZONYÍTANI, hogy tényleg az van bent — egy néma
 * "rendben" itt pont annyit érne, mint egy rossz szám.
 *
 * AMIT NEM TALÁL KI: a Kapuvár 3 000 Ft/fő/éj oldalát (bérleti díj vs. bevétel) a kérés
 * nem mondja ki. A szöveg sorrendje (bérbeadó → díj) és a Beled/Bük tételek mintája
 * alapján BÉRLETI DÍJKÉNT rögzíti, és ezt a jelentés kimondja. A ház tartalék, nulla
 * foglaltsággal, így fő/éj alapon 0 Ft-ot termel bármelyik olvasat mellett — a tévedés
 * ára nulla, amíg nem költözik be senki.
 */
const { query, pool } = require('../src/database/connection');

const APPLY = process.argv.includes('--apply');
const MA = '2026-09-18';

const log = (...a) => console.log(...a);
const ft = (n) => (n == null ? '—' : `${Number(n).toLocaleString('hu-HU')} Ft`);

/** Elvárt beállítások, amiket a kérés megerősít — ezeket ellenőrizzük, nem írjuk. */
const ELLENORZENDO = [
  { nev: 'Röjtökmuzsaj',       mezo: 'rent_amount',         vart: 4950000, cimke: 'fix 4 950 000 Ft/hó' },
  { nev: 'Beled',              mezo: 'rent_per_bed_night',  vart: 2200,    cimke: '2 200 Ft/fő/éj' },
  { nev: 'Bük_Kossuth L.u.89.', mezo: 'rent_per_bed_night', vart: 2400,    cimke: '2 400 Ft/fő/éj (Csécsenyi)' },
  { nev: 'Bük_Petőfi 16',      mezo: 'rent_per_bed_night',  vart: 2400,    cimke: '2 400 Ft/fő/éj (Csécsenyi)' },
  { nev: 'Fertőrákos',         mezo: 'rent_amount',         vart: 1727230, cimke: 'nettó, ami 2 193 583 Ft bruttó' },
];

/**
 * Megjegyzés hozzáfűzése — soha nem felülírás.
 *
 * A `notes` mezőben lehet korábbi, kézzel írt tartalom, amit egy beállítás-jegyzet nem
 * söpörhet el. Ha ugyanaz a jegyzet már bent van, nem duplázza.
 */
async function jegyzetet_fuz(c, nev, jegyzet) {
  const r = await c.query('SELECT id, notes FROM accommodations WHERE name=$1', [nev]);
  if (!r.rows.length) return { nev, allapot: 'NINCS ILYEN SZÁLLÁS' };
  const meglevo = r.rows[0].notes || '';
  if (meglevo.includes(jegyzet)) return { nev, allapot: 'a jegyzet már bent van' };
  const uj = meglevo ? `${meglevo}\n${jegyzet}` : jegyzet;
  if (APPLY) await c.query('UPDATE accommodations SET notes=$1, updated_at=now() WHERE id=$2', [uj, r.rows[0].id]);
  return { nev, allapot: 'jegyzet hozzáfűzve' };
}

async function partner(c, { nev, tipus, megjegyzes }) {
  const van = await c.query('SELECT id, type FROM contractors WHERE lower(name)=lower($1)', [nev]);
  if (van.rows.length) return { nev, id: van.rows[0].id, allapot: 'már létezik' };
  if (!APPLY) return { nev, id: null, allapot: 'LÉTREHOZNÁ' };
  const slug = nev.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const r = await c.query(
    `INSERT INTO contractors (name, slug, type, is_active, address) VALUES ($1,$2,$3,true,$4) RETURNING id`,
    [nev, slug, tipus, megjegyzes || null]);
  await c.query(
    `INSERT INTO contractor_roles (contractor_id, role) VALUES ($1,'szallasado')
       ON CONFLICT DO NOTHING`, [r.rows[0].id]);
  return { nev, id: r.rows[0].id, allapot: 'létrehozva (szállásadó)' };
}

async function szallas(c, sp) {
  const van = await c.query('SELECT id FROM accommodations WHERE lower(name)=lower($1)', [sp.name]);
  if (van.rows.length) return { nev: sp.name, id: van.rows[0].id, allapot: 'már létezik — kihagyva' };
  if (!APPLY) return { nev: sp.name, id: null, allapot: 'LÉTREHOZNÁ' };
  const r = await c.query(
    `INSERT INTO accommodations
       (name, address, type, capacity, status, is_active, current_contractor_id,
        rent_basis, rent_amount, rent_per_bed_night, rent_vat_treatment, utilities_billing, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [sp.name, sp.address, sp.type, sp.capacity, sp.status, true, sp.landlordId,
     sp.rent_basis, sp.rent_amount, sp.rent_per_bed_night, sp.vat, 'we_pay', sp.notes]);
  return { nev: sp.name, id: r.rows[0].id, allapot: 'létrehozva' };
}

/**
 * Határozatlan idejű bérleti szerződés rögzítése.
 *
 * `renewal_type='auto'` = "ha egyik fél sem jelzi a bontási igényt, automatikusan
 * meghosszabbodik" — pont az a kikötés, amiért ezek a szerződések NEM jártak le.
 * A kezdő dátumot NEM találja ki: üresen hagyja, és a jelentés hiányként sorolja fel.
 */
async function szerzodes(c, { szallasNev, berbeadoNev }) {
  const a = await c.query('SELECT id FROM accommodations WHERE name=$1', [szallasNev]);
  const p = await c.query('SELECT id FROM contractors WHERE lower(name)=lower($1)', [berbeadoNev]);
  if (!a.rows.length) return { szallasNev, allapot: 'NINCS ILYEN SZÁLLÁS' };
  if (!p.rows.length) return { szallasNev, allapot: `NINCS ILYEN PARTNER: ${berbeadoNev}` };

  const van = await c.query(
    `SELECT id, is_open_ended, end_date, renewal_type, status FROM partner_contracts
      WHERE accommodation_id=$1 AND contractor_id=$2`, [a.rows[0].id, p.rows[0].id]);

  if (van.rows.length) {
    const sz = van.rows[0];
    const kell = !sz.is_open_ended || sz.end_date || sz.renewal_type !== 'auto' || sz.status !== 'active';
    if (!kell) return { szallasNev, allapot: 'már határozatlan idejű, auto-megújulással' };
    if (APPLY) {
      await c.query(
        `UPDATE partner_contracts
            SET is_open_ended=true, end_date=NULL, renewal_type='auto', status='active', updated_at=now()
          WHERE id=$1`, [sz.id]);
    }
    return { szallasNev, allapot: `határozatlanná téve (volt: nyitott=${sz.is_open_ended}, vég=${sz.end_date || '-'}, megújulás=${sz.renewal_type}, állapot=${sz.status})` };
  }

  if (!APPLY) return { szallasNev, allapot: 'ÚJ SZERZŐDÉST RÖGZÍTENE (határozatlan)' };
  await c.query(
    `INSERT INTO partner_contracts
       (contractor_id, accommodation_id, contract_role, title, status, is_open_ended, renewal_type, notes)
     VALUES ($1,$2,'szallasado',$3,'active',true,'auto',$4)`,
    [p.rows[0].id, a.rows[0].id, `Bérleti szerződés — ${szallasNev}`,
     `Határozatlan idejű. Rögzítve a MiniCRM-export átnézése után (${MA}): a szerződés nem járt le, `
     + 'mert bontási igény hiányában automatikusan határozatlanná vált. A kezdő dátum és a felmondási '
     + 'idő a papír alapú szerződésből pótolandó.']);
  return { szallasNev, allapot: 'új határozatlan idejű szerződés rögzítve' };
}

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);

  // ─── 1. ELLENŐRZÉS — a kérés szerint ezek a MOSTANI értékek a helyesek ───────────
  log('── 1. MEGERŐSÍTETT ÁRAK — a bent lévő értéket ellenőrzöm, nem írom felül');
  const elteresek = [];
  for (const e of ELLENORZENDO) {
    const r = await query(
      `SELECT name, rent_basis, rent_amount, rent_per_bed_night, rent_vat_treatment
         FROM accommodations WHERE name=$1`, [e.nev]);
    if (!r.rows.length) { log(`   ✗ ${e.nev}: NINCS ILYEN SZÁLLÁS`); elteresek.push(e.nev); continue; }
    const van = Number(r.rows[0][e.mezo]);
    const ok = Math.abs(van - e.vart) < 1;
    log(`   ${ok ? '✓' : '✗'} ${e.nev.padEnd(22)} ${e.cimke.padEnd(34)} bent: ${ft(van)}`);
    if (!ok) elteresek.push(`${e.nev}: bent ${ft(van)}, várt ${ft(e.vart)}`);
  }
  // Fertőrákos: a megadott bruttó és a tárolt nettó egyezésének kimondása
  const fr = await query(`SELECT rent_amount FROM accommodations WHERE name='Fertőrákos'`);
  if (fr.rows.length) {
    const brutto = Math.round(Number(fr.rows[0].rent_amount) * 1.27);
    log(`   → Fertőrákos: ${ft(fr.rows[0].rent_amount)} nettó × 1,27 = ${ft(brutto)} bruttó `
      + `(a megadott 2 193 583 Ft-tal ${Math.abs(brutto - 2193583) <= 2 ? 'EGYEZIK' : 'NEM EGYEZIK'})`);
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // ─── 2. JEGYZETEK ────────────────────────────────────────────────────────────
    log('\n── 2. JEGYZETEK');
    for (const j of [
      { nev: 'Röjtökmuzsaj', jegyzet: `[${MA}] Jelenleg fix 4 950 000 Ft/hó — hivatalosan is ez a konstrukció. TERVEZETT ÁTÁLLÁS fő/éj alapra; az átálláskor a rent_basis 'per_bed_night'-ra módosítandó, díjjal együtt.` },
      { nev: 'Fertőrákos',   jegyzet: `[${MA}] A bérleti díj (1 727 230 Ft nettó / 2 193 583 Ft bruttó) azért tér el a szerződéstől, mert egy előre befektetett összeget "lakunk le". Ez a helyes érték, a szerződésben szereplő nem.` },
    ]) log(`   ${(await jegyzetet_fuz(c, j.nev, j.jegyzet)).allapot} — ${j.nev}`);

    // ─── 3. SZERZŐDÉSEK: HATÁROZATLAN IDEJŰ ──────────────────────────────────────
    log('\n── 3. SZERZŐDÉSEK — határozatlan idejű, nem lejárt');
    for (const sz of [
      { szallasNev: 'Sarród I.',    berbeadoNev: 'Barcza Gyula' },
      { szallasNev: 'Beled',        berbeadoNev: 'SÖZEN DIÁNA TÍMEA ÉS BARCZÁNÉ LOCSMÁNDI BEÁTA  TULAJDONOSTÁRSAK KÖZÖSSÉGE' },
      { szallasNev: 'Fertőszéplak', berbeadoNev: 'ZÖLD-LAK BT.' },
    ]) { const r = await szerzodes(c, sz); log(`   ${r.szallasNev.padEnd(14)} → ${r.allapot}`); }

    // ─── 4. ÚJ PARTNEREK ─────────────────────────────────────────────────────────
    log('\n── 4. ÚJ BÉRBEADÓK');
    const partnerek = {};
    for (const p of [
      { nev: 'Ré-Levu Kft.',                tipus: 'service_provider', megjegyzes: 'Kapuvár, Szent László u. 12.' },
      { nev: 'Lovászné Hideghéthy Rita',    tipus: 'property_owner',   megjegyzes: 'Budapest, Ungvár utca 2. 4. em.' },
      { nev: 'Bihari Ildikó',               tipus: 'property_owner',   megjegyzes: 'Szigetszentmiklós, Komp utca' },
    ]) { const r = await partner(c, p); partnerek[p.nev] = r.id; log(`   ${p.nev.padEnd(30)} → ${r.allapot}`); }

    // ─── 5. ÚJ SZÁLLÁSOK ─────────────────────────────────────────────────────────
    log('\n── 5. ÚJ SZÁLLÁSOK');
    const ujak = [
      {
        name: 'Kapuvár - Szent László u. 12.', address: '9330 Kapuvár, Szent László u. 12.',
        type: 'dormitory', capacity: 11,
        // TARTALÉK: a szerződés él, de nincs kihelyezett emberünk. NEM is_active=false —
        // ebben a rendszerben az a törlés jele (a DELETE végpont is azt állítja), és a
        // szállás eltűnne a listából, ahol épp aktiválni kellene majd.
        status: 'reserve', landlordId: partnerek['Ré-Levu Kft.'],
        rent_basis: 'per_bed_night', rent_amount: null, rent_per_bed_night: 3000, vat: null,
        notes: `[${MA}] TARTALÉK — a szerződés él (Ré-Levu Kft.), jelenleg nincs itt kihelyezett munkavállalónk.\n`
             + 'A 3 000 Ft/fő/éj BÉRLETI DÍJKÉNT van rögzítve (amit mi fizetünk). Ha ez valójában a bevételi díj, javítandó.\n'
             + 'HIÁNYZIK: ÁFA-kezelés, rezsi-megállapodás, bevételi díj, megbízó.',
      },
      {
        name: 'Budapest - Ungvár utca 2.', address: '1025 Budapest, Ungvár utca 2. 4. em.',
        type: 'apartment', capacity: 5, status: 'occupied',
        landlordId: partnerek['Lovászné Hideghéthy Rita'],
        rent_basis: 'flat', rent_amount: 200000, rent_per_bed_night: null, vat: 'afamentes',
        notes: `[${MA}] Bérbeadó magánszemély, 200 000 Ft/hó, ÁFAMENTES. Rezsi: alkalmankénti, a mi költségünk.\n`
             + 'Bevételi díj: 3 500 Ft/fő/éj — a díjsor a megbízó tisztázása után rögzítendő.\n'
             + 'HIÁNYZIK: megbízó (Man At Work Budapest vagy a győri iroda).',
      },
      {
        name: 'Szigetszentmiklós - Komp utca', address: 'Szigetszentmiklós, Komp utca',
        type: 'apartment',
        // A kapacitás NOT NULL, a létszámot pedig nem tudjuk. A 0 itt azt jelenti:
        // "nem ismert" — és egyben a legártalmatlanabb, mert a fő/éj elszámolás
        // kapacitás-alapja is 0 marad, tehát nem termel kitalált bevételt.
        capacity: 0, status: 'reserve', landlordId: partnerek['Bihari Ildikó'],
        rent_basis: 'flat', rent_amount: 150000, rent_per_bed_night: null, vat: 'afamentes',
        notes: `[${MA}] Bérbeadó magánszemély, 150 000 Ft/hó, ÁFAMENTES. Rezsi: alkalmankénti, a mi költségünk.\n`
             + 'HIÁNYZIK: aktív-e, hány fő lakik ott, bevételi díj, megbízó, pontos cím (házszám).\n'
             + 'A kapacitás 0 = NEM ISMERT, nem az, hogy nincs férőhely.',
      },
    ];
    for (const u of ujak) { const r = await szallas(c, u); log(`   ${r.nev.padEnd(34)} → ${r.allapot}`); }

    if (APPLY) { await c.query('COMMIT'); log('\n✅ COMMIT'); }
    else { await c.query('ROLLBACK'); log('\n↩️  ROLLBACK (száraz futás)'); }
  } catch (e) {
    await c.query('ROLLBACK');
    log(`\n❌ HIBA, minden visszagördítve: ${e.message}`);
    process.exitCode = 1;
  } finally { c.release(); }

  if (elteresek.length) log(`\n⚠️  ELTÉRÉS a megerősített áraknál:\n   ${elteresek.join('\n   ')}`);
  process.exit(process.exitCode || 0);
})();
