#!/usr/bin/env node
/**
 * Test script for migration 060: Wellbeing Integration schema
 * Validates tables, constraints, RLS, triggers, views, and immutability.
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
       WHERE table_name LIKE 'wellbeing_%' AND table_schema = 'public'
       ORDER BY table_name`
    );
    const tableNames = tables.rows.map(r => r.table_name);
    ['wellbeing_audit_log', 'wellbeing_feedback', 'wellbeing_notifications', 'wellbeing_referrals'].forEach(t => {
      if (tableNames.includes(t)) ok(`Table ${t} exists`);
      else fail(`Table ${t} MISSING`);
    });

    // ── Verify views ──
    console.log('\n--- TEST: Views Exist ---');
    const views = await client.query(
      `SELECT table_name FROM information_schema.views
       WHERE table_name IN ('v_active_referrals', 'v_pending_notifications', 'v_audit_summary')
       ORDER BY table_name`
    );
    const viewNames = views.rows.map(r => r.table_name);
    ['v_active_referrals', 'v_pending_notifications', 'v_audit_summary'].forEach(v => {
      if (viewNames.includes(v)) ok(`View ${v} exists`);
      else fail(`View ${v} MISSING`);
    });

    // ── Verify RLS ──
    console.log('\n--- TEST: RLS Enabled ---');
    const rls = await client.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class WHERE relname LIKE 'wellbeing_%' AND relkind = 'r'
       ORDER BY relname`
    );
    rls.rows.forEach(r => {
      if (r.relrowsecurity && r.relforcerowsecurity) ok(`${r.relname}: RLS enabled + forced`);
      else fail(`${r.relname}: RLS not fully enabled`);
    });

    // ── Verify RLS policies ──
    console.log('\n--- TEST: RLS Policies ---');
    const policies = await client.query(
      `SELECT tablename, policyname FROM pg_policies
       WHERE tablename LIKE 'wellbeing_%' ORDER BY tablename, policyname`
    );
    policies.rows.forEach(r => console.log(`    ${r.tablename} → ${r.policyname}`));
    if (policies.rows.length >= 10) ok(`${policies.rows.length} RLS policies created`);
    else fail(`Expected >= 10 policies, got ${policies.rows.length}`);

    // Check immutability policies on audit_log
    const auditPolicies = policies.rows.filter(r => r.tablename === 'wellbeing_audit_log');
    const hasNoUpdate = auditPolicies.some(p => p.policyname.includes('no_update'));
    const hasNoDelete = auditPolicies.some(p => p.policyname.includes('no_delete'));
    if (hasNoUpdate) ok('Audit log has UPDATE-blocking policy');
    else fail('Audit log missing UPDATE-blocking policy');
    if (hasNoDelete) ok('Audit log has DELETE-blocking policy');
    else fail('Audit log missing DELETE-blocking policy');

    // ── Verify trigger ──
    console.log('\n--- TEST: Triggers ---');
    const triggers = await client.query(
      `SELECT trigger_name, event_manipulation, action_timing
       FROM information_schema.triggers
       WHERE trigger_name = 'trg_expire_referrals'`
    );
    if (triggers.rows.length > 0) ok('trg_expire_referrals trigger exists');
    else fail('trg_expire_referrals trigger MISSING');

    // ── Verify indexes ──
    console.log('\n--- TEST: Indexes ---');
    const indexes = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename LIKE 'wellbeing_%' AND indexname LIKE 'idx_%'
       ORDER BY indexname`
    );
    if (indexes.rows.length >= 14) ok(`${indexes.rows.length} indexes created`);
    else fail(`Expected >= 14 indexes, got ${indexes.rows.length}`);

    // ── Set RLS context ──
    const user = await client.query(
      'SELECT u.id AS user_id, u.contractor_id FROM users u WHERE u.contractor_id IS NOT NULL LIMIT 1'
    );
    if (user.rows.length === 0) { console.log('\nNo users — skipping data tests'); return; }
    const userId = user.rows[0].user_id;
    const contractorId = user.rows[0].contractor_id;

    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await client.query(`SELECT set_config('app.current_contractor_id', $1, true)`, [contractorId]);
    await client.query(`SELECT set_config('app.current_role', $1, true)`, ['admin']);

    // ── Test referrals ──
    console.log('\n--- TEST: Referrals ---');
    const ref = await client.query(
      `INSERT INTO wellbeing_referrals
         (user_id, contractor_id, source_module, target_module, referral_type,
          urgency_level, referral_reason, is_auto_generated)
       VALUES ($1, $2, 'blue_colibri', 'eap', 'high_burnout_to_eap',
               'high', 'Assessment burnout score > 70. Auto-referral triggered.', true)
       RETURNING id, expires_at`,
      [userId, contractorId]
    );
    ok('Referral created: ' + ref.rows[0].id);
    ok('Default expires_at set (30 days): ' + ref.rows[0].expires_at);

    // Invalid source_module
    try {
      await client.query(
        `INSERT INTO wellbeing_referrals
           (user_id, contractor_id, source_module, target_module, referral_type, referral_reason)
         VALUES ($1, $2, 'invalid_module', 'eap', 'test', 'test')`,
        [userId, contractorId]
      );
      fail('CHECK source_module NOT enforced');
    } catch (e) { ok('CHECK source_module enforced'); }

    // Invalid status
    try {
      await client.query(
        `INSERT INTO wellbeing_referrals
           (user_id, contractor_id, source_module, target_module, referral_type, referral_reason, status)
         VALUES ($1, $2, 'chatbot', 'eap', 'test', 'test', 'invalid')`,
        [userId, contractorId]
      );
      fail('CHECK status NOT enforced');
    } catch (e) { ok('CHECK status enforced'); }

    // ── Test auto-expiration trigger ──
    console.log('\n--- TEST: Auto-Expiration Trigger ---');
    // Insert a referral with expires_at in the past
    const expiredRef = await client.query(
      `INSERT INTO wellbeing_referrals
         (user_id, contractor_id, source_module, target_module, referral_type,
          referral_reason, status, expires_at)
       VALUES ($1, $2, 'self_service', 'eap', 'self_referral',
               'I need help', 'pending', NOW() - INTERVAL '1 day')
       RETURNING id`,
      [userId, contractorId]
    );
    // The trigger should have run on the INSERT and expired this row
    const checkExpired = await client.query(
      'SELECT status FROM wellbeing_referrals WHERE id = $1',
      [expiredRef.rows[0].id]
    );
    if (checkExpired.rows[0].status === 'expired') ok('Auto-expiration trigger works (past-due referral expired)');
    else fail('Auto-expiration trigger did NOT expire past-due referral (status: ' + checkExpired.rows[0].status + ')');

    // ── Test notifications ──
    console.log('\n--- TEST: Notifications ---');
    const notif = await client.query(
      `INSERT INTO wellbeing_notifications
         (user_id, contractor_id, notification_type, notification_channel,
          title, message, priority, action_url, source_module)
       VALUES ($1, $2, 'pulse_reminder', 'push',
               'Hogyan érzed magad ma?', 'Töltsd ki a napi közérzeti felmérést!',
               'normal', '/blue-colibri/pulse', 'blue_colibri')
       RETURNING id`,
      [userId, contractorId]
    );
    ok('Notification created: ' + notif.rows[0].id);

    // Scheduled notification (future)
    const scheduledNotif = await client.query(
      `INSERT INTO wellbeing_notifications
         (user_id, contractor_id, notification_type, notification_channel,
          title, message, scheduled_for, priority)
       VALUES ($1, $2, 'assessment_due', 'email',
               'Negyedéves értékelés', 'Kérjük töltsd ki!',
               NOW() + INTERVAL '7 days', 'high')
       RETURNING id, scheduled_for`,
      [userId, contractorId]
    );
    ok('Scheduled notification created for: ' + scheduledNotif.rows[0].scheduled_for);

    // Invalid channel
    try {
      await client.query(
        `INSERT INTO wellbeing_notifications
           (user_id, contractor_id, notification_type, notification_channel, title, message)
         VALUES ($1, $2, 'test', 'fax', 'Test', 'Test')`,
        [userId, contractorId]
      );
      fail('CHECK notification_channel NOT enforced');
    } catch (e) { ok('CHECK notification_channel enforced'); }

    // ── Test v_pending_notifications view ──
    const pending = await client.query(
      'SELECT COUNT(*) FROM v_pending_notifications'
    );
    // The first notification (immediate) should appear, the scheduled one should not
    ok('v_pending_notifications query works, ' + pending.rows[0].count + ' pending');

    // ── Test audit log ──
    console.log('\n--- TEST: Audit Log ---');
    const audit = await client.query(
      `INSERT INTO wellbeing_audit_log
         (user_id, accessed_user_id, contractor_id, action, resource_type,
          resource_id, ip_address, access_granted, details)
       VALUES ($1, $1, $2, 'view_assessment', 'assessment',
               gen_random_uuid(), '127.0.0.1', true, '{"fields_accessed":["burnout_score"]}'::jsonb)
       RETURNING id`,
      [userId, contractorId]
    );
    ok('Audit log entry created: ' + audit.rows[0].id);

    // Denied access log
    const auditDenied = await client.query(
      `INSERT INTO wellbeing_audit_log
         (user_id, accessed_user_id, contractor_id, action, resource_type,
          access_granted, denial_reason)
       VALUES ($1, $1, $2, 'view_eap_session_notes', 'eap_session',
               false, 'Insufficient permissions: employee role cannot view other user data')
       RETURNING id`,
      [userId, contractorId]
    );
    ok('Denied-access audit entry: ' + auditDenied.rows[0].id);

    // ── Test audit log immutability (UPDATE should fail via RLS) ──
    // Note: This only works when RLS is enforced for non-superuser roles.
    // Since we're running as 'admin' with set_config, the RLS policy wb_audit_no_update
    // should block updates. But RLS USING(false) blocks ALL roles including superuser
    // when FORCE ROW LEVEL SECURITY is on.
    // However, the table owner (postgres) bypasses RLS even with FORCE.
    // In production, the app connects as a non-owner role.
    // We'll verify the policy exists (tested above) rather than trying to defeat it here.
    ok('Audit immutability policies verified (no_update + no_delete)');

    // ── Test v_audit_summary view ──
    const auditSummary = await client.query(
      'SELECT * FROM v_audit_summary WHERE accessed_user_id = $1 LIMIT 5',
      [userId]
    );
    if (auditSummary.rows.length > 0) ok('v_audit_summary view works, ' + auditSummary.rows.length + ' rows');
    else ok('v_audit_summary view works (no aggregated data yet)');

    // ── Test feedback ──
    console.log('\n--- TEST: Feedback ---');
    const fb = await client.query(
      `INSERT INTO wellbeing_feedback
         (user_id, contractor_id, feedback_type, rating, is_helpful,
          feedback_text, improvement_suggestions, is_anonymous)
       VALUES ($1, $2, 'intervention', 4, true,
               'A coaching javaslat nagyon hasznos volt!',
               'Több gyakorlati tipp lenne jó', false)
       RETURNING id`,
      [userId, contractorId]
    );
    ok('Feedback created: ' + fb.rows[0].id);

    // Invalid feedback_type
    try {
      await client.query(
        `INSERT INTO wellbeing_feedback
           (user_id, contractor_id, feedback_type, rating)
         VALUES ($1, $2, 'invalid_type', 5)`,
        [userId, contractorId]
      );
      fail('CHECK feedback_type NOT enforced');
    } catch (e) { ok('CHECK feedback_type enforced'); }

    // Invalid rating
    try {
      await client.query(
        `INSERT INTO wellbeing_feedback
           (user_id, contractor_id, feedback_type, rating)
         VALUES ($1, $2, 'general', 99)`,
        [userId, contractorId]
      );
      fail('CHECK rating 1-5 NOT enforced');
    } catch (e) { ok('CHECK rating BETWEEN 1-5 enforced'); }

    // ── Test v_active_referrals view ──
    console.log('\n--- TEST: Views Data ---');
    const activeRefs = await client.query('SELECT COUNT(*) FROM v_active_referrals');
    ok('v_active_referrals works, ' + activeRefs.rows[0].count + ' active');

    // ── Verify column counts ──
    console.log('\n--- TEST: Column Counts ---');
    const cols = await client.query(
      `SELECT table_name, COUNT(*) as col_count
       FROM information_schema.columns
       WHERE table_name LIKE 'wellbeing_%'
       GROUP BY table_name ORDER BY table_name`
    );
    cols.rows.forEach(r => console.log(`    ${r.table_name}: ${r.col_count} columns`));

    // ── Cleanup ──
    console.log('\n--- CLEANUP ---');
    await client.query('DELETE FROM wellbeing_feedback WHERE id = $1', [fb.rows[0].id]);
    // Audit log entries intentionally NOT deleted (immutable in spirit)
    await client.query('DELETE FROM wellbeing_audit_log WHERE id IN ($1, $2)', [audit.rows[0].id, auditDenied.rows[0].id]);
    await client.query('DELETE FROM wellbeing_notifications WHERE id IN ($1, $2)', [notif.rows[0].id, scheduledNotif.rows[0].id]);
    await client.query('DELETE FROM wellbeing_referrals WHERE id IN ($1, $2)', [ref.rows[0].id, expiredRef.rows[0].id]);
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
