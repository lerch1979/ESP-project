/**
 * Regression: user role writes are ATOMIC (no self-lockout).
 *
 * Reproduces the pre-fix bug: updateUser/updateUserRole did
 * `DELETE user_roles` then `INSERT user_roles` as separate pool queries, so a
 * failure on the INSERT left the user with ZERO roles (locked out of everything)
 * while the endpoint reported success/error inconsistently.
 *
 * updateUser validates roleId as a UUID but does NOT check it exists in `roles`,
 * so a well-formed-but-nonexistent roleId makes the INSERT fail an FK check
 * AFTER the DELETE — the exact half-write window. With the transaction fix the
 * whole thing rolls back and the user keeps their original role.
 *
 * Pure Node, real DB, cleans up after itself. Run: node tests/userRoleTransaction.script.js
 * (needs Postgres up; honors DB_* env / DATABASE_URL).
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const { updateUser, updateUserRole } = require('../src/controllers/user.controller');

const CONTRACTOR = '00000000-0000-0000-0000-000000000001';
const NONEXISTENT_ROLE = 'ffffffff-ffff-4fff-8fff-ffffffffffff'; // valid UUID, not a real role

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

async function rolesOf(userId) {
  const r = await pool.query(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.slug`,
    [userId]
  );
  return r.rows.map(x => x.slug);
}

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

(async () => {
  const email = `roletxn-${Date.now()}@example.com`;
  const taskOwner = await pool.query(`SELECT id FROM roles WHERE slug = 'task_owner'`);
  const admin = await pool.query(`SELECT id FROM roles WHERE slug = 'admin'`);
  const taskOwnerId = taskOwner.rows[0].id;
  const adminId = admin.rows[0].id;

  const ins = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, contractor_id, is_active)
     VALUES ($1, 'x', 'Role', 'Txn', $2, true) RETURNING id`,
    [email, CONTRACTOR]
  );
  const userId = ins.rows[0].id;
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3)`,
    [userId, taskOwnerId, CONTRACTOR]
  );

  try {
    // Baseline
    check('starts with exactly [task_owner]', JSON.stringify(await rolesOf(userId)) === JSON.stringify(['task_owner']));

    // --- Atomicity: failing role INSERT must NOT strip the existing role ---
    let res = mockRes();
    await updateUser(
      { params: { id: userId }, body: { firstName: 'Renamed', roleId: NONEXISTENT_ROLE }, user: { id: userId } },
      res
    );
    check('failed role swap surfaces an error (not silent success)', res.statusCode >= 400);
    const afterFail = await rolesOf(userId);
    check('user still has [task_owner] after failed swap (NO lockout)', JSON.stringify(afterFail) === JSON.stringify(['task_owner']));
    const nameRow = await pool.query('SELECT first_name FROM users WHERE id = $1', [userId]);
    check('profile change rolled back with the failed role swap', nameRow.rows[0].first_name === 'Role');

    // --- Happy path: valid swap persists atomically ---
    res = mockRes();
    await updateUser(
      { params: { id: userId }, body: { firstName: 'Renamed2', roleId: adminId }, user: { id: userId } },
      res
    );
    check('valid swap returns success', res.statusCode === 200 && res.body?.success === true);
    check('role is now exactly [admin]', JSON.stringify(await rolesOf(userId)) === JSON.stringify(['admin']));
    const nameRow2 = await pool.query('SELECT first_name FROM users WHERE id = $1', [userId]);
    check('profile change committed with the successful swap', nameRow2.rows[0].first_name === 'Renamed2');

    // --- updateUserRole happy path ---
    res = mockRes();
    await updateUserRole(
      { params: { id: userId }, body: { roleId: taskOwnerId }, user: { id: userId } },
      res
    );
    check('updateUserRole swaps back to [task_owner]', JSON.stringify(await rolesOf(userId)) === JSON.stringify(['task_owner']));
  } finally {
    await pool.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
