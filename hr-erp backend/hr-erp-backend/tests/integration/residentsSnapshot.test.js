/**
 * residents_snapshot shape — regression test.
 *
 * Before the fix the snapshot stored only { name, user_id, move_in_date }
 * AND the user_id was actually an employees.id, not a users.id. That made
 * the email notifier silently skip every resident because it couldn't
 * find a matching users row.
 *
 * This test creates an employee in a test room, scores that room through
 * the controller, and asserts the new-shape fields are present and
 * correct.
 */
const request = require('supertest');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');

let authToken;
let accommodationId, roomId, userId, employeeId, inspectionId;

beforeAll(async () => {
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@hr-erp.com', password: 'password123' });
  authToken = login.body?.data?.token || null;

  const acc = await query(`SELECT id FROM accommodations LIMIT 1`);
  accommodationId = acc.rows[0]?.id || null;
  const rm = await query(`SELECT id FROM accommodation_rooms WHERE accommodation_id = $1 LIMIT 1`, [accommodationId]);
  roomId = rm.rows[0]?.id || null;

  // Seed a user + employee pair pinned to roomId.
  const u = await query(
    `INSERT INTO users (email, first_name, last_name, preferred_language, password_hash)
     VALUES ('snap-test@example.com', 'Snap', 'Teszt', 'tl', 'x')
     ON CONFLICT (email) DO UPDATE SET preferred_language = EXCLUDED.preferred_language
     RETURNING id`
  );
  userId = u.rows[0].id;

  // employees has a unique (first_name, last_name) in some DBs — cheap
  // insert, rely on our afterAll cleanup.
  const e = await query(
    `INSERT INTO employees (first_name, last_name, personal_email, user_id, room_id)
     VALUES ('Snap', 'Teszt', 'snap-test-personal@example.com', $1, $2)
     RETURNING id`,
    [userId, roomId]
  );
  employeeId = e.rows[0].id;
});

afterAll(async () => {
  if (inspectionId) await query(`DELETE FROM inspections WHERE id = $1`, [inspectionId]).catch(() => {});
  if (employeeId)  await query(`DELETE FROM employees WHERE id = $1`,  [employeeId]).catch(() => {});
  if (userId)      await query(`DELETE FROM users WHERE id = $1`,      [userId]).catch(() => {});
});

describe('scoreRoom builds residents_snapshot with email + language', () => {
  it('stores employee_id, user_id, email, language in the snapshot', async () => {
    if (!authToken || !accommodationId || !roomId) return;

    // 1. Create an inspection
    const created = await request(app)
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ accommodation_id: accommodationId, inspection_type: 'monthly' });
    expect(created.status).toBe(201);
    inspectionId = created.body.data.id;

    // 2. Score the room
    const scored = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/rooms/${roomId}/score`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ technical_score: 40, hygiene_score: 25, aesthetic_score: 15 });
    expect(scored.status).toBe(200);

    // 3. Read back the raw snapshot
    const r = await query(
      `SELECT residents_snapshot FROM room_inspections
       WHERE inspection_id = $1 AND room_id = $2`,
      [inspectionId, roomId]
    );
    const snap = r.rows[0].residents_snapshot;
    expect(Array.isArray(snap)).toBe(true);

    // Find our test employee's row in the snapshot
    const me = snap.find((s) => s.employee_id === employeeId);
    expect(me).toBeTruthy();
    expect(me.user_id).toBe(userId);
    expect(me.name).toBe('Snap Teszt');
    expect(me.email).toBe('snap-test-personal@example.com'); // personal_email wins
    expect(me.language).toBe('tl');
    expect(me.move_in_date).toBeTruthy();
  });

  it('falls back to users.email when personal_email is empty', async () => {
    if (!employeeId) return;
    // Blank out personal_email so the COALESCE must fall through.
    await query(`UPDATE employees SET personal_email = '' WHERE id = $1`, [employeeId]);

    const created = await request(app)
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ accommodation_id: accommodationId, inspection_type: 'monthly' });
    const ins2 = created.body.data.id;

    await request(app)
      .post(`/api/v1/inspections/${ins2}/rooms/${roomId}/score`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ technical_score: 40, hygiene_score: 25, aesthetic_score: 15 });

    const r = await query(
      `SELECT residents_snapshot FROM room_inspections WHERE inspection_id = $1 AND room_id = $2`,
      [ins2, roomId]
    );
    const me = (r.rows[0].residents_snapshot || []).find((s) => s.employee_id === employeeId);
    expect(me.email).toBe('snap-test@example.com');  // users.email fallback

    await query(`DELETE FROM inspections WHERE id = $1`, [ins2]).catch(() => {});
    // restore for other tests
    await query(`UPDATE employees SET personal_email = 'snap-test-personal@example.com' WHERE id = $1`, [employeeId]);
  });
});
