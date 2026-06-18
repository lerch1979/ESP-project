// Resident calendar .ics export — self-scoped, one-way.
// Proves: a resident can export their OWN event as a valid VEVENT, and CANNOT
// export an event that isn't theirs (404). Uses an employee-based event (checkin)
// so no ticket FK seeding is needed.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-calics';

const MARK = 'ZCalIcsTest';
let authToken, userId, contractorId, employeeId, shiftId;

beforeAll(async () => {
  const u = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active)
     VALUES ($1, 'x', 'Cal', 'Tester', true) RETURNING id`,
    [`${MARK.toLowerCase()}@example.com`]
  );
  userId = u.rows[0].id;
  const c = await query(`INSERT INTO contractors (name, slug) VALUES ($1, $2) RETURNING id`,
    [`${MARK} Co`, `${MARK.toLowerCase()}-co`]);
  contractorId = c.rows[0].id;
  const role = await query(`SELECT id FROM roles WHERE slug = 'superadmin' LIMIT 1`);
  await query(`INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3)`,
    [userId, role.rows[0].id, contractorId]);
  // Employee linked to the user, with an arrival_date inside the agenda window.
  const e = await query(
    `INSERT INTO employees (first_name, last_name, user_id, arrival_date)
     VALUES ($1, 'Tester', $2, (CURRENT_DATE + INTERVAL '30 days')) RETURNING id`,
    [`${MARK}Emp`, userId]
  );
  employeeId = e.rows[0].id;
  // A shift for THIS employee, inside the agenda window → exportable .ics.
  const s = await query(
    `INSERT INTO shifts (employee_id, shift_date, shift_start_time, shift_end_time, shift_type)
     VALUES ($1, (CURRENT_DATE + INTERVAL '10 days'), '08:00', '16:00', 'morning') RETURNING id`,
    [employeeId]
  );
  shiftId = s.rows[0].id;
  authToken = jwt.sign(
    { userId, email: `${MARK.toLowerCase()}@example.com`, contractorId: null, roles: ['superadmin'] },
    process.env.JWT_SECRET, { expiresIn: '1h' }
  );
});

afterAll(async () => {
  if (shiftId) await query('DELETE FROM shifts WHERE id = $1', [shiftId]).catch(() => {});
  if (employeeId) await query('DELETE FROM employees WHERE id = $1', [employeeId]).catch(() => {});
  if (userId) {
    await query('DELETE FROM user_roles WHERE user_id = $1', [userId]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
  if (contractorId) await query('DELETE FROM contractors WHERE id = $1', [contractorId]).catch(() => {});
});

describe('GET /calendar/my/:type/:id.ics — self-scoped one-way export', () => {
  test('exports the resident\'s OWN check-in event as a valid VEVENT', async () => {
    const res = await request(app)
      .get(`/api/v1/calendar/my/checkin/${employeeId}.ics`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    const ics = res.text;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain(`UID:checkin-${employeeId}@housingsolutions.hu`);
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
    expect(ics).toContain('END:VCALENDAR');
  });

  test('cannot export an employee event that is not the caller\'s own (→ 404)', async () => {
    const res = await request(app)
      .get('/api/v1/calendar/my/checkin/99999999-9999-9999-9999-999999999999.ics')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });

  test('cannot export a ticket that is not the caller\'s own (→ 404)', async () => {
    const res = await request(app)
      .get('/api/v1/calendar/my/ticket_deadline/99999999-9999-9999-9999-999999999999.ics')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });

  test('exports the resident\'s OWN shift as a valid VEVENT', async () => {
    const res = await request(app)
      .get(`/api/v1/calendar/my/shift/${shiftId}.ics`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    const ics = res.text;
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain(`UID:shift-${shiftId}@housingsolutions.hu`);
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
  });

  test('cannot export a shift that is not the caller\'s own (→ 404)', async () => {
    const res = await request(app)
      .get('/api/v1/calendar/my/shift/99999999-9999-9999-9999-999999999999.ics')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });
});
