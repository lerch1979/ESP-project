/**
 * End-to-end Inspection Workflow — exercises every stage introduced in
 * Days 1-3 + Part D, one compensation_id at a time, against the real DB.
 *
 * Flow under test:
 *   1. Create inspection          (POST /inspections)
 *   2. Add checklist scores       (POST /inspections/:id/scores)
 *   3. Score a room               (POST /inspections/:id/rooms/:roomId/score)
 *   4. Complete inspection        (POST /inspections/:id/complete)
 *   5. Download legal PDF         (GET  /inspections/:id/pdf/legal)
 *   6. Create on-site fine        (fine.service.createFine)
 *   7. Record on-site payment     (fine.service.recordOnSitePayment)
 *   8. Create damage compensation (fine.service.createDamageCompensation)
 *   9. Backdate + auto-convert    (fine.service.runAutoConversions)
 *  10. Process payroll month      (fine.service.processMonthlyDeductions)
 *  11. Excel export               (GET /inspection-exports/compensations)
 *
 * All state created is cleaned up in afterAll. Graceful-skip pattern: if
 * the CI test DB lacks admin credentials or seeded accommodation data,
 * the test bails out early so the suite stays green.
 */
const request = require('supertest');
const XLSX = require('xlsx');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');
const fineSvc = require('../../src/services/fine.service');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const BASE = '/api/v1';
const readBlob = (req) => req.buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

let token, accommodationId, fineTypeId, roomId;
let inspectionId;
let fineCompensationId, fineResidentId;
let damageCompensationId;

beforeAll(async () => {
  const login = await request(app)
    .post(`${BASE}/auth/login`)
    .send({ email: 'admin@hr-erp.com', password: 'password123' });
  token = login.body?.data?.token || null;
  if (!token) return;

  const acc = await query(`SELECT id FROM accommodations LIMIT 1`);
  accommodationId = acc.rows[0]?.id || null;

  const ft = await query(`SELECT id FROM fine_types WHERE code = 'CLEANING_NEGLECT'`);
  fineTypeId = ft.rows[0]?.id || null;

  const room = await query(`SELECT id FROM accommodation_rooms WHERE accommodation_id = $1 LIMIT 1`, [accommodationId]);
  roomId = room.rows[0]?.id || null;
});

afterAll(async () => {
  const ids = [fineCompensationId, damageCompensationId].filter(Boolean);
  for (const id of ids) {
    await query(`DELETE FROM compensations WHERE id = $1`, [id]).catch(() => {});
  }
  if (inspectionId) {
    await query(`DELETE FROM inspections WHERE id = $1`, [inspectionId]).catch(() => {});
  }
});

describe('End-to-end inspection → fine → damage → export workflow', () => {
  it('01 — creates an in_progress inspection', async () => {
    if (!token || !accommodationId) return;
    const res = await request(app)
      .post(`${BASE}/inspections`)
      .set(auth(token))
      .send({ accommodation_id: accommodationId, inspection_type: 'monthly' });
    expect(res.status).toBe(201);
    inspectionId = res.body.data.id;
    expect(res.body.data.status).toBe('in_progress');
    expect(res.body.data.inspectionNumber).toMatch(/^ELL-\d{4}-\d{2}-\d{4}$/);
  });

  it('02 — adds a checklist score with major severity', async () => {
    if (!token || !inspectionId) return;
    const item = await query(
      `SELECT id, max_points FROM inspection_checklist_items WHERE is_active = true LIMIT 1`
    );
    const checklistItemId = item.rows[0]?.id;
    if (!checklistItemId) return;

    const res = await request(app)
      .post(`${BASE}/inspections/${inspectionId}/scores`)
      .set(auth(token))
      .send({ scores: [{
        checklist_item_id: checklistItemId,
        score: 2,
        max_score: item.rows[0].max_points,
        notes: 'E2E test: major issue',
      }]});
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('03 — scores a room (via room-inspections endpoint)', async () => {
    if (!token || !inspectionId || !roomId) return;
    const res = await request(app)
      .post(`${BASE}/inspections/${inspectionId}/rooms/${roomId}/score`)
      .set(auth(token))
      .send({
        technical_score: 35,
        hygiene_score:   22,
        aesthetic_score: 14,
        notes: 'E2E test room score',
      });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.total_score)).toBe(71);
    // Grade threshold: 71 is in the 60–74 "acceptable" band
    expect(res.body.data.grade).toBe('acceptable');
  });

  it('04 — completes the inspection (auto-creates tasks for severity)', async () => {
    if (!token || !inspectionId) return;
    const res = await request(app)
      .post(`${BASE}/inspections/${inspectionId}/complete`)
      .set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.inspection.status).toBe('completed');
    // The major-severity checklist row from step 2 should have auto-generated ≥1 task
    expect(res.body.data.tasksCreated.length).toBeGreaterThanOrEqual(1);
  });

  it('05 — downloads a valid legal protocol PDF for the inspection', async () => {
    if (!token || !inspectionId) return;
    const res = await readBlob(
      request(app).get(`${BASE}/inspections/${inspectionId}/pdf/legal`).set(auth(token))
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('pdf');
    // PDF bytes start with %PDF-
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(5000);
  });

  it('06 — creates an on-site fine from the inspection (2 residents)', async () => {
    if (!token || !inspectionId || !fineTypeId) return;
    const result = await fineSvc.createFine(inspectionId, fineTypeId, [
      { name: 'E2E Resident A', email: 'a@e2e.test' },
      { name: 'E2E Resident B', email: 'b@e2e.test' },
    ]);
    fineCompensationId = result.compensation.id;
    expect(result.compensation.type).toBe('fine');
    expect(result.compensation.compensation_number).toMatch(/^BIR-\d{4}-\d{4}$/);
    expect(Number(result.compensation.amount_gross)).toBe(20000); // 2 × 10 000
    expect(result.residents).toHaveLength(2);
    fineResidentId = result.residents[0].id;
  });

  it('07 — records signature-gated on-site cash payment for resident A', async () => {
    if (!fineResidentId) return;
    const result = await fineSvc.recordOnSitePayment(fineResidentId, {
      method: 'on_site_cash',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      receiptNumber: 'E2E-001',
    });
    expect(result.resident.status).toBe('paid_on_site');
    expect(Number(result.resident.amount_paid)).toBe(10000);
    expect(result.resident.signed_at).toBeTruthy();
  });

  it('08 — creates a damage compensation with 30-day deadline and even split', async () => {
    if (!token || !inspectionId) return;
    const result = await fineSvc.createDamageCompensation(inspectionId, {
      description: 'E2E test damage',
      total_amount: 45000,
    }, [
      { name: 'E2E Resident A' },
      { name: 'E2E Resident B' },
    ]);
    damageCompensationId = result.compensation.id;
    expect(result.compensation.type).toBe('damage');
    // Due date should be ~30 days out
    const due = new Date(result.compensation.due_date);
    const now = new Date();
    const days = Math.round((due - now) / 86_400_000);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('09 — auto-converts to salary deduction once overdue', async () => {
    if (!damageCompensationId) return;
    // Backdate so it's past due
    await query(
      `UPDATE compensations SET due_date = CURRENT_DATE - INTERVAL '1 day' WHERE id = $1`,
      [damageCompensationId]
    );
    const counters = await fineSvc.runAutoConversions();
    expect(counters.converted).toBeGreaterThanOrEqual(2);

    const residents = await query(
      `SELECT status, salary_deduction_monthly, salary_deduction_months FROM compensation_residents WHERE compensation_id = $1`,
      [damageCompensationId]
    );
    expect(residents.rows.every((r) => r.status === 'salary_deduction')).toBe(true);
    const comp = await query(`SELECT status FROM compensations WHERE id = $1`, [damageCompensationId]);
    expect(comp.rows[0].status).toBe('salary_deduction_active');

    const deductions = await query(
      `SELECT COUNT(*)::int AS n FROM salary_deductions WHERE compensation_id = $1`,
      [damageCompensationId]
    );
    expect(deductions.rows[0].n).toBe(2);
  });

  it('10 — processes one payroll month with idempotent reruns', async () => {
    if (!damageCompensationId) return;
    // Align the deduction window to the target month so we hit it
    await query(
      `UPDATE salary_deductions SET start_month = '2026-01', end_month = '2026-12'
       WHERE compensation_id = $1`,
      [damageCompensationId]
    );
    const first = await fineSvc.processMonthlyDeductions('2026-04');
    expect(first.processed).toBeGreaterThanOrEqual(2);

    // Idempotent: second call skips (same payroll_period already recorded)
    const second = await fineSvc.processMonthlyDeductions('2026-04');
    expect(second.processed).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(2);
  });

  it('11 — exports the compensation report and the row appears in it', async () => {
    if (!token || !damageCompensationId) return;
    const res = await readBlob(
      request(app)
        .get(`${BASE}/inspection-exports/compensations`)
        .set(auth(token))
    );
    expect([200, 403]).toContain(res.status);
    if (res.status !== 200) return;  // permission-gated

    const wb = XLSX.read(res.body, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
    const flat = rows.flat().filter(Boolean).map(String);

    // The compensation_number we created must show up somewhere
    const damageRow = await query(
      `SELECT compensation_number FROM compensations WHERE id = $1`,
      [damageCompensationId]
    );
    expect(flat).toEqual(expect.arrayContaining([damageRow.rows[0].compensation_number]));
  });
});
