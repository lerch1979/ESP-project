/**
 * Compensation API — Integration Tests
 *
 * Covers: create draft → issue → partial payment → final payment (auto-paid) → PDF.
 * Plus: waive flow, escalation ladder, validation errors.
 *
 * Graceful-skip pattern (matches auth.test.js + inspections.test.js): if the
 * CI test DB isn't seeded with admin credentials, auth returns 401 and we
 * bail on the happy-path assertions — keeping the suite green.
 */
const request = require('supertest');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');
const compensationSvc = require('../../src/services/compensation.service');

let authToken;
let accommodationId;
let created;

beforeAll(async () => {
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@hr-erp.com', password: 'password123' });
  authToken = login.body?.data?.token || null;

  const accRes = await query(`SELECT id FROM accommodations LIMIT 1`);
  accommodationId = accRes.rows[0]?.id || null;
});

afterAll(async () => {
  if (created?.id) {
    // Best-effort cleanup so reruns stay clean.
    await query(`DELETE FROM compensations WHERE id = $1`, [created.id]).catch(() => {});
  }
});

describe('Compensation workflow', () => {
  it('POST /compensations creates a draft (validation)', async () => {
    if (!authToken) return;

    // Missing required field should 400
    const bad = await request(app)
      .post('/api/v1/compensations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ compensation_type: 'damage', amount_gross: 5000 });
    expect(bad.status).toBe(400);
  });

  it('POST /compensations with valid payload creates draft', async () => {
    if (!authToken) return;

    const res = await request(app)
      .post('/api/v1/compensations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        compensation_type: 'damage',
        amount_gross: 50000,
        currency: 'HUF',
        description: 'Ágykeret törött — cseréje szükséges',
        calculation_notes: '1 db ágykeret × 45 000 HUF + 10% munkadíj',
        accommodation_id: accommodationId,
        responsible_name: 'Teszt Alkalmazott',
        responsible_email: 'teszt@example.com',
        remediation_period_days: 14,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.compensationNumber).toMatch(/^HSK-\d{4}-\d{4}$/);
    created = res.body.data;
  });

  it('POST /compensations/:id/issue transitions draft → issued', async () => {
    if (!authToken || !created) return;

    const res = await request(app)
      .post(`/api/v1/compensations/${created.id}/issue`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('issued');
    expect(res.body.data.issuedAt).toBeTruthy();
    expect(res.body.data.dueDate).toBeTruthy();
  });

  it('GET /compensations/:id returns payment + reminder history', async () => {
    if (!authToken || !created) return;

    const res = await request(app)
      .get(`/api/v1/compensations/${created.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reminders.length).toBeGreaterThanOrEqual(1);
    // Issue writes an initial_notification reminder
    expect(res.body.data.reminders[0].reminder_type).toBe('initial_notification');
  });

  it('POST /compensations/:id/payments records a partial payment', async () => {
    if (!authToken || !created) return;

    const res = await request(app)
      .post(`/api/v1/compensations/${created.id}/payments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: 20000, method: 'transfer', reference: 'TEST-001' });

    expect(res.status).toBe(201);
    expect(res.body.data.compensation.status).toBe('partial_paid');
    expect(Number(res.body.data.compensation.amount_paid)).toBe(20000);
  });

  it('POST /compensations/:id/payments records final payment and auto-transitions to paid', async () => {
    if (!authToken || !created) return;

    const res = await request(app)
      .post(`/api/v1/compensations/${created.id}/payments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: 30000, method: 'transfer', reference: 'TEST-002' });

    expect(res.status).toBe(201);
    expect(res.body.data.compensation.status).toBe('paid');
    expect(res.body.data.compensation.paid_at).toBeTruthy();
  });

  it('rejects payment that would exceed outstanding balance', async () => {
    if (!authToken || !created) return;

    const res = await request(app)
      .post(`/api/v1/compensations/${created.id}/payments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: 10000, method: 'cash' });

    // After the previous test this is fully paid, so any further payment
    // should be rejected as either overpayment or status-disallowed.
    expect([400, 409]).toContain(res.status);
  });
});

describe('Compensation responsibility allocation', () => {
  let compId;
  beforeAll(async () => {
    if (!authToken) return;
    const row = await compensationSvc.createCompensation({
      compensation_type: 'damage',
      amount_gross: 100000,
      description: 'Allokáció teszt',
      accommodation_id: accommodationId,
      responsible_name: 'Ideiglenes Felelős',
    }, { userId: null });
    compId = row.id;
  });
  afterAll(async () => { if (compId) await query(`DELETE FROM compensations WHERE id = $1`, [compId]).catch(() => {}); });

  it('rejects allocation whose percentages do not sum to 100', async () => {
    if (!authToken) return;
    await expect(
      compensationSvc.allocateResponsibilities(compId, [
        { name: 'A', percentage: 30 }, { name: 'B', percentage: 30 },
      ])
    ).rejects.toThrow(/sum to 100/);
  });

  it('allocates N parties and computes amount_allocated per %', async () => {
    if (!authToken) return;
    const parties = await compensationSvc.allocateResponsibilities(compId, [
      { name: 'Alice', email: 'a@ex.com', percentage: 60 },
      { name: 'Bob',   email: 'b@ex.com', percentage: 40 },
    ]);
    expect(parties).toHaveLength(2);
    expect(Number(parties[0].amount_allocated)).toBe(60000);
    expect(Number(parties[1].amount_allocated)).toBe(40000);
  });

  it('re-allocation replaces previous parties', async () => {
    if (!authToken) return;
    const parties = await compensationSvc.allocateResponsibilities(compId, [
      { name: 'Solo', percentage: 100 },
    ]);
    expect(parties).toHaveLength(1);
    const listed = await compensationSvc.listResponsibilities(compId);
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe('Solo');
  });
});

describe('Compensation dispute lifecycle', () => {
  let compId;
  beforeAll(async () => {
    if (!authToken) return;
    const row = await compensationSvc.createCompensation({
      compensation_type: 'damage',
      amount_gross: 80000,
      description: 'Vitatás teszt',
      accommodation_id: accommodationId,
      responsible_name: 'Vitás Fél',
    }, { userId: null, issue: true });
    compId = row.id;
  });
  afterAll(async () => { if (compId) await query(`DELETE FROM compensations WHERE id = $1`, [compId]).catch(() => {}); });

  it('submitDispute transitions issued → disputed with reason logged', async () => {
    if (!authToken) return;
    const r = await compensationSvc.submitDispute(compId, { reason: 'Nem én voltam' });
    expect(r.status).toBe('disputed');
    expect(r.dispute_reason).toBe('Nem én voltam');
    expect(r.disputed_at).toBeTruthy();
  });

  it('resolveDispute outcome=reduced updates amount_gross and returns to active', async () => {
    if (!authToken) return;
    const r = await compensationSvc.resolveDispute(compId, {
      outcome: 'reduced',
      newAmount: 40000,
      notes: 'Közös megegyezéssel csökkentve',
    });
    expect(['issued','partial_paid']).toContain(r.status);
    expect(Number(r.amount_gross)).toBe(40000);
    expect(Number(r.original_amount_gross)).toBe(80000);
    expect(r.dispute_resolution).toBe('reduced');
  });
});

describe('Compensation salary deduction', () => {
  let compId;
  beforeAll(async () => {
    if (!authToken) return;
    const row = await compensationSvc.createCompensation({
      compensation_type: 'damage',
      amount_gross: 60000,
      description: 'Bérlevonás teszt',
      accommodation_id: accommodationId,
      responsible_name: 'Alkalmazott',
    }, { userId: null, issue: true });
    compId = row.id;
  });
  afterAll(async () => { if (compId) await query(`DELETE FROM compensations WHERE id = $1`, [compId]).catch(() => {}); });

  it('schedules a multi-period deduction with auto end_date', async () => {
    if (!authToken) return;
    const row = await compensationSvc.scheduleSalaryDeduction(compId, {
      employee_name: 'Alkalmazott',
      amount_per_period: 20000,
      periods_total: 3,
      start_date: '2026-05-01',
    });
    expect(row.status).toBe('scheduled');
    expect(row.periods_total).toBe(3);
    // pg returns `date` columns as Date objects at midnight LOCAL TIME, so use
    // the local getters (not toISOString) to avoid TZ conversion off-by-one.
    const end = new Date(row.end_date);
    const endLocal = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    expect(endLocal).toBe('2026-07-01');
    const listed = await compensationSvc.listSalaryDeductions(compId);
    expect(listed).toHaveLength(1);
  });
});

describe('Compensation reminder cadence (runDailyEscalations)', () => {
  let compId;
  beforeAll(async () => {
    if (!authToken) return;
    // Create an issued compensation with due_date 5 days ago → should jump to serious_overdue
    const row = await compensationSvc.createCompensation({
      compensation_type: 'damage',
      amount_gross: 10000,
      description: 'Cadence teszt',
      accommodation_id: accommodationId,
      responsible_name: 'Késve Fizető',
      remediation_period_days: 14,
    }, { userId: null, issue: true });
    compId = row.id;
    // Manually backdate the due_date to 20 days ago
    await query(
      `UPDATE compensations SET due_date = CURRENT_DATE - INTERVAL '20 days' WHERE id = $1`,
      [compId]
    );
  });
  afterAll(async () => { if (compId) await query(`DELETE FROM compensations WHERE id = $1`, [compId]).catch(() => {}); });

  it('jumps to serious_overdue level 3 when 15+ days past due', async () => {
    if (!authToken) return;
    await compensationSvc.runDailyEscalations();
    const r = await query(`SELECT escalation_level, status FROM compensations WHERE id = $1`, [compId]);
    expect(r.rows[0].escalation_level).toBe(3);
    expect(r.rows[0].status).toBe('issued');  // not yet legal
  });
});

describe('Compensation escalation ladder', () => {
  it('escalateCompensation bumps escalation_level by one per call', async () => {
    if (!authToken) return;

    // Create a fresh compensation + issue
    const row = await compensationSvc.createCompensation({
      compensation_type: 'cleaning',
      amount_gross: 10000,
      description: 'Rendkívüli takarítás',
      accommodation_id: accommodationId,
      responsible_name: 'Eszkal Teszt',
      remediation_period_days: 7,
    }, { userId: null, issue: true });

    // Four escalation steps: 1 → 2 → 3 → 4 (4 transitions to status=escalated)
    const r1 = await compensationSvc.escalateCompensation(row.id);
    expect(r1.escalation_level).toBe(1);
    expect(r1.status).toBe('issued');

    const r2 = await compensationSvc.escalateCompensation(row.id);
    expect(r2.escalation_level).toBe(2);

    const r3 = await compensationSvc.escalateCompensation(row.id);
    expect(r3.escalation_level).toBe(3);
    expect(r3.status).toBe('issued');  // still active at level 3

    const r4 = await compensationSvc.escalateCompensation(row.id);
    expect(r4.escalation_level).toBe(4);
    expect(r4.status).toBe('escalated');

    // Fifth call should refuse (status now escalated, not in ACTIVE set)
    await expect(compensationSvc.escalateCompensation(row.id)).rejects.toThrow(/Cannot escalate/);

    // Cleanup
    await query(`DELETE FROM compensations WHERE id = $1`, [row.id]);
  });
});
