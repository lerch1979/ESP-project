#!/usr/bin/env node
/**
 * Test script for migration 059: EAP schema
 * Validates tables, constraints, RLS policies, encryption, and seed data.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

let passed = 0;
let failed = 0;

function ok(msg) { passed++; console.log(`  ✓ ${msg}`); }
function fail(msg) { failed++; console.log(`  ✗ ${msg}`); }

async function run() {
  const client = await pool.connect();

  try {
    // ── Verify tables ──
    console.log('\n--- TEST: Tables Exist ---');
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name LIKE 'eap_%' AND table_schema = 'public'
       ORDER BY table_name`
    );
    const tableNames = tables.rows.map(r => r.table_name);
    const expected = [
      'eap_cases', 'eap_provider_bookings', 'eap_providers',
      'eap_service_categories', 'eap_sessions', 'eap_usage_stats'
    ];
    expected.forEach(t => {
      if (tableNames.includes(t)) ok(`Table ${t} exists`);
      else fail(`Table ${t} MISSING`);
    });

    // ── Verify RLS ──
    console.log('\n--- TEST: RLS Enabled ---');
    const rls = await client.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class WHERE relname LIKE 'eap_%' AND relkind = 'r'
       ORDER BY relname`
    );
    rls.rows.forEach(r => {
      if (r.relrowsecurity && r.relforcerowsecurity)
        ok(`${r.relname}: RLS enabled + forced`);
      else
        fail(`${r.relname}: RLS not fully enabled`);
    });

    // ── Verify RLS policies ──
    console.log('\n--- TEST: RLS Policies ---');
    const policies = await client.query(
      `SELECT tablename, policyname FROM pg_policies
       WHERE tablename LIKE 'eap_%' ORDER BY tablename, policyname`
    );
    console.log(`  (${policies.rows.length} policies found)`);
    if (policies.rows.length >= 10) ok(`${policies.rows.length} RLS policies created`);
    else fail(`Expected >= 10 policies, got ${policies.rows.length}`);

    // ── Verify pgcrypto extension ──
    console.log('\n--- TEST: pgcrypto Extension ---');
    const ext = await client.query(
      `SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`
    );
    if (ext.rows.length > 0) ok('pgcrypto extension installed');
    else fail('pgcrypto extension MISSING');

    // ── Set RLS context for data tests ──
    const user = await client.query(
      'SELECT u.id AS user_id, u.contractor_id FROM users u WHERE u.contractor_id IS NOT NULL LIMIT 1'
    );
    if (user.rows.length === 0) {
      console.log('\nNo users found — skipping data tests');
      return;
    }
    const userId = user.rows[0].user_id;
    const contractorId = user.rows[0].contractor_id;

    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await client.query(`SELECT set_config('app.current_contractor_id', $1, true)`, [contractorId]);
    await client.query(`SELECT set_config('app.current_role', $1, true)`, ['admin']);

    // ── Seed categories ──
    console.log('\n--- TEST: Seed Categories ---');
    const cats = await client.query('SELECT COUNT(*) FROM eap_service_categories');
    const catCount = parseInt(cats.rows[0].count);
    if (catCount >= 6) ok(`${catCount} service categories seeded`);
    else fail(`Expected >= 6 categories, got ${catCount}`);

    // ── Seed providers ──
    console.log('\n--- TEST: Seed Providers ---');
    const provs = await client.query('SELECT COUNT(*) FROM eap_providers');
    const provCount = parseInt(provs.rows[0].count);
    if (provCount >= 10) ok(`${provCount} providers seeded`);
    else fail(`Expected >= 10 providers, got ${provCount}`);

    // Check provider types distribution
    const provTypes = await client.query(
      'SELECT provider_type, COUNT(*) as cnt FROM eap_providers GROUP BY provider_type ORDER BY cnt DESC'
    );
    provTypes.rows.forEach(r => console.log(`    ${r.provider_type}: ${r.cnt}`));

    // ── Test case creation ──
    console.log('\n--- TEST: Case CRUD ---');
    const catId = (await client.query('SELECT id FROM eap_service_categories LIMIT 1')).rows[0].id;
    const providerId = (await client.query('SELECT id FROM eap_providers LIMIT 1')).rows[0].id;

    const eapCase = await client.query(
      `INSERT INTO eap_cases
         (user_id, contractor_id, case_number, service_category_id, urgency_level, issue_description, consent_given, consent_date)
       VALUES ($1, $2, 'EAP-20260317-TEST', $3, 'medium', 'Test issue description', true, NOW())
       RETURNING id, case_number`,
      [userId, contractorId, catId]
    );
    ok('Case created: ' + eapCase.rows[0].case_number);

    // Duplicate case_number should fail
    try {
      await client.query(
        `INSERT INTO eap_cases (user_id, contractor_id, case_number, service_category_id)
         VALUES ($1, $2, 'EAP-20260317-TEST', $3)`,
        [userId, contractorId, catId]
      );
      fail('UNIQUE case_number NOT enforced');
    } catch (e) {
      if (e.code === '23505') ok('UNIQUE case_number enforced');
      else fail('Unexpected: ' + e.message);
    }

    // Invalid urgency
    try {
      await client.query(
        `INSERT INTO eap_cases (user_id, contractor_id, case_number, service_category_id, urgency_level)
         VALUES ($1, $2, 'EAP-TEST-BAD', $3, 'extreme')`,
        [userId, contractorId, catId]
      );
      fail('CHECK urgency_level NOT enforced');
    } catch (e) {
      ok('CHECK urgency_level enforced');
    }

    // Invalid status
    try {
      await client.query(
        `INSERT INTO eap_cases (user_id, contractor_id, case_number, service_category_id, status)
         VALUES ($1, $2, 'EAP-TEST-BAD2', $3, 'invalid')`,
        [userId, contractorId, catId]
      );
      fail('CHECK status NOT enforced');
    } catch (e) {
      ok('CHECK status enforced');
    }

    // ── Test session with pgcrypto encryption ──
    console.log('\n--- TEST: Session + pgcrypto Encryption ---');
    const caseId = eapCase.rows[0].id;
    const secret = 'test-encryption-key-2026';
    const plainNotes = 'Patient reports significant anxiety about job security. Recommended CBT techniques.';

    const session = await client.query(
      `INSERT INTO eap_sessions
         (case_id, provider_id, session_date, duration_minutes, session_type, session_format,
          session_notes_encrypted, topics_covered, progress_rating)
       VALUES ($1, $2, NOW(), 50, 'individual_counseling', 'video_call',
               pgp_sym_encrypt($3, $4),
               ARRAY['anxiety','job_security','CBT'],
               6)
       RETURNING id`,
      [caseId, providerId, plainNotes, secret]
    );
    ok('Session created with encrypted notes: ' + session.rows[0].id);

    // Decrypt and verify
    const decrypted = await client.query(
      `SELECT pgp_sym_decrypt(session_notes_encrypted::bytea, $1) AS notes
       FROM eap_sessions WHERE id = $2`,
      [secret, session.rows[0].id]
    );
    if (decrypted.rows[0].notes === plainNotes) ok('pgcrypto encrypt/decrypt roundtrip verified');
    else fail('Decrypted notes do not match: ' + decrypted.rows[0].notes);

    // Wrong key should fail
    try {
      await client.query(
        `SELECT pgp_sym_decrypt(session_notes_encrypted::bytea, 'wrong-key') AS notes
         FROM eap_sessions WHERE id = $1`,
        [session.rows[0].id]
      );
      fail('pgcrypto decryption with wrong key should fail');
    } catch (e) {
      ok('pgcrypto rejects wrong decryption key');
    }

    // Invalid session_type
    try {
      await client.query(
        `INSERT INTO eap_sessions (case_id, session_date, duration_minutes, session_type)
         VALUES ($1, NOW(), 50, 'invalid_type')`,
        [caseId]
      );
      fail('CHECK session_type NOT enforced');
    } catch (e) {
      ok('CHECK session_type enforced');
    }

    // Invalid duration
    try {
      await client.query(
        `INSERT INTO eap_sessions (case_id, session_date, duration_minutes, session_type)
         VALUES ($1, NOW(), 0, 'follow_up')`,
        [caseId]
      );
      fail('CHECK duration > 0 NOT enforced');
    } catch (e) {
      ok('CHECK duration_minutes > 0 enforced');
    }

    // ── Test bookings ──
    console.log('\n--- TEST: Bookings ---');
    const booking = await client.query(
      `INSERT INTO eap_provider_bookings
         (case_id, provider_id, user_id, appointment_datetime, duration_minutes, booking_type, status)
       VALUES ($1, $2, $3, '2026-04-01 10:00:00', 60, 'video_call', 'scheduled')
       RETURNING id`,
      [caseId, providerId, userId]
    );
    ok('Booking created: ' + booking.rows[0].id);

    // Double-booking should fail
    try {
      await client.query(
        `INSERT INTO eap_provider_bookings
           (provider_id, user_id, appointment_datetime, booking_type)
         VALUES ($1, $2, '2026-04-01 10:00:00', 'in_person')`,
        [providerId, userId]
      );
      fail('Double-booking NOT prevented');
    } catch (e) {
      if (e.code === '23505') ok('Double-booking prevented (UNIQUE constraint)');
      else fail('Unexpected: ' + e.message);
    }

    // ── Test usage stats ──
    console.log('\n--- TEST: Usage Stats ---');
    const stats = await client.query(
      `INSERT INTO eap_usage_stats
         (contractor_id, stat_month, total_cases_opened, total_sessions_held, employee_count_using_eap, total_eligible_employees, utilization_rate)
       VALUES ($1, '2026-03-01', 15, 42, 12, 200, 6.0)
       RETURNING id`,
      [contractorId]
    );
    ok('Usage stats inserted: ' + stats.rows[0].id);

    // Duplicate month should fail
    try {
      await client.query(
        `INSERT INTO eap_usage_stats (contractor_id, stat_month, total_cases_opened)
         VALUES ($1, '2026-03-01', 5)`,
        [contractorId]
      );
      fail('UNIQUE (contractor_id, stat_month) NOT enforced');
    } catch (e) {
      if (e.code === '23505') ok('UNIQUE (contractor_id, stat_month) enforced');
      else fail('Unexpected: ' + e.message);
    }

    // ── Test case_number sequence ──
    console.log('\n--- TEST: Case Number Sequence ---');
    const seq = await client.query("SELECT nextval('eap_case_number_seq') AS val");
    if (parseInt(seq.rows[0].val) >= 1000) ok('Case number sequence works: ' + seq.rows[0].val);
    else fail('Sequence value unexpected: ' + seq.rows[0].val);

    // ── Test indexes ──
    console.log('\n--- TEST: Indexes ---');
    const indexes = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename LIKE 'eap_%' AND indexname LIKE 'idx_%'
       ORDER BY indexname`
    );
    if (indexes.rows.length >= 12) ok(`${indexes.rows.length} indexes created`);
    else fail(`Expected >= 12 indexes, got ${indexes.rows.length}`);

    // ── Test provider geo data ──
    console.log('\n--- TEST: Provider Geo Data ---');
    const geoProviders = await client.query(
      'SELECT full_name, address_city, geo_lat, geo_lng FROM eap_providers WHERE geo_lat IS NOT NULL LIMIT 3'
    );
    geoProviders.rows.forEach(p => {
      console.log(`    ${p.full_name} — ${p.address_city} (${p.geo_lat}, ${p.geo_lng})`);
    });
    if (geoProviders.rows.length > 0) ok('Provider geo-location data present');
    else fail('No providers with geo data');

    // ── Cleanup ──
    console.log('\n--- CLEANUP ---');
    await client.query('DELETE FROM eap_provider_bookings WHERE id = $1', [booking.rows[0].id]);
    await client.query('DELETE FROM eap_sessions WHERE id = $1', [session.rows[0].id]);
    await client.query('DELETE FROM eap_cases WHERE id = $1', [caseId]);
    await client.query('DELETE FROM eap_usage_stats WHERE id = $1', [stats.rows[0].id]);
    ok('Test data cleaned up');

  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\n═══════════════════════════`);
  console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
  console.log(`═══════════════════════════\n`);

  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error('Test error:', e.message);
  pool.end().catch(() => {});
  process.exit(1);
});
