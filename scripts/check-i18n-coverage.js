#!/usr/bin/env node
/**
 * check-i18n-coverage.js — guard for the resident-facing multilingual UI.
 *
 * Run before committing any change that touches resident UI or DB enums:
 *     node scripts/check-i18n-coverage.js
 *
 * It checks three things and exits non-zero (with a gap list) if any fail:
 *   1. Every enum slug a RESIDENT can see — ticket categories (for contractors
 *      that have residents), all ticket statuses, all priorities — has a key in
 *      ALL 5 locale files (hu/en/uk/tl/de).
 *   2. The resident-only screens contain no hardcoded Hungarian string literals
 *      (everything must go through t(); add `i18n-ignore` on a line to suppress
 *      a legitimate exception).
 *
 * Exit codes: 0 = clean · 1 = coverage gaps · 2 = environment problem (DB/files).
 *
 * DB connection: $DATABASE_URL, else the local dev default below.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MOBILE = path.join(ROOT, 'hr-erp-mobile');
const LOCALES_DIR = path.join(MOBILE, 'src', 'i18n', 'locales');
const LANGS = ['hu', 'en', 'uk', 'tl', 'de'];
const DB = process.env.DATABASE_URL || 'postgresql://lerchbalazs@localhost:5432/hr_erp_db';

// Locale namespace each enum group maps to, and the SQL that lists the slugs a
// resident can actually encounter.
const ENUMS = [
  {
    group: 'category',
    sql: `SELECT DISTINCT tc.slug FROM ticket_categories tc
            WHERE tc.is_active
              AND tc.contractor_id IN (
                SELECT DISTINCT ur.contractor_id FROM user_roles ur
                  JOIN roles r ON r.id = ur.role_id
                 WHERE r.slug = 'accommodated_employee'
              )
            ORDER BY tc.slug`,
  },
  { group: 'status', sql: `SELECT slug FROM ticket_statuses ORDER BY slug` },
  { group: 'priority', sql: `SELECT slug FROM priorities ORDER BY slug` },
];

// Resident-ONLY screens — every visible string here must be translated. Shared
// screens (MoreMenu, AccommodationList) are intentionally excluded: they hold
// staff-only labels residents never see; their resident-visible labels ARE
// translated and covered by manual review.
const RESIDENT_FILES = [
  'src/screens/ResidentHomeScreen.js',
  'src/screens/tickets/ResidentTicketList.js',
  'src/screens/tickets/ResidentTicketDetail.js',
  'src/screens/tickets/CreateTicketScreen.js',
  'src/components/ResidentTicketRow.js',
];

const HU_RE = /['"`][^'"`]*[áéíóöőúüűÁÉÍÓÖŐÚÜŰ][^'"`]*['"`]/;
const ALLOW = ['Housing Solutions']; // brand / non-translatable literals

function psql(sql) {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  try {
    const out = execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(oneLine)}`, { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.error(`✗ DB query failed (is Postgres up? DATABASE_URL=${DB}):\n  ${e.message.split('\n')[0]}`);
    process.exit(2);
  }
}

function loadLocales() {
  const out = {};
  for (const l of LANGS) {
    const p = path.join(LOCALES_DIR, `${l}.json`);
    try {
      out[l] = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.error(`✗ Could not read/parse locale ${p}: ${e.message}`);
      process.exit(2);
    }
  }
  return out;
}

function main() {
  const locales = loadLocales();
  const gaps = [];

  // 1) enum coverage
  for (const { group, sql } of ENUMS) {
    const slugs = psql(sql);
    for (const slug of slugs) {
      for (const l of LANGS) {
        if (!locales[l]?.[group]?.[slug]) gaps.push(`MISSING KEY   ${l}:${group}.${slug}`);
      }
    }
    console.log(`  enum ${group.padEnd(9)} ${String(slugs.length).padStart(2)} slug(s) × ${LANGS.length} locales`);
  }

  // 2) hardcoded Hungarian in resident-only screens
  let scanned = 0;
  for (const rel of RESIDENT_FILES) {
    const file = path.join(MOBILE, rel);
    if (!fs.existsSync(file)) continue;
    scanned++;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!HU_RE.test(line)) return;
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (trimmed.startsWith('import ')) return;
      if (line.includes('i18n-ignore')) return;
      if (/\bt\(/.test(line) || line.includes('defaultValue')) return; // translated
      if (ALLOW.some((a) => line.includes(a))) return;
      gaps.push(`HU LITERAL    ${rel}:${i + 1}  ${trimmed.slice(0, 80)}`);
    });
  }
  console.log(`  scanned ${scanned} resident-only screen(s) for hardcoded Hungarian`);

  if (gaps.length) {
    console.error(`\n❌ i18n coverage gaps (${gaps.length}):`);
    gaps.forEach((g) => console.error('   ' + g));
    console.error('\nFix these before committing resident-facing changes.');
    process.exit(1);
  }
  console.log('\n✓ i18n coverage OK — resident enums keyed in all 5 locales; no hardcoded Hungarian in resident screens.');
  process.exit(0);
}

main();
