/**
 * Idempotent seed of test worker_specializations so auto-assignment has
 * someone to pick. Picks the first 4 active users and gives them distinct
 * specializations (plumbing, electrical, general, cleaning).
 *
 * Usage:  node scripts/seed_worker_specializations.js
 */
require('dotenv').config();
const { query } = require('../src/database/connection');

const ASSIGNMENTS = ['plumbing', 'electrical', 'general', 'cleaning'];

(async () => {
  const r = await query(
    `SELECT id, first_name, last_name FROM users
     WHERE is_active = TRUE
     ORDER BY created_at ASC
     LIMIT $1`,
    [ASSIGNMENTS.length]
  );

  if (r.rows.length < ASSIGNMENTS.length) {
    console.warn(`Only ${r.rows.length} users available; some specs will go unseeded.`);
  }

  for (let i = 0; i < r.rows.length; i++) {
    const u = r.rows[i];
    const spec = ASSIGNMENTS[i];
    await query(
      `INSERT INTO worker_specializations (user_id, specialization, is_active, is_primary)
       VALUES ($1, $2, TRUE, TRUE)
       ON CONFLICT (user_id, specialization) DO UPDATE
         SET is_active = TRUE, is_primary = TRUE, updated_at = NOW()`,
      [u.id, spec]
    );
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
    console.log(`  ${name || u.id.slice(0,8)} → ${spec}`);
  }

  const cnt = await query(`SELECT COUNT(*)::int AS n FROM worker_specializations WHERE is_active = TRUE`);
  console.log(`\nActive worker_specializations: ${cnt.rows[0].n}`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
