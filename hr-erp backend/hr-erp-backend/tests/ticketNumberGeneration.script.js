/**
 * Regression: ticket creation must not be blocked by a malformed ticket_number.
 *
 * createTicket derives the next number via
 *   MAX(CAST(SUBSTRING(ticket_number FROM 2) AS INTEGER)) + 1
 * over ALL tickets. A single non-canonical number (seed/test data like
 * '#9001-TESZT') makes the CAST fail (Postgres 22P02) and blocks EVERY new
 * ticket. Fix: only aggregate over canonical '#<int>' numbers. Verified in prod
 * logs 2026-07-02 — this was the live "Ticket létrehozási hiba" blocker.
 *
 * Pure Node, real DB, cleans up. Run: node tests/ticketNumberGeneration.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const { createTicket } = require('../src/controllers/ticket.controller');

const CONTRACTOR = '00000000-0000-0000-0000-000000000001';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
let failures = 0;
function check(l, c) { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; }

(async () => {
  const admin = await pool.query(`SELECT id FROM users WHERE email = 'admin@hr-erp.com'`);
  const uid = admin.rows[0].id;

  // Plant the poison row.
  const poison = await pool.query(
    `INSERT INTO tickets (ticket_number, title, contractor_id, created_by)
     VALUES ('#9001-TESZT', 'poison row', $1, $2) RETURNING id`,
    [CONTRACTOR, uid]
  );
  const poisonId = poison.rows[0].id;
  let createdId = null;

  try {
    // 1) Reproduce the bug: the UNFILTERED aggregate throws 22P02 with the poison row.
    let threwCode = null;
    try {
      await pool.query('SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 2) AS INTEGER)), 0) + 1 FROM tickets');
    } catch (e) { threwCode = e.code; }
    check('unfiltered aggregate throws 22P02 with poison row (reproduces the bug)', threwCode === '22P02');

    // 2) The FILTERED aggregate (the fix) succeeds and returns an integer.
    const r = await pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 2) AS INTEGER)), 0) + 1 AS next
       FROM tickets WHERE ticket_number ~ '^#[0-9]+$'`
    );
    check('filtered aggregate succeeds (the fix)', Number.isInteger(Number(r.rows[0].next)));

    // 3) End-to-end: createTicket returns 201 despite the poison row present.
    const res = mockRes();
    await createTicket({ body: { title: 'RegTest ticket' }, user: { id: uid, contractorId: CONTRACTOR } }, res);
    check('createTicket -> 201 despite malformed #9001-TESZT present', res.statusCode === 201);
    const t = res.body?.data?.ticket;
    createdId = t?.id;
    check('generated ticket_number matches ^#[0-9]+$', !!t && /^#[0-9]+$/.test(t.ticket_number));
  } finally {
    if (createdId) {
      await pool.query('DELETE FROM ticket_history WHERE ticket_id = $1', [createdId]).catch(() => {});
      await pool.query('DELETE FROM tickets WHERE id = $1', [createdId]).catch(() => {});
    }
    await pool.query('DELETE FROM ticket_history WHERE ticket_id = $1', [poisonId]).catch(() => {});
    await pool.query('DELETE FROM tickets WHERE id = $1', [poisonId]).catch(() => {});
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
