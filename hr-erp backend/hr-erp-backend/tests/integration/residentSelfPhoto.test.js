// Resident profile photo — self-scoped upload / get / delete.
// Proves: a resident can set + read + remove THEIR OWN photo (employees.user_id
// = caller), the photo column is updated, and a caller with no employee row 404s.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-photo';

const MARK = 'ZPhotoTest';
let token, userId, contractorId, employeeId;
let noEmpToken, noEmpUserId;

async function jpeg() {
  return sharp({ create: { width: 12, height: 12, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg().toBuffer();
}

beforeAll(async () => {
  const u = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active)
     VALUES ($1, 'x', 'Photo', 'Tester', true) RETURNING id`,
    [`${MARK.toLowerCase()}@example.com`]
  );
  userId = u.rows[0].id;
  const c = await query(`INSERT INTO contractors (name, slug) VALUES ($1, $2) RETURNING id`,
    [`${MARK} Co`, `${MARK.toLowerCase()}-co`]);
  contractorId = c.rows[0].id;
  const role = await query(`SELECT id FROM roles WHERE slug = 'superadmin' LIMIT 1`);
  await query(`INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3)`,
    [userId, role.rows[0].id, contractorId]);
  const e = await query(
    `INSERT INTO employees (first_name, last_name, user_id) VALUES ($1, 'Tester', $2) RETURNING id`,
    [`${MARK}Emp`, userId]
  );
  employeeId = e.rows[0].id;
  token = jwt.sign({ userId, email: `${MARK.toLowerCase()}@example.com`, contractorId: null, roles: ['superadmin'] },
    process.env.JWT_SECRET, { expiresIn: '1h' });

  // A second user with NO employee row — must 404 on photo ops.
  const u2 = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active)
     VALUES ($1, 'x', 'NoEmp', 'User', true) RETURNING id`,
    [`${MARK.toLowerCase()}-noemp@example.com`]
  );
  noEmpUserId = u2.rows[0].id;
  noEmpToken = jwt.sign({ userId: noEmpUserId, email: `${MARK.toLowerCase()}-noemp@example.com`, contractorId: null, roles: ['superadmin'] },
    process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  if (employeeId) await query('DELETE FROM employees WHERE id = $1', [employeeId]).catch(() => {});
  for (const uid of [userId, noEmpUserId]) {
    if (uid) {
      await query('DELETE FROM user_roles WHERE user_id = $1', [uid]).catch(() => {});
      await query('DELETE FROM users WHERE id = $1', [uid]).catch(() => {});
    }
  }
  if (contractorId) await query('DELETE FROM contractors WHERE id = $1', [contractorId]).catch(() => {});
});

describe('Resident profile photo — self-scoped', () => {
  test('uploads own photo → 200, sets profile_photo_url', async () => {
    const buf = await jpeg();
    const res = await request(app)
      .post('/api/v1/employees/my/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', buf, { filename: 'me.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body?.data?.profile_photo_url).toMatch(/^\/uploads\/employees\/thumb_\d+\.jpg$/);

    const db = await query('SELECT profile_photo_url FROM employees WHERE id = $1', [employeeId]);
    expect(db.rows[0].profile_photo_url).toBe(res.body.data.profile_photo_url);
  });

  test('GET /employees/my returns the photo url', async () => {
    const res = await request(app).get('/api/v1/employees/my').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body?.data?.profile_photo_url).toMatch(/thumb_\d+\.jpg$/);
    expect(res.body.data.id).toBe(employeeId);
  });

  test('deletes own photo → 200, column NULL', async () => {
    const res = await request(app).delete('/api/v1/employees/my/photo').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const db = await query('SELECT profile_photo_url FROM employees WHERE id = $1', [employeeId]);
    expect(db.rows[0].profile_photo_url).toBeNull();
  });

  test('rejects a non-image upload (400)', async () => {
    const res = await request(app)
      .post('/api/v1/employees/my/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('not an image'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  test('a caller with no employee row cannot upload (404)', async () => {
    const buf = await jpeg();
    const res = await request(app)
      .post('/api/v1/employees/my/photo')
      .set('Authorization', `Bearer ${noEmpToken}`)
      .attach('photo', buf, { filename: 'me.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
  });

  test('requires auth (401 or 403)', async () => {
    const res = await request(app).get('/api/v1/employees/my');
    expect([401, 403]).toContain(res.status);
  });
});
