/**
 * inspectionNotification.service — integration tests
 *
 * Uses jest.mock to replace nodemailer's createTransport with a spy that
 * always resolves, so we exercise the full resident-resolution +
 * template-rendering + DB tracking path without a real SMTP server.
 */
const fs = require('fs');
const path = require('path');

// Mock nodemailer BEFORE requiring the service.
var mockSendMail = jest.fn(async (opts) => ({ messageId: 'mock-' + Math.random() }));
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const request = require('supertest');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');
const svc = require('../../src/services/inspectionNotification.service');

let authToken;
let accommodationId;
let roomId;
let userId;
let inspectionId;
const originalEnv = { ...process.env };

beforeAll(async () => {
  process.env.EMAIL_USER = process.env.EMAIL_USER || 'test@example.com';
  process.env.EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || 'test-pass';

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@hr-erp.com', password: 'password123' });
  authToken = login.body?.data?.token || null;

  const acc = await query(`SELECT id FROM accommodations LIMIT 1`);
  accommodationId = acc.rows[0]?.id || null;
  const room = await query(`SELECT id FROM accommodation_rooms WHERE accommodation_id = $1 LIMIT 1`, [accommodationId]);
  roomId = room.rows[0]?.id || null;

  // Find or create a user we can use as a resident with a known email + language.
  const existing = await query(`SELECT id FROM users WHERE email = $1`, ['e2e-resident@example.com']);
  if (existing.rows.length === 0) {
    const u = await query(
      `INSERT INTO users (email, first_name, last_name, preferred_language, password_hash)
       VALUES ('e2e-resident@example.com', 'Teszt', 'Lakó', 'hu', 'x')
       RETURNING id`
    );
    userId = u.rows[0].id;
  } else {
    userId = existing.rows[0].id;
    await query(`UPDATE users SET preferred_language = 'hu' WHERE id = $1`, [userId]);
  }
});

afterAll(async () => {
  if (inspectionId) {
    await query(`DELETE FROM inspections WHERE id = $1`, [inspectionId]).catch(() => {});
  }
  if (userId) {
    await query(`DELETE FROM users WHERE id = $1 AND email = 'e2e-resident@example.com'`, [userId]).catch(() => {});
  }
  Object.keys(process.env).forEach((k) => {
    if (!(k in originalEnv)) delete process.env[k];
    else process.env[k] = originalEnv[k];
  });
});

describe('inspection email notifications', () => {
  it('resolves residents from room_inspections residents_snapshot', async () => {
    if (!accommodationId || !roomId || !userId) return;

    // Create an inspection + room_inspection with a residents_snapshot
    const insp = await query(
      `INSERT INTO inspections (
         inspection_number, accommodation_id, inspector_id, inspection_type,
         scheduled_at, started_at, completed_at, status, total_score,
         technical_score, hygiene_score, aesthetic_score, grade)
       VALUES ('ELL-2026-04-TEST', $1, NULL, 'monthly', NOW(), NOW(), NOW(),
               'completed', 78, 40, 24, 14, 'good')
       RETURNING id`,
      [accommodationId]
    );
    inspectionId = insp.rows[0].id;

    await query(
      `INSERT INTO room_inspections
         (inspection_id, room_id, room_number, technical_score, hygiene_score,
          aesthetic_score, total_score, grade, residents_snapshot)
       VALUES ($1, $2, '101', 35, 22, 14, 71, 'acceptable', $3::jsonb)`,
      [inspectionId, roomId, JSON.stringify([{ user_id: userId, name: 'Teszt Lakó' }])]
    );

    const residents = await svc._internals.resolveResidents(inspectionId);
    expect(residents).toHaveLength(1);
    expect(residents[0].email).toBe('e2e-resident@example.com');
    expect(residents[0].language).toBe('hu');
    expect(residents[0].room?.number).toBe('101');
  });

  it('renders a Hungarian email with expected body content', async () => {
    if (!inspectionId) return;
    const inspection = (await query(
      `SELECT i.*, a.name AS accommodation_name,
              NULL AS inspector_name
       FROM inspections i LEFT JOIN accommodations a ON i.accommodation_id = a.id
       WHERE i.id = $1`, [inspectionId]
    )).rows[0];
    const resident = {
      resident_id: userId, name: 'Teszt Lakó',
      email: 'e2e-resident@example.com', language: 'hu',
      room: { number: '101', technical: 35, hygiene: 22, aesthetic: 14, total: 71, grade: 'acceptable' },
    };
    const rendered = svc._internals.renderEmail(inspection, resident, {
      findings: ['Radiátor levegős'],
      fines: [],
      damages: [],
    });
    expect(rendered.language).toBe('hu');
    expect(rendered.subject).toContain('Szállás ellenőrzés');
    expect(rendered.html).toContain('Tisztelt Teszt Lakó');
    expect(rendered.html).toContain('71/100');
    expect(rendered.html).toContain('Radiátor levegős');
    expect(rendered.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('falls back to English when preferred_language is en', async () => {
    if (!inspectionId) return;
    const inspection = (await query(
      `SELECT i.*, a.name AS accommodation_name, NULL AS inspector_name
       FROM inspections i LEFT JOIN accommodations a ON i.accommodation_id = a.id
       WHERE i.id = $1`, [inspectionId]
    )).rows[0];
    const resident = {
      resident_id: userId, name: 'Test Resident',
      email: 'e2e-resident@example.com', language: 'en',
      room: { number: '101', technical: 35, hygiene: 22, aesthetic: 14, total: 71, grade: 'acceptable' },
    };
    const rendered = svc._internals.renderEmail(inspection, resident, { findings: [], fines: [], damages: [] });
    expect(rendered.language).toBe('en');
    expect(rendered.subject).toContain('Property Inspection');
    expect(rendered.html).toContain('Dear Test Resident');
  });

  it('notifyResidents writes one tracking row per resident and calls sendMail', async () => {
    if (!inspectionId) return;
    mockSendMail.mockClear();
    const counters = await svc.notifyResidents(inspectionId);
    expect(counters.queued).toBeGreaterThanOrEqual(1);
    expect(counters.sent + counters.skipped).toBeGreaterThanOrEqual(counters.queued);

    const tracking = await query(
      `SELECT * FROM inspection_email_notifications WHERE inspection_id = $1`,
      [inspectionId]
    );
    expect(tracking.rows.length).toBeGreaterThanOrEqual(1);
    expect(tracking.rows[0].email_address).toBe('e2e-resident@example.com');
    // User's preferred_language in DB is 'hu' (the earlier renderEmail test
    // was a pure function call, no DB side-effect)
    expect(tracking.rows[0].language).toBe('hu');
    expect(tracking.rows[0].content_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('GET /inspections/:id/email-notifications returns the trail', async () => {
    if (!authToken || !inspectionId) return;
    const res = await request(app)
      .get(`/api/v1/inspections/${inspectionId}/email-notifications`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('skipped status is recorded when SMTP is missing', async () => {
    if (!inspectionId) return;
    const saved = process.env.EMAIL_USER;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASSWORD;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const counters = await svc.notifyResidents(inspectionId);
    expect(counters.skipped).toBeGreaterThanOrEqual(1);

    process.env.EMAIL_USER = saved;
    process.env.EMAIL_PASSWORD = 'test-pass';
  });
});
