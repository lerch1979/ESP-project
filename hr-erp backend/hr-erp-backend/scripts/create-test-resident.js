require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('../src/database/connection');

/**
 * Create ONE isolated test resident for the mobile pilot — idempotent, safe to re-run.
 *
 * Builds the full resident journey prerequisites WITHOUT touching the 4 real
 * Filipino tenants in Fertőd:
 *   A. contractor  "Housing Solutions Kft" (our own property operator — new isolated row)
 *   B. user        teszt.lakos@housingsolutions.hu  (resident-only)
 *   C. user_roles  accommodated_employee
 *   D. employee    mapped to Fertőd, room TEST-1  (enables "see my room")
 *
 * Re-running upserts the same rows (corrects password / links) and never duplicates.
 */

const CONTRACTOR = { name: 'Housing Solutions Kft', slug: 'housing-solutions', email: 'info@housingsolutions.hu' };
const TEST_USER = {
  email: 'teszt.lakos@housingsolutions.hu',
  password: 'TesztLako2026!',
  first_name: 'Eszti',
  last_name: 'Teszt',
  phone: '+36 20 000 0000',
  preferred_language: 'hu',
};
const FERTOD_NAME = 'Fertőd';
const ROLE_SLUG = 'accommodated_employee';
const EMPLOYEE_NUMBER = 'TEST-RESIDENT-1';
const ROOM_NUMBER = 'TEST-1';

async function run() {
  console.log('🧪 Creating isolated test resident (idempotent)...\n');

  // ─── A. Contractor: Housing Solutions Kft ───────────────────────────
  await query(
    `INSERT INTO contractors (name, slug, email, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = true`,
    [CONTRACTOR.name, CONTRACTOR.slug, CONTRACTOR.email]
  );
  const { rows: [contractor] } = await query('SELECT id, name, is_active FROM contractors WHERE slug = $1', [CONTRACTOR.slug]);
  console.log(`A. contractor  → ${contractor.name}  id=${contractor.id}  active=${contractor.is_active}`);

  // ─── Resolve role + accommodation (fail loud if missing) ────────────
  const { rows: [role] } = await query('SELECT id FROM roles WHERE slug = $1', [ROLE_SLUG]);
  if (!role) throw new Error(`Role '${ROLE_SLUG}' not found`);
  const { rows: [fertod] } = await query('SELECT id, name FROM accommodations WHERE name = $1', [FERTOD_NAME]);
  if (!fertod) throw new Error(`Accommodation '${FERTOD_NAME}' not found`);

  // ─── B. User (resident-only) ────────────────────────────────────────
  const passwordHash = await bcrypt.hash(TEST_USER.password, 10);
  await query(
    `INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, phone, is_active, preferred_language)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7)
     ON CONFLICT (email) DO UPDATE SET
       contractor_id = EXCLUDED.contractor_id,
       password_hash = EXCLUDED.password_hash,
       is_active = true,
       preferred_language = EXCLUDED.preferred_language`,
    [contractor.id, TEST_USER.email, passwordHash, TEST_USER.first_name, TEST_USER.last_name, TEST_USER.phone, TEST_USER.preferred_language]
  );
  const { rows: [user] } = await query('SELECT id, email FROM users WHERE email = $1', [TEST_USER.email]);
  console.log(`B. user        → ${user.email}  id=${user.id}  lang=${TEST_USER.preferred_language}`);

  // ─── C. user_roles: accommodated_employee (ONLY) ────────────────────
  await query(
    `INSERT INTO user_roles (user_id, role_id, contractor_id)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [user.id, role.id, contractor.id]
  );
  const { rows: roleRows } = await query(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
    [user.id]
  );
  console.log(`C. roles       → [${roleRows.map(r => r.slug).join(', ')}]`);

  // ─── D. Employee row → Fertőd, room TEST-1 ("see my room") ──────────
  await query(
    `INSERT INTO employees (contractor_id, user_id, accommodation_id, employee_number, first_name, last_name, room_number, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     ON CONFLICT (contractor_id, employee_number) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       accommodation_id = EXCLUDED.accommodation_id,
       room_number = EXCLUDED.room_number,
       end_date = NULL`,
    [contractor.id, user.id, fertod.id, EMPLOYEE_NUMBER, TEST_USER.first_name, TEST_USER.last_name, ROOM_NUMBER]
  );
  const { rows: [emp] } = await query(
    `SELECT e.id, e.room_number, a.name AS accommodation FROM employees e
     JOIN accommodations a ON a.id = e.accommodation_id WHERE e.user_id = $1`,
    [user.id]
  );
  console.log(`D. employee    → ${emp.accommodation} / room ${emp.room_number}  id=${emp.id}`);

  console.log('\n✅ Done. Test login:');
  console.log(`   email:    ${TEST_USER.email}`);
  console.log(`   password: ${TEST_USER.password}`);
  console.log(`   📌 Housing Solutions Kft contractor id (record for real Fertőd tenants later): ${contractor.id}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Failed:', err.message); process.exit(1); });
