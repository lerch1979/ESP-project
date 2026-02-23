#!/usr/bin/env node

/**
 * HR-ERP 300 Fake Employee Seed Script
 *
 * Generates 300 realistic Hungarian employees for testing.
 * ADDITIVE: does NOT delete existing data — only inserts new employees.
 *
 * Prerequisites:
 *   - Database must be seeded first (scripts/seed-database.js)
 *   - Contractor "ABC Kereskedelmi Kft." must exist
 *   - Employee status types must exist
 *   - Accommodations and rooms must exist
 *
 * Run: node src/database/seed_300_employees.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');
const { faker } = require('@faker-js/faker');

// ─── Database Connection ────────────────────────────────────────────────────

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ─── Hungarian Data ─────────────────────────────────────────────────────────

const MAGYAR_FERFI_NEVEK = [
  'László', 'István', 'József', 'János', 'Zoltán', 'Sándor', 'Gábor',
  'Ferenc', 'Attila', 'Péter', 'Tamás', 'Zsolt', 'Tibor', 'András',
  'Csaba', 'Imre', 'Lajos', 'György', 'Balázs', 'Róbert', 'Dániel',
  'Miklós', 'Béla', 'Ádám', 'Krisztián', 'Norbert', 'Richárd', 'Márk',
  'Gergő', 'Levente', 'Bence', 'Máté', 'Dávid', 'Szabolcs', 'Gyula',
  'Mihály', 'Roland', 'Pál', 'Dezső', 'Károly', 'Ernő', 'Viktor',
  'Kornél', 'Olivér', 'Dominik', 'Patrik', 'Kristóf', 'Ákos', 'Barnabás',
  'Botond', 'Hunor', 'Milán', 'Noel', 'Bendegúz', 'Zalán',
];

const MAGYAR_NOI_NEVEK = [
  'Mária', 'Erzsébet', 'Katalin', 'Éva', 'Ilona', 'Anna', 'Zsuzsanna',
  'Margit', 'Judit', 'Ágnes', 'Andrea', 'Erika', 'Tímea', 'Mónika',
  'Gabriella', 'Krisztina', 'Nikolett', 'Anikó', 'Renáta', 'Szilvia',
  'Viktória', 'Eszter', 'Dóra', 'Petra', 'Vivien', 'Lilla', 'Réka',
  'Nóra', 'Bernadett', 'Edina', 'Hajnalka', 'Beáta', 'Csilla', 'Diána',
  'Emese', 'Fruzsina', 'Julianna', 'Klára', 'Noémi', 'Orsolya', 'Piroska',
  'Sára', 'Veronika', 'Barbara', 'Bianka', 'Flóra', 'Hanna', 'Luca',
  'Zsófia', 'Boglárka', 'Dorina', 'Fanni', 'Lili', 'Zoé',
];

const MAGYAR_VEZETEKNEVEK = [
  'Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga', 'Kiss',
  'Molnár', 'Németh', 'Farkas', 'Balogh', 'Papp', 'Takács', 'Juhász',
  'Lakatos', 'Mészáros', 'Oláh', 'Simon', 'Rácz', 'Fekete', 'Szilágyi',
  'Török', 'Fehér', 'Balázs', 'Gál', 'Kis', 'Szűcs', 'Kocsis',
  'Orsós', 'Pintér', 'Fodor', 'Szalai', 'Sipos', 'Magyar', 'Lukács',
  'Gulyás', 'Biró', 'Király', 'Katona', 'László', 'Jakab', 'Bogdán',
  'Balog', 'Sándor', 'Boros', 'Fazekas', 'Kelemen', 'Antal', 'Somogyi',
  'Fülöp', 'Orosz', 'Vincze', 'Hegedűs', 'Budai', 'Deák', 'Pál',
  'Barta', 'Illés', 'Veres', 'Kozma', 'Máté', 'Nemes', 'Virág',
];

const MAGYAR_VAROSOK = [
  { city: 'Budapest', county: 'Budapest', zips: ['1011', '1021', '1031', '1041', '1051', '1061', '1071', '1081', '1091', '1101', '1111', '1121', '1131', '1138', '1139', '1141', '1151', '1161', '1171', '1181', '1191', '1201', '1211', '1221'] },
  { city: 'Debrecen', county: 'Hajdú-Bihar', zips: ['4024', '4025', '4026', '4027', '4028', '4029', '4030', '4031', '4032'] },
  { city: 'Szeged', county: 'Csongrád-Csanád', zips: ['6720', '6721', '6722', '6723', '6724', '6725', '6726'] },
  { city: 'Miskolc', county: 'Borsod-Abaúj-Zemplén', zips: ['3525', '3526', '3527', '3528', '3529', '3530'] },
  { city: 'Pécs', county: 'Baranya', zips: ['7621', '7622', '7623', '7624', '7625', '7626', '7627', '7628', '7629', '7630'] },
  { city: 'Győr', county: 'Győr-Moson-Sopron', zips: ['9021', '9022', '9023', '9024', '9025', '9026', '9027', '9028'] },
  { city: 'Nyíregyháza', county: 'Szabolcs-Szatmár-Bereg', zips: ['4400', '4401', '4431', '4432', '4433'] },
  { city: 'Kecskemét', county: 'Bács-Kiskun', zips: ['6000', '6001', '6031'] },
  { city: 'Székesfehérvár', county: 'Fejér', zips: ['8000', '8001', '8002', '8003', '8004', '8005'] },
  { city: 'Szombathely', county: 'Vas', zips: ['9700', '9701'] },
  { city: 'Szolnok', county: 'Jász-Nagykun-Szolnok', zips: ['5000', '5001', '5002', '5008'] },
  { city: 'Eger', county: 'Heves', zips: ['3300', '3301', '3304'] },
  { city: 'Tatabánya', county: 'Komárom-Esztergom', zips: ['2800', '2801', '2803'] },
  { city: 'Veszprém', county: 'Veszprém', zips: ['8200', '8201'] },
  { city: 'Kaposvár', county: 'Somogy', zips: ['7400', '7401'] },
  { city: 'Sopron', county: 'Győr-Moson-Sopron', zips: ['9400', '9401'] },
  { city: 'Békéscsaba', county: 'Békés', zips: ['5600', '5601'] },
  { city: 'Zalaegerszeg', county: 'Zala', zips: ['8900', '8901'] },
  { city: 'Esztergom', county: 'Komárom-Esztergom', zips: ['2500', '2501'] },
  { city: 'Dunaújváros', county: 'Fejér', zips: ['2400', '2401'] },
  { city: 'Hódmezővásárhely', county: 'Csongrád-Csanád', zips: ['6800', '6801'] },
  { city: 'Érd', county: 'Pest', zips: ['2030'] },
  { city: 'Cegléd', county: 'Pest', zips: ['2700'] },
  { city: 'Vác', county: 'Pest', zips: ['2600'] },
  { city: 'Gödöllő', county: 'Pest', zips: ['2100'] },
];

const UTCANEVEK = [
  'Kossuth Lajos utca', 'Petőfi Sándor utca', 'Rákóczi út', 'Ady Endre utca',
  'Arany János utca', 'Széchenyi István tér', 'Deák Ferenc utca', 'Hunyadi utca',
  'Bartók Béla út', 'Bajcsy-Zsilinszky utca', 'Dózsa György út', 'Bem József utca',
  'Jókai Mór utca', 'Zrínyi utca', 'Vörösmarty utca', 'Bocskai utca',
  'Bethlen Gábor utca', 'Munkácsy Mihály utca', 'Liszt Ferenc tér', 'Kodály körönd',
  'Fő utca', 'Templom utca', 'Táncsics Mihály utca', 'Szent István tér',
  'Mátyás király utca', 'Kazinczy utca', 'Damjanich utca', 'Batthyány utca',
  'Kölcsey utca', 'Tompa Mihály utca', 'Mikszáth Kálmán tér', 'Móricz Zsigmond körtér',
];

const POSITIONS = [
  // Építőipar / Construction
  { title: 'Kőműves', dept: 'Építőipar' },
  { title: 'Ács', dept: 'Építőipar' },
  { title: 'Villanyszerelő', dept: 'Építőipar' },
  { title: 'Vízvezeték-szerelő', dept: 'Építőipar' },
  { title: 'Festő', dept: 'Építőipar' },
  { title: 'Burkoló', dept: 'Építőipar' },
  { title: 'Hegesztő', dept: 'Építőipar' },
  { title: 'Segédmunkás', dept: 'Építőipar' },
  { title: 'Állványozó', dept: 'Építőipar' },
  { title: 'Gépkezelő', dept: 'Építőipar' },
  { title: 'Daruzó', dept: 'Építőipar' },
  { title: 'Zsaluzó', dept: 'Építőipar' },
  { title: 'Vasbetonszerelő', dept: 'Építőipar' },
  { title: 'Tetőfedő', dept: 'Építőipar' },
  { title: 'Szigetelő', dept: 'Építőipar' },
  // Logisztika / Logistics
  { title: 'Raktáros', dept: 'Logisztika' },
  { title: 'Targoncavezető', dept: 'Logisztika' },
  { title: 'Szállítómunkás', dept: 'Logisztika' },
  { title: 'Rakodómunkás', dept: 'Logisztika' },
  { title: 'Sofőr', dept: 'Logisztika' },
  // Karbantartás / Maintenance
  { title: 'Karbantartó', dept: 'Karbantartás' },
  { title: 'Takarító', dept: 'Karbantartás' },
  { title: 'Gondnok', dept: 'Karbantartás' },
  { title: 'Épületgépész', dept: 'Karbantartás' },
  // Admin / Office
  { title: 'Adminisztrátor', dept: 'Adminisztráció' },
  { title: 'Irodai asszisztens', dept: 'Adminisztráció' },
  { title: 'HR asszisztens', dept: 'Adminisztráció' },
  { title: 'Könyvelő', dept: 'Adminisztráció' },
  // Műszaki / Technical
  { title: 'Műszaki ellenőr', dept: 'Műszaki' },
  { title: 'Művezető', dept: 'Műszaki' },
  { title: 'Építésvezető', dept: 'Műszaki' },
  { title: 'Projektkoordinátor', dept: 'Műszaki' },
  { title: 'Minőségellenőr', dept: 'Műszaki' },
  // Biztonság / Safety
  { title: 'Biztonsági őr', dept: 'Biztonság' },
  { title: 'Munkavédelmi felelős', dept: 'Biztonság' },
  { title: 'Tűzvédelmi felelős', dept: 'Biztonság' },
];

const WORKPLACES = [
  'Budapest - Váci út irodaház',
  'Budapest - Angyalföld építkezés',
  'Budapest - Újpest raktártelep',
  'Budapest - Csepel ipari park',
  'Budapest - Budaörs logisztikai központ',
  'Budapest - Dél-Buda fejlesztés',
  'Debrecen - Ipari Park',
  'Székesfehérvár - Gyáripari terület',
  'Győr - Északi Ipari Park',
  'Kecskemét - Gyárvárosi építkezés',
  'Miskolc - Diósgyőri felújítás',
  'Szeged - Belváros rekonstrukció',
];

// ─── Helper Functions ───────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(options) {
  const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
  let r = Math.random() * totalWeight;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.value;
  }
  return options[options.length - 1].value;
}

function randomDate(startYear, endYear) {
  const start = new Date(startYear, 0, 1);
  const end = new Date(endYear, 11, 31);
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().slice(0, 10);
}

function randomBirthDate() {
  // Ages 20-65 → birth years 1961-2006
  return randomDate(1961, 2006);
}

function generateHungarianPhone() {
  const prefixes = ['20', '30', '31', '50', '70'];
  const prefix = pick(prefixes);
  const num1 = String(Math.floor(Math.random() * 900) + 100);
  const num2 = String(Math.floor(Math.random() * 9000) + 1000);
  return `+36 ${prefix} ${num1} ${num2}`;
}

function generateTaxId() {
  // Hungarian tax ID format: 10 digits
  const digits = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10));
  return digits.join('');
}

function generateSSN() {
  // Hungarian TAJ number: 9 digits, XXX-XXX-XXX
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  return `${d.slice(0, 3).join('')}-${d.slice(3, 6).join('')}-${d.slice(6, 9).join('')}`;
}

function generateBankAccount() {
  // Hungarian IBAN-like: 8-8-8 format
  const seg = () => String(Math.floor(Math.random() * 90000000) + 10000000);
  return `${seg()}-${seg()}-${seg()}`;
}

function removeDiacritics(str) {
  const map = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o',
    'ú': 'u', 'ü': 'u', 'ű': 'u',
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ö': 'O', 'Ő': 'O',
    'Ú': 'U', 'Ü': 'U', 'Ű': 'U',
  };
  return str.replace(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, c => map[c] || c);
}

function generateEmail(firstName, lastName, index) {
  const fn = removeDiacritics(firstName).toLowerCase();
  const ln = removeDiacritics(lastName).toLowerCase();
  // Add index to ensure uniqueness
  return `${ln}.${fn}${index}@abc-kft.hu`;
}

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ─── Main Seed Function ─────────────────────────────────────────────────────

async function seed300Employees() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    log('300 munkavállaló seed indítása...');

    // ── 1. Look up existing contractor ──────────────────────────────────
    const contractorRes = await client.query(
      `SELECT id FROM contractors WHERE slug = 'abc-kft' LIMIT 1`
    );
    if (contractorRes.rows.length === 0) {
      throw new Error('Contractor "ABC Kereskedelmi Kft." not found! Run scripts/seed-database.js first.');
    }
    const contractorId = contractorRes.rows[0].id;
    log(`Alvállalkozó megtalálva: ${contractorId}`);

    // ── 2. Look up employee status types ────────────────────────────────
    const statusRes = await client.query(`SELECT id, slug FROM employee_status_types`);
    const statusMap = {};
    statusRes.rows.forEach(r => { statusMap[r.slug] = r.id; });
    log(`Státuszok betöltve: ${Object.keys(statusMap).join(', ')}`);

    // ── 3. Look up accommodations and rooms ─────────────────────────────
    const accRes = await client.query(
      `SELECT a.id, a.name, ar.id AS room_id, ar.room_number, ar.beds
       FROM accommodations a
       LEFT JOIN accommodation_rooms ar ON ar.accommodation_id = a.id AND ar.is_active = true
       WHERE a.is_active = true
       ORDER BY a.name, ar.room_number`
    );
    const accommodations = [];
    const accMap = {};
    for (const row of accRes.rows) {
      if (!accMap[row.name]) {
        accMap[row.name] = { id: row.id, name: row.name, rooms: [] };
        accommodations.push(accMap[row.name]);
      }
      if (row.room_id) {
        accMap[row.name].rooms.push({ id: row.room_id, number: row.room_number, beds: row.beds });
      }
    }
    log(`Szálláshelyek betöltve: ${accommodations.map(a => `${a.name} (${a.rooms.length} szoba)`).join(', ')}`);

    // ── 4. Look up existing employee numbers to avoid duplicates ────────
    const existingRes = await client.query(
      `SELECT employee_number FROM employees WHERE contractor_id = $1`,
      [contractorId]
    );
    const existingNumbers = new Set(existingRes.rows.map(r => r.employee_number));
    log(`Meglévő munkavállalók: ${existingNumbers.size} db`);

    // ── 5. Detect available columns ─────────────────────────────────────
    const colRes = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'employees'
    `);
    const availableCols = new Set(colRes.rows.map(r => r.column_name));

    // ── 6. Generate 300 employees ───────────────────────────────────────
    const TOTAL = 300;
    let inserted = 0;
    let nextNum = 6; // Start from EMP-0006

    // Find the next available employee number
    while (existingNumbers.has(`EMP-${String(nextNum).padStart(4, '0')}`)) {
      nextNum++;
    }

    // Build a flat list of all room slots for accommodation assignment
    const allRoomSlots = [];
    for (const acc of accommodations) {
      for (const room of acc.rooms) {
        for (let bed = 0; bed < room.beds; bed++) {
          allRoomSlots.push({ accId: acc.id, roomId: room.id, roomNumber: room.number, accName: acc.name });
        }
      }
    }

    // Track used names to avoid exact duplicates
    const usedNames = new Set();
    // Track room slot assignment for realistic occupancy
    let roomSlotIndex = 0;

    log(`Munkavállalók generálása...`);

    for (let i = 0; i < TOTAL; i++) {
      // ── Gender ──
      const isMale = Math.random() < 0.65; // 65% male (construction industry bias)
      const gender = isMale ? 'male' : 'female';

      // ── Name ──
      let firstName, lastName, fullName;
      let attempts = 0;
      do {
        firstName = isMale ? pick(MAGYAR_FERFI_NEVEK) : pick(MAGYAR_NOI_NEVEK);
        lastName = pick(MAGYAR_VEZETEKNEVEK);
        fullName = `${lastName} ${firstName}`;
        attempts++;
      } while (usedNames.has(fullName) && attempts < 50);
      usedNames.add(fullName);

      // ── Mother's name (always female) ──
      const motherFirst = pick(MAGYAR_NOI_NEVEK);
      const motherLast = pick(MAGYAR_VEZETEKNEVEK);
      const mothersName = `${motherLast} ${motherFirst}`;

      // ── Employee number ──
      const empNumber = `EMP-${String(nextNum).padStart(4, '0')}`;
      nextNum++;

      // ── Status (weighted distribution) ──
      const statusSlug = pickWeighted([
        { value: 'active', weight: 75 },
        { value: 'paid_leave', weight: 8 },
        { value: 'unpaid_leave', weight: 3 },
        { value: 'suspended', weight: 2 },
        { value: 'left', weight: 8 },
        { value: 'waiting', weight: 4 },
      ]);
      const statusId = statusMap[statusSlug] || statusMap['active'];

      // ── Position ──
      const posData = pick(POSITIONS);

      // ── Birth data ──
      const birthDate = randomBirthDate();
      const birthCity = pick(MAGYAR_VAROSOK);

      // ── Address ──
      const addrCity = pick(MAGYAR_VAROSOK);
      const addrStreet = pick(UTCANEVEK);
      const addrNumber = `${Math.floor(Math.random() * 150) + 1}${Math.random() < 0.3 ? '/' + String.fromCharCode(65 + Math.floor(Math.random() * 3)) : ''}`;
      const addrZip = pick(addrCity.zips);

      // ── Dates ──
      const startDate = randomDate(2021, 2026);
      const endDate = statusSlug === 'left' ? randomDate(2024, 2026) : null;
      const arrivalDate = startDate; // Arrival same as start for simplicity

      // ── Accommodation (70% assigned, 30% unassigned) ──
      let accommodationId = null;
      let roomId = null;
      if (statusSlug !== 'left' && statusSlug !== 'waiting' && Math.random() < 0.70) {
        if (roomSlotIndex < allRoomSlots.length) {
          // Assign sequentially until rooms are full, then randomly assign
          const slot = allRoomSlots[roomSlotIndex % allRoomSlots.length];
          accommodationId = slot.accId;
          roomId = slot.roomId;
          roomSlotIndex++;
        } else {
          // Rooms full — randomly assign (over-capacity for testing variety)
          const slot = pick(allRoomSlots);
          accommodationId = slot.accId;
          roomId = slot.roomId;
        }
      }

      // ── Marital status (weighted) ──
      const maritalStatus = pickWeighted([
        { value: 'single', weight: 40 },
        { value: 'married', weight: 45 },
        { value: 'divorced', weight: 12 },
        { value: 'widowed', weight: 3 },
      ]);

      // ── Contact and IDs ──
      const phone = generateHungarianPhone();
      const email = generateEmail(firstName, lastName, nextNum);
      const taxId = Math.random() < 0.85 ? generateTaxId() : null;
      const ssn = Math.random() < 0.80 ? generateSSN() : null;
      const bankAccount = Math.random() < 0.75 ? generateBankAccount() : null;
      const passportNumber = Math.random() < 0.30 ? `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String(Math.floor(Math.random() * 9000000) + 1000000)}` : null;

      // ── Visa (only for some "foreign" workers - 15%) ──
      const hasVisa = Math.random() < 0.15;
      const visaExpiry = hasVisa ? randomDate(2026, 2028) : null;

      // ── Photo (20% have placeholder) ──
      const profilePhotoUrl = Math.random() < 0.20 ? null : null; // All null - no actual photos

      // ── Workplace ──
      const workplace = pick(WORKPLACES);

      // ── Salary note in notes field ──
      const salaryBase = {
        'Építőipar': { min: 350000, max: 750000 },
        'Logisztika': { min: 300000, max: 550000 },
        'Karbantartás': { min: 280000, max: 500000 },
        'Adminisztráció': { min: 320000, max: 600000 },
        'Műszaki': { min: 450000, max: 900000 },
        'Biztonság': { min: 300000, max: 480000 },
      };
      const range = salaryBase[posData.dept] || { min: 300000, max: 600000 };
      const salary = Math.round((range.min + Math.random() * (range.max - range.min)) / 1000) * 1000;
      const notes = Math.random() < 0.30
        ? faker.helpers.arrayElement([
            'Tapasztalt dolgozó, megbízható.',
            'Új munkaerő, betanulás alatt.',
            'Előző munkahelyről jó referenciával érkezett.',
            'OKJ végzettséggel rendelkezik.',
            'Többéves iparági tapasztalat.',
            `Havi bruttó bér: ${salary.toLocaleString('hu-HU')} Ft`,
            'Próbaidős időszak alatt.',
            'Külföldi munkavállalási engedéllyel rendelkezik.',
            'Csapatvezetői potenciállal rendelkezik.',
            'Nyelvtudás: angol alapfok.',
            'B kategóriás jogosítvánnyal rendelkezik.',
            'C kategóriás jogosítvánnyal rendelkezik.',
            'Túlóra vállalására hajlandó.',
            'Első munkahelyes, szakmai gyakorlat keretében.',
            'Részmunkaidős foglalkoztatás.',
          ])
        : null;

      // ── Build INSERT ──
      const cols = [
        'contractor_id', 'employee_number', 'status_id', 'position', 'start_date',
      ];
      const vals = [
        contractorId, empNumber, statusId, posData.title, startDate,
      ];

      // Expanded fields
      if (availableCols.has('first_name')) {
        cols.push('first_name', 'last_name', 'gender', 'birth_date', 'birth_place', 'mothers_name');
        vals.push(firstName, lastName, gender, birthDate, birthCity.city, mothersName);
      }
      if (availableCols.has('marital_status')) {
        cols.push('marital_status');
        vals.push(maritalStatus);
      }
      if (availableCols.has('tax_id') && taxId) {
        cols.push('tax_id');
        vals.push(taxId);
      }
      if (availableCols.has('social_security_number') && ssn) {
        cols.push('social_security_number');
        vals.push(ssn);
      }
      if (availableCols.has('passport_number') && passportNumber) {
        cols.push('passport_number');
        vals.push(passportNumber);
      }
      if (availableCols.has('bank_account') && bankAccount) {
        cols.push('bank_account');
        vals.push(bankAccount);
      }
      if (availableCols.has('visa_expiry') && visaExpiry) {
        cols.push('visa_expiry');
        vals.push(visaExpiry);
      }
      if (availableCols.has('arrival_date')) {
        cols.push('arrival_date');
        vals.push(arrivalDate);
      }
      if (availableCols.has('profile_photo_url') && profilePhotoUrl) {
        cols.push('profile_photo_url');
        vals.push(profilePhotoUrl);
      }
      if (availableCols.has('workplace')) {
        cols.push('workplace');
        vals.push(workplace);
      }
      if (availableCols.has('company_name')) {
        cols.push('company_name');
        vals.push('ABC Kereskedelmi Kft.');
      }
      if (availableCols.has('company_phone')) {
        cols.push('company_phone');
        vals.push(phone);
      }
      if (availableCols.has('company_email')) {
        cols.push('company_email');
        vals.push(email);
      }
      if (availableCols.has('end_date') && endDate) {
        cols.push('end_date');
        vals.push(endDate);
      }
      if (availableCols.has('notes') && notes) {
        cols.push('notes');
        vals.push(notes);
      }
      // Address
      if (availableCols.has('permanent_address_city')) {
        cols.push('permanent_address_city', 'permanent_address_county', 'permanent_address_zip',
                   'permanent_address_country', 'permanent_address_street', 'permanent_address_number');
        vals.push(addrCity.city, addrCity.county, addrZip, 'Magyarország', addrStreet, addrNumber);
      }
      // Accommodation
      if (availableCols.has('accommodation_id') && accommodationId) {
        cols.push('accommodation_id');
        vals.push(accommodationId);
      }
      if (availableCols.has('room_id') && roomId) {
        cols.push('room_id');
        vals.push(roomId);
      }

      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      await client.query(
        `INSERT INTO employees (${cols.join(', ')}) VALUES (${placeholders})`,
        vals
      );

      inserted++;

      // Progress logging every 50
      if (inserted % 50 === 0) {
        log(`  ${inserted}/${TOTAL} munkavállaló beszúrva...`);
      }
    }

    await client.query('COMMIT');

    // ── Summary ──
    const totalRes = await client.query(
      `SELECT COUNT(*) as total FROM employees WHERE contractor_id = $1`,
      [contractorId]
    );
    const statusCounts = await client.query(
      `SELECT est.name, est.slug, COUNT(*) as count
       FROM employees e
       JOIN employee_status_types est ON est.id = e.status_id
       WHERE e.contractor_id = $1
       GROUP BY est.name, est.slug
       ORDER BY count DESC`,
      [contractorId]
    );
    const accCounts = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE accommodation_id IS NOT NULL) as housed,
         COUNT(*) FILTER (WHERE accommodation_id IS NULL) as unhoused
       FROM employees WHERE contractor_id = $1`,
      [contractorId]
    );

    console.log('');
    console.log('════════════════════════════════════════════════════');
    console.log('  300 MUNKAVÁLLALÓ SEED SIKERESEN BEFEJEZVE!');
    console.log('════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Beszúrt új munkavállalók:   ${inserted}`);
    console.log(`  Összes munkavállaló:        ${totalRes.rows[0].total}`);
    console.log('');
    console.log('  Státusz megoszlás:');
    for (const row of statusCounts.rows) {
      console.log(`    ${row.name} (${row.slug}): ${row.count}`);
    }
    console.log('');
    console.log('  Szállás megoszlás:');
    console.log(`    Szálláson lakik:    ${accCounts.rows[0].housed}`);
    console.log(`    Nincs szálláson:    ${accCounts.rows[0].unhoused}`);
    console.log('');
    console.log('  Azonosító tartomány: EMP-0006 — EMP-' + String(nextNum - 1).padStart(4, '0'));
    console.log('════════════════════════════════════════════════════');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('HIBA a seed futtatása közben:');
    console.error(error.message);
    if (error.detail) console.error('Részlet:', error.detail);
    if (error.hint) console.error('Tipp:', error.hint);
    throw error;
  } finally {
    client.release();
  }
}

// ─── Entry Point ────────────────────────────────────────────────────────────

seed300Employees()
  .then(() => {
    log('Seed sikeresen befejezve.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed sikertelen:', err.message);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
