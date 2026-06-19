// Push-token registration — self-scoped upsert + delete, and the push service
// no-ops cleanly when a user has no devices.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');
const pushService = require('../../src/services/pushNotification.service');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-push';

const MARK = 'ZPushTest';
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
let authToken, userId, contractorId;

beforeAll(async () => {
  const u = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active, preferred_language)
     VALUES ($1, 'x', 'Push', 'Tester', true, 'en') RETURNING id`,
    [`${MARK.toLowerCase()}@example.com`]
  );
  userId = u.rows[0].id;
  const c = await query(`INSERT INTO contractors (name, slug) VALUES ($1, $2) RETURNING id`,
    [`${MARK} Co`, `${MARK.toLowerCase()}-co`]);
  contractorId = c.rows[0].id;
  const role = await query(`SELECT id FROM roles WHERE slug = 'superadmin' LIMIT 1`);
  await query(`INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1, $2, $3)`,
    [userId, role.rows[0].id, contractorId]);
  authToken = jwt.sign(
    { userId, email: `${MARK.toLowerCase()}@example.com`, contractorId: null, roles: ['superadmin'] },
    process.env.JWT_SECRET, { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await query('DELETE FROM user_push_tokens WHERE user_id = $1', [userId]).catch(() => {});
  await query('DELETE FROM user_roles WHERE user_id = $1', [userId]).catch(() => {});
  await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  await query('DELETE FROM contractors WHERE id = $1', [contractorId]).catch(() => {});
});

describe('POST/DELETE /push/tokens', () => {
  test('registers a valid Expo token (201) and is idempotent (upsert)', async () => {
    const r1 = await request(app).post('/api/v1/push/tokens')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: TOKEN_A, platform: 'android', deviceName: 'Pixel' });
    expect(r1.status).toBe(201);

    const r2 = await request(app).post('/api/v1/push/tokens')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: TOKEN_A, platform: 'android' });
    expect(r2.status).toBe(201);

    const rows = await query('SELECT count(*)::int AS n FROM user_push_tokens WHERE expo_push_token = $1', [TOKEN_A]);
    expect(rows.rows[0].n).toBe(1); // upsert, not duplicate
  });

  test('rejects an invalid token (400)', async () => {
    const res = await request(app).post('/api/v1/push/tokens')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: 'not-an-expo-token' });
    expect(res.status).toBe(400);
  });

  test('rejects an unauthenticated request (401 auth, or 403 if CSRF runs first)', async () => {
    const res = await request(app).post('/api/v1/push/tokens').send({ token: TOKEN_A });
    // Bearer-authed calls skip CSRF; a no-credentials POST is blocked by whichever
    // guard runs first — CSRF (403, as in CI) or auth (401, CSRF off locally).
    expect([401, 403]).toContain(res.status);
  });

  test('deletes the caller\'s own token', async () => {
    const res = await request(app).delete('/api/v1/push/tokens')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: TOKEN_A });
    expect(res.status).toBe(200);
    const rows = await query('SELECT count(*)::int AS n FROM user_push_tokens WHERE expo_push_token = $1', [TOKEN_A]);
    expect(rows.rows[0].n).toBe(0);
  });
});

describe('pushService.sendToUser', () => {
  test('no-ops (sent 0) when the user has no registered devices', async () => {
    const out = await pushService.sendToUser(userId, {
      type: 'ticket_message', fallbackTitle: 'x', fallbackBody: 'y',
    });
    expect(out).toEqual({ sent: 0 });
  });

  test('returns sent 0 for a null user, never throws', async () => {
    await expect(pushService.sendToUser(null, {})).resolves.toEqual({ sent: 0 });
  });
});
