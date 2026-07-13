/**
 * Regression (GAP_AUDIT A3, 2026-07-13): GET /slack/users must NOT 500.
 *
 * The query referenced `u.name` (a column `users` doesn't have — it has
 * first_name/last_name), so the Slack admin page returned a live 500
 * (`column u.name does not exist`). This exercises the real controller query
 * against the DB and asserts it executes and returns success.
 */
require('dotenv').config(); // load local DB creds (no-op in CI where env vars are set directly)
const { getSlackUsers } = require('../src/controllers/slack.controller');
const { pool } = require('../src/database/connection');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('GET /slack/users — A3 regression (users column)', () => {
  afterAll(async () => { await pool.end(); });

  it('runs without the users.name column error and returns { success: true, data: [] }', async () => {
    const res = mockRes();
    // Any contractorId is fine — an empty result still proves the query is valid SQL.
    await getSlackUsers({ user: { contractorId: '00000000-0000-0000-0000-000000000001' } }, res);
    expect(res.statusCode).toBe(200);      // NOT 500
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
