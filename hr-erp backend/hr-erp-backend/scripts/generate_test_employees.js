/**
 * Generate 300 fictional Hungarian employees for bulk import testing
 * Run: node scripts/generate_test_employees.js
 * Output: munkavallalok_300_teszt.xlsx
 */
const XLSX = require('xlsx');
const path = require('path');

// ── Hungarian data pools ──────────────────────────────────────────

const MALE_FIRST_NAMES = [
  'István', 'László', 'József', 'János', 'Zoltán', 'Sándor', 'Gábor',
  'Ferenc', 'Attila', 'Péter', 'Tamás', 'Tibor', 'András', 'Csaba',
  'Imre', 'Lajos', 'György', 'Béla', 'Károly', 'Róbert', 'Dávid',
  'Miklós', 'Balázs', 'Gyula', 'Mihály', 'Ádám', 'Norbert', 'Krisztián',
  'Márton', 'Dániel', 'Levente', 'Bence', 'Máté', 'Gergő', 'Richárd',
  'Viktor', 'Patrik', 'Szabolcs', 'Ákos', 'Dominik',
];

const FEMALE_FIRST_NAMES = [
  'Mária', 'Erzsébet', 'Katalin', 'Ilona', 'Éva', 'Anna', 'Zsuzsanna',
  'Margit', 'Judit', 'Ágnes', 'Andrea', 'Erika', 'Krisztina', 'Mónika',
  'Edit', 'Gabriella', 'Szilvia', 'Anikó', 'Viktória', 'Nikolett',
  'Vivien', 'Petra', 'Bianka', 'Eszter', 'Réka', 'Zsófia', 'Dóra',
  'Nóra', 'Orsolya', 'Tímea', 'Hajnalka', 'Boglárka', 'Renáta',
  'Adrienn', 'Bernadett', 'Klára', 'Emese', 'Anett', 'Kinga', 'Lilla',
];

const LAST_NAMES = [
  'Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga', 'Kiss',
  'Molnár', 'Németh', 'Farkas', 'Balogh', 'Papp', 'Takács', 'Juhász',
  'Lakatos', 'Mészáros', 'Oláh', 'Simon', 'Rácz', 'Fehér', 'Szilágyi',
  'Török', 'Vincze', 'Pintér', 'Szűcs', 'Hegedűs', 'Bíró', 'Bogdán',
  'Fekete', 'Katona', 'Kozma', 'Sárközi', 'Orbán', 'Antal', 'Bodnár',
  'Nemes', 'Szalai', 'Pál', 'Kocsis', 'Bálint', 'Soós', 'Fülöp',
  'Lukács', 'Gulyás', 'Jakab', 'Máté', 'Kelemen', 'Illés', 'Szántó', 'Budai',
];

const CITIES = [
  { city: 'Budapest', county: 'Budapest', zip: '1' },
  { city: 'Debrecen', county: 'Hajdú-Bihar', zip: '4' },
  { city: 'Szeged', county: 'Csongrád-Csanád', zip: '6' },
  { city: 'Miskolc', county: 'Borsod-Abaúj-Zemplén', zip: '3' },
  { city: 'Pécs', county: 'Baranya', zip: '7' },
  { city: 'Győr', county: 'Győr-Moson-Sopron', zip: '9' },
  { city: 'Nyíregyháza', county: 'Szabolcs-Szatmár-Bereg', zip: '4' },
  { city: 'Kecskemét', county: 'Bács-Kiskun', zip: '6' },
  { city: 'Székesfehérvár', county: 'Fejér', zip: '8' },
  { city: 'Szombathely', county: 'Vas', zip: '9' },
  { city: 'Szolnok', county: 'Jász-Nagykun-Szolnok', zip: '5' },
  { city: 'Eger', county: 'Heves', zip: '3' },
  { city: 'Tatabánya', county: 'Komárom-Esztergom', zip: '2' },
  { city: 'Kaposvár', county: 'Somogy', zip: '7' },
  { city: 'Sopron', county: 'Győr-Moson-Sopron', zip: '9' },
  { city: 'Veszprém', county: 'Veszprém', zip: '8' },
  { city: 'Békéscsaba', county: 'Békés', zip: '5' },
  { city: 'Zalaegerszeg', county: 'Zala', zip: '8' },
  { city: 'Érd', county: 'Pest', zip: '2' },
  { city: 'Dunaújváros', county: 'Fejér', zip: '2' },
  { city: 'Hódmezővásárhely', county: 'Csongrád-Csanád', zip: '6' },
  { city: 'Dunakeszi', county: 'Pest', zip: '2' },
  { city: 'Szigetszentmiklós', county: 'Pest', zip: '2' },
  { city: 'Cegléd', county: 'Pest', zip: '2' },
  { city: 'Gyöngyös', county: 'Heves', zip: '3' },
];

const STREETS = [
  'Kossuth Lajos utca', 'Petőfi Sándor utca', 'Rákóczi út', 'Deák Ferenc utca',
  'Arany János utca', 'Széchenyi István tér', 'Ady Endre utca', 'Jókai Mór utca',
  'Bartók Béla út', 'Dózsa György út', 'Bajcsy-Zsilinszky utca', 'Vörösmarty utca',
  'Fő utca', 'Bem József utca', 'Hunyadi utca', 'Szent István körút',
  'Bethlen Gábor utca', 'Móricz Zsigmond körtér', 'Váci utca', 'Wesselényi utca',
  'Baross utca', 'Damjanich utca', 'Thököly út', 'Mátyás király utca',
  'Alkotmány utca', 'Király utca', 'Múzeum körút', 'Garay utca',
];

const POSITIONS = [
  'Raktáros', 'Összeszerelő', 'Targoncavezető', 'Gépkezelő', 'Hegesztő',
  'CNC operátor', 'Minőségellenőr', 'Karbantartó', 'Villanyszerelő',
  'Csomagoló', 'Anyagmozgató', 'Betanított munkás', 'Lakatos',
  'Műszakvezető', 'Takarító', 'Raktári adminisztrátor', 'Logisztikai munkatárs',
  'Gyártósori operátor', 'Festő', 'Vágógép kezelő',
];

// Actual accommodations from the database (must match exactly)
const ACCOMMODATIONS = [
  'D épület 301',
  'E épület 401',
  'F épület 501',
  'C epulet 201 - Premium',
  'B epulet Munkasszallo',
];

const WORKPLACES = [
  'Audi Hungária Kft.', 'Suzuki Manufacturing Kft.', 'Samsung SDI Magyarország Kft.',
  'Continental Automotive Kft.', 'Bosch Csoport Magyarország', 'BorgWarner Kft.',
  'Denso Gyártó Magyarország Kft.', 'Flex Hungary Kft.', 'Hankook Tire Kft.',
  'Videoton Holding Zrt.',
];

const COMPANY_NAMES = [
  'Housing Solutions Kft.', 'MunkaErő Partner Kft.', 'ProStaff Hungary Kft.',
  'WorkForce Plusz Kft.', 'TempJob Services Kft.',
];

// ── Helpers ────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(startYear, startMonth, endYear, endMonth) {
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 28);
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return formatDate(d);
}

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function removeDiacritics(str) {
  const map = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o', 'ú': 'u', 'ü': 'u', 'ű': 'u',
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ö': 'O', 'Ő': 'O', 'Ú': 'U', 'Ü': 'U', 'Ű': 'U',
  };
  return str.replace(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, c => map[c] || c);
}

function generateTaxId() {
  // 10 digit Hungarian tax ID (adóazonosító jel) - starts with 8
  let id = '8';
  for (let i = 1; i < 10; i++) id += randInt(0, 9);
  return id;
}

function generatePassport() {
  // Hungarian passport format: 2 letters + 7 digits
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return pick(letters.split('')) + pick(letters.split('')) + String(randInt(1000000, 9999999));
}

function generateTAJ() {
  // 9 digit TAJ number
  let taj = '';
  for (let i = 0; i < 9; i++) taj += randInt(0, 9);
  return taj;
}

function generateBankAccount() {
  // Hungarian format: XXXXXXXX-XXXXXXXX-XXXXXXXX (3x8 digits)
  const seg = () => String(randInt(10000000, 99999999));
  return `${seg()}-${seg()}-${seg()}`;
}

function generatePhone() {
  const prefixes = ['20', '30', '31', '50', '70'];
  return `+36 ${pick(prefixes)} ${randInt(100, 999)} ${randInt(1000, 9999)}`;
}

function generateZip(cityData) {
  // Hungarian zip codes are 4 digits; first digit(s) roughly map to region
  const first = cityData.zip;
  if (first === '1') {
    // Budapest: 1XXX
    return `1${randInt(0, 2)}${randInt(0, 9)}${randInt(0, 9)}`;
  }
  return `${first}${randInt(0, 9)}${randInt(0, 9)}${randInt(0, 9)}`;
}

// ── Generate employees ─────────────────────────────────────────────

const usedEmails = new Set();

function generateEmployee(index) {
  // Gender distribution: ~55% male, ~42% female, ~3% other
  const genderRand = Math.random();
  let gender, firstName;
  if (genderRand < 0.55) {
    gender = 'male';
    firstName = pick(MALE_FIRST_NAMES);
  } else if (genderRand < 0.97) {
    gender = 'female';
    firstName = pick(FEMALE_FIRST_NAMES);
  } else {
    gender = 'other';
    firstName = Math.random() < 0.5 ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);
  }

  const lastName = pick(LAST_NAMES);

  // Unique email
  let emailBase = removeDiacritics(`${firstName}.${lastName}`).toLowerCase().replace(/\s+/g, '');
  let email = `${emailBase}@test.com`;
  let counter = 1;
  while (usedEmails.has(email)) {
    email = `${emailBase}${counter}@test.com`;
    counter++;
  }
  usedEmails.add(email);

  // Mother's name (always female)
  const mothersFirstName = pick(FEMALE_FIRST_NAMES);
  const mothersLastName = pick(LAST_NAMES);
  const mothersName = `${mothersLastName} ${mothersFirstName}`;

  // Marital status: ~40% single, ~45% married, ~15% divorced
  const maritalRand = Math.random();
  const maritalStatus = maritalRand < 0.40 ? 'single' : maritalRand < 0.85 ? 'married' : 'divorced';

  // Address data
  const cityData = pick(CITIES);
  const birthCityData = pick(CITIES);

  // Dates
  const birthDate = randomDate(1970, 1, 2000, 12);
  const arrivalDate = randomDate(2024, 3, 2026, 1);
  const visaExpiry = randomDate(2026, 3, 2028, 2);
  const contractEnd = randomDate(2026, 6, 2029, 2);

  // Departure: ~85% empty, ~15% have a future date
  let departureDate = '';
  if (Math.random() < 0.15) {
    departureDate = randomDate(2026, 3, 2027, 6);
  }

  // is_active: ~90% true, ~10% false
  const isActive = Math.random() < 0.90;

  // Workplace and company
  const workplace = pick(WORKPLACES);
  const company = pick(COMPANY_NAMES);
  const companySlug = removeDiacritics(company.replace(/\s+/g, '').replace(/[.]/g, '')).toLowerCase();
  const companyEmail = `info@${companySlug.substring(0, 15)}.hu`;
  const companyPhone = `+36 1 ${randInt(200, 999)} ${randInt(1000, 9999)}`;

  return {
    'Vezetéknév': lastName,
    'Keresztnév': firstName,
    'Email': email,
    'Telefon': generatePhone(),
    'Nem': gender,
    'Születési dátum': birthDate,
    'Születési hely': birthCityData.city,
    'Anyja neve': mothersName,
    'Adóazonosító': generateTaxId(),
    'Útlevélszám': generatePassport(),
    'Érkezés dátuma': arrivalDate,
    'Vízum lejárat': visaExpiry,
    'TAJ szám': generateTAJ(),
    'Családi állapot': maritalStatus,
    'Szálláshely': pick(ACCOMMODATIONS),
    'Szobaszám': String(randInt(101, 430)),
    'Munkakör': pick(POSITIONS),
    'Bankszámlaszám': generateBankAccount(),
    'Munkahely': workplace,
    'Irányítószám': generateZip(cityData),
    'Megye': cityData.county,
    'Ország': 'Magyarország',
    'Város': cityData.city,
    'Utca': pick(STREETS),
    'Házszám': `${randInt(1, 120)}${Math.random() < 0.2 ? '/' + pick(['A', 'B', 'C']) : ''}`,
    'Cégnév': company,
    'Céges email': companyEmail,
    'Céges telefon': companyPhone,
    'Távozás dátuma': departureDate,
    'Szerződés vége': contractEnd,
    'Aktív': isActive ? 'igen' : 'nem',
  };
}

// ── Main ──────────────────────────────────────────────────────────

const employees = [];
for (let i = 0; i < 300; i++) {
  employees.push(generateEmployee(i));
}

const ws = XLSX.utils.json_to_sheet(employees);

// Auto-size columns
const colWidths = Object.keys(employees[0]).map(key => {
  const maxLen = Math.max(
    key.length,
    ...employees.map(e => String(e[key]).length)
  );
  return { wch: Math.min(maxLen + 2, 35) };
});
ws['!cols'] = colWidths;

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Munkavállalók');

const outputPath = path.join(__dirname, '..', 'munkavallalok_300_teszt.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`✅ Generated 300 test employees -> ${outputPath}`);
console.log(`   Columns: ${Object.keys(employees[0]).length}`);

// Quick stats
const males = employees.filter(e => e['Nem'] === 'male').length;
const females = employees.filter(e => e['Nem'] === 'female').length;
const others = employees.filter(e => e['Nem'] === 'other').length;
const singles = employees.filter(e => e['Családi állapot'] === 'single').length;
const married = employees.filter(e => e['Családi állapot'] === 'married').length;
const divorced = employees.filter(e => e['Családi állapot'] === 'divorced').length;
const active = employees.filter(e => e['Aktív'] === 'igen').length;
const withDeparture = employees.filter(e => e['Távozás dátuma'] !== '').length;

console.log(`   Gender: ${males} male, ${females} female, ${others} other`);
console.log(`   Marital: ${singles} single, ${married} married, ${divorced} divorced`);
console.log(`   Active: ${active} yes, ${300 - active} no`);
console.log(`   With departure date: ${withDeparture}`);
