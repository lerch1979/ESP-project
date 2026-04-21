/**
 * Inspection API — Integration Tests
 * Covers the full happy-path workflow:
 *   create draft → add scores → complete → verify grade + auto-tasks
 * Plus template endpoints for categories and checklist items.
 */
const request = require('supertest');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');

let authToken;
let accommodationId;
let checklistItemId;
let checklistMaxPoints;

beforeAll(async () => {
  // Login as admin (seeded in 061_comprehensive_seed_data)
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@hr-erp.com', password: 'password123' });
  authToken = login.body?.data?.token || null;

  // Get a real accommodation id (seeded in earlier migrations)
  const accRes = await query(`SELECT id FROM accommodations LIMIT 1`);
  accommodationId = accRes.rows[0]?.id || null;

  // Get a seeded checklist item (from migration 086)
  const itemRes = await query(
    `SELECT id, max_points FROM inspection_checklist_items WHERE is_active = true LIMIT 1`
  );
  checklistItemId = itemRes.rows[0]?.id || null;
  checklistMaxPoints = itemRes.rows[0]?.max_points || 10;
});

describe('Inspection Templates', () => {
  // Tests fall back to graceful skip if the test DB wasn't seeded with an
  // admin user (same pattern as tests/integration/auth.test.js). CI only
  // runs migrations, not seeds, so login may 401 on a fresh DB.

  it('GET /inspection-templates/categories returns the 3 seeded categories', async () => {
    if (!authToken) return; // DB unseeded — graceful skip
    const res = await request(app)
      .get('/api/v1/inspection-templates/categories')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    const codes = res.body.data.map(c => c.code);
    expect(codes).toEqual(expect.arrayContaining(['TECHNICAL', 'HYGIENE', 'AESTHETIC']));
  });

  it('GET /inspection-templates/items returns seeded checklist items', async () => {
    if (!authToken) return;
    const res = await request(app)
      .get('/api/v1/inspection-templates/items')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(13);
  });
});

describe('Inspection Workflow (happy path)', () => {
  // Shared state between tests
  let inspectionId;

  it('POST /inspections creates a draft', async () => {
    if (!accommodationId) return; // skip if DB has no accommodations

    const res = await request(app)
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accommodation_id: accommodationId,
        inspection_type: 'monthly',
        gps_latitude: 47.4979,
        gps_longitude: 19.0402,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('in_progress');
    expect(res.body.data.inspectionNumber).toMatch(/^ELL-\d{4}-\d{2}-\d{4}$/);
    inspectionId = res.body.data.id;
  });

  it('POST /inspections/:id/scores records a low score and flags severity', async () => {
    if (!inspectionId || !checklistItemId) return;

    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/scores`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        scores: [
          {
            checklist_item_id: checklistItemId,
            score: 1,              // 10% of max — should be 'critical'
            max_score: checklistMaxPoints,
            notes: 'Teszt: kritikus sérülés',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data[0].severity).toBe('critical');
  });

  it('POST /inspections/:id/complete finalizes + creates auto-tasks', async () => {
    if (!inspectionId) return;

    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.inspection.status).toBe('completed');
    expect(res.body.data.inspection.totalScore).toBeGreaterThanOrEqual(0);
    expect(res.body.data.inspection.grade).toMatch(/^(excellent|good|acceptable|poor|bad|critical)$/);
    // A critical-severity score should have spawned an emergency task
    expect(res.body.data.tasksCreated.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.tasksCreated[0].priority).toBe('emergency');
  });

  it('POST /inspections/:id/complete is idempotent-safe (409 on re-complete)', async () => {
    if (!inspectionId) return;
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(409);
  });

  it('GET /inspections/:id returns the full detail with scores + tasks', async () => {
    if (!inspectionId) return;
    const res = await request(app)
      .get(`/api/v1/inspections/${inspectionId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.scores.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /inspections (list) includes the created inspection', async () => {
    if (!inspectionId) return;
    const res = await request(app)
      .get('/api/v1/inspections?limit=5')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some(i => i.id === inspectionId)).toBe(true);
  });

  it('DELETE /inspections/:id refuses when status=completed', async () => {
    if (!inspectionId) return;
    const res = await request(app)
      .delete(`/api/v1/inspections/${inspectionId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(409);

    // Clean up: delete via SQL (post-completion)
    await query(`DELETE FROM inspections WHERE id = $1`, [inspectionId]);
  });
});

describe('Inspection validation', () => {
  it('POST /inspections requires accommodation_id', async () => {
    if (!authToken) return;
    const res = await request(app)
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ inspection_type: 'monthly' });
    expect(res.status).toBe(400);
  });

  it('POST /inspections rejects invalid type', async () => {
    if (!authToken || !accommodationId) return;
    const res = await request(app)
      .post('/api/v1/inspections')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ accommodation_id: accommodationId, inspection_type: 'nonsense' });
    expect(res.status).toBe(400);
  });
});
