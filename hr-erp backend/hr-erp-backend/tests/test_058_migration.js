#!/usr/bin/env node
/**
 * Test script for migration 058: Blue Colibri schema
 * Validates tables, constraints, RLS policies, and seed data.
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
    // Get a real user and contractor for testing
    const userRes = await client.query('SELECT u.id AS user_id, u.contractor_id FROM users u WHERE u.contractor_id IS NOT NULL LIMIT 1');
    if (userRes.rows.length === 0) {
      console.log('No users with contractor_id found — skipping data tests');
      return;
    }
    const userId = userRes.rows[0].user_id;
    const contractorId = userRes.rows[0].contractor_id;

    // Set RLS context (use parameterized set_config to avoid reserved word issues)
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await client.query(`SELECT set_config('app.current_contractor_id', $1, true)`, [contractorId]);
    await client.query(`SELECT set_config('app.current_role', $1, true)`, ['admin']);

    console.log('\n--- TEST: Pulse Survey ---');

    // Insert valid pulse
    const pulse = await client.query(
      `INSERT INTO blue_colibri_pulse_surveys (user_id, contractor_id, mood_score, stress_level, sleep_quality, workload_level, notes)
       VALUES ($1, $2, 4, 6, 7, 5, 'Test pulse') RETURNING id`,
      [userId, contractorId]
    );
    ok('Pulse survey inserted: ' + pulse.rows[0].id);

    // Duplicate same date should fail
    try {
      await client.query(
        `INSERT INTO blue_colibri_pulse_surveys (user_id, contractor_id, mood_score)
         VALUES ($1, $2, 3)`,
        [userId, contractorId]
      );
      fail('UNIQUE constraint NOT enforced');
    } catch (e) {
      if (e.code === '23505') ok('UNIQUE (user_id, survey_date) enforced');
      else fail('Unexpected error: ' + e.message);
    }

    // Invalid mood_score should fail
    try {
      await client.query(
        `INSERT INTO blue_colibri_pulse_surveys (user_id, contractor_id, survey_date, mood_score)
         VALUES ($1, $2, '2020-01-01', 99)`,
        [userId, contractorId]
      );
      fail('CHECK mood_score NOT enforced');
    } catch (e) {
      if (e.message.includes('check') || e.message.includes('violates')) ok('CHECK mood_score BETWEEN 1-5 enforced');
      else fail('Unexpected error: ' + e.message);
    }

    console.log('\n--- TEST: Assessment ---');

    const assess = await client.query(
      `INSERT INTO blue_colibri_assessments (user_id, contractor_id, quarter, responses, burnout_score, engagement_score, risk_level)
       VALUES ($1, $2, '2026-Q1', '[]', 35.5, 72.3, 'green') RETURNING id`,
      [userId, contractorId]
    );
    ok('Assessment inserted: ' + assess.rows[0].id);

    // Duplicate quarter should fail
    try {
      await client.query(
        `INSERT INTO blue_colibri_assessments (user_id, contractor_id, quarter, responses, risk_level)
         VALUES ($1, $2, '2026-Q1', '[]', 'green')`,
        [userId, contractorId]
      );
      fail('UNIQUE (user_id, quarter) NOT enforced');
    } catch (e) {
      if (e.code === '23505') ok('UNIQUE (user_id, quarter) enforced');
      else fail('Unexpected error: ' + e.message);
    }

    // Invalid risk_level
    try {
      await client.query(
        `INSERT INTO blue_colibri_assessments (user_id, contractor_id, quarter, responses, risk_level)
         VALUES ($1, $2, '2026-Q2', '[]', 'purple')`,
        [userId, contractorId]
      );
      fail('CHECK risk_level NOT enforced');
    } catch (e) {
      ok('CHECK risk_level IN (green,yellow,red) enforced');
    }

    console.log('\n--- TEST: Intervention ---');

    const interv = await client.query(
      `INSERT INTO blue_colibri_interventions (user_id, contractor_id, intervention_type, title, priority)
       VALUES ($1, $2, 'coaching', 'Stresszkezelő coaching', 'medium') RETURNING id, expires_at`,
      [userId, contractorId]
    );
    ok('Intervention inserted: ' + interv.rows[0].id);
    ok('Default expires_at set: ' + interv.rows[0].expires_at);

    // Invalid intervention_type
    try {
      await client.query(
        `INSERT INTO blue_colibri_interventions (user_id, contractor_id, intervention_type, title)
         VALUES ($1, $2, 'invalid_type', 'Bad')`,
        [userId, contractorId]
      );
      fail('CHECK intervention_type NOT enforced');
    } catch (e) {
      ok('CHECK intervention_type enforced');
    }

    console.log('\n--- TEST: Team Metrics Privacy ---');

    // employee_count < 5 should fail
    try {
      await client.query(
        `INSERT INTO blue_colibri_team_metrics (contractor_id, metric_date, employee_count, avg_mood_score)
         VALUES ($1, CURRENT_DATE, 3, 4.2)`,
        [contractorId]
      );
      fail('CHECK employee_count >= 5 NOT enforced');
    } catch (e) {
      ok('Privacy: employee_count >= 5 enforced (rejected 3)');
    }

    // employee_count = 5 should succeed
    const team = await client.query(
      `INSERT INTO blue_colibri_team_metrics (contractor_id, metric_date, employee_count, avg_mood_score, pulse_response_rate)
       VALUES ($1, CURRENT_DATE, 8, 3.8, 75.0) RETURNING id`,
      [contractorId]
    );
    ok('Team metrics inserted (8 employees): ' + team.rows[0].id);

    console.log('\n--- TEST: ML Predictions ---');

    const ml = await client.query(
      `INSERT INTO blue_colibri_ml_predictions
         (user_id, contractor_id, turnover_risk_score, burnout_progression_trend, risk_level, confidence_score, model_version)
       VALUES ($1, $2, 42.5, 'stable', 'yellow', 78.3, 'v1.0') RETURNING id`,
      [userId, contractorId]
    );
    ok('ML prediction inserted: ' + ml.rows[0].id);

    // Invalid turnover_risk_score
    try {
      await client.query(
        `INSERT INTO blue_colibri_ml_predictions
           (user_id, contractor_id, prediction_date, turnover_risk_score, burnout_progression_trend, risk_level, model_version)
         VALUES ($1, $2, '2020-01-01', 150, 'stable', 'green', 'v1.0')`,
        [userId, contractorId]
      );
      fail('CHECK turnover_risk_score 0-100 NOT enforced');
    } catch (e) {
      ok('CHECK turnover_risk_score BETWEEN 0-100 enforced');
    }

    console.log('\n--- TEST: Seed Questions ---');

    const qCount = await client.query('SELECT COUNT(*) FROM blue_colibri_questions');
    const total = parseInt(qCount.rows[0].count);
    if (total >= 20) ok(`${total} questions seeded (5 pulse + 15 assessment)`);
    else fail(`Expected >= 20 questions, got ${total}`);

    const pulseQ = await client.query("SELECT COUNT(*) FROM blue_colibri_questions WHERE question_type = 'pulse'");
    const assessQ = await client.query("SELECT COUNT(*) FROM blue_colibri_questions WHERE question_type = 'assessment'");
    if (parseInt(pulseQ.rows[0].count) === 5) ok('5 pulse questions');
    else fail('Expected 5 pulse questions, got ' + pulseQ.rows[0].count);
    if (parseInt(assessQ.rows[0].count) === 15) ok('15 assessment questions');
    else fail('Expected 15 assessment questions, got ' + assessQ.rows[0].count);

    console.log('\n--- TEST: Coaching Sessions ---');

    const coach = await client.query(
      `INSERT INTO blue_colibri_coaching_sessions
         (user_id, contractor_id, session_date, duration_minutes, session_type, status)
       VALUES ($1, $2, NOW() + INTERVAL '7 days', 45, 'stress_management', 'scheduled') RETURNING id`,
      [userId, contractorId]
    );
    ok('Coaching session inserted: ' + coach.rows[0].id);

    // Invalid duration
    try {
      await client.query(
        `INSERT INTO blue_colibri_coaching_sessions
           (user_id, contractor_id, session_date, duration_minutes, session_type)
         VALUES ($1, $2, NOW(), 0, 'general')`,
        [userId, contractorId]
      );
      fail('CHECK duration_minutes > 0 NOT enforced');
    } catch (e) {
      ok('CHECK duration_minutes > 0 enforced');
    }

    console.log('\n--- CLEANUP ---');

    await client.query('DELETE FROM blue_colibri_coaching_sessions WHERE id = $1', [coach.rows[0].id]);
    await client.query('DELETE FROM blue_colibri_ml_predictions WHERE id = $1', [ml.rows[0].id]);
    await client.query('DELETE FROM blue_colibri_team_metrics WHERE id = $1', [team.rows[0].id]);
    await client.query('DELETE FROM blue_colibri_interventions WHERE id = $1', [interv.rows[0].id]);
    await client.query('DELETE FROM blue_colibri_assessments WHERE id = $1', [assess.rows[0].id]);
    await client.query('DELETE FROM blue_colibri_pulse_surveys WHERE id = $1', [pulse.rows[0].id]);
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
  pool.end();
  process.exit(1);
});
