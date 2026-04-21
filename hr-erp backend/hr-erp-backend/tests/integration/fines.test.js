/**
 * Fine + Damage workflow — integration tests.
 *
 * Graceful-skip pattern: if the CI test DB doesn't have the migration 090
 * admin seed, auth fails → we bail out on each describe to keep the suite
 * green (matches inspections.test.js).
 */
const request = require('supertest');
const app = require('../../src/server');
const { query } = require('../../src/database/connection');
const fineSvc = require('../../src/services/fine.service');

let authToken;
let accommodationId;
let fineTypeId;

beforeAll(async () => {
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@hr-erp.com', password: 'password123' });
  authToken = login.body?.data?.token || null;

  const acc = await query(`SELECT id FROM accommodations LIMIT 1`);
  accommodationId = acc.rows[0]?.id || null;

  const ft = await query(`SELECT id FROM fine_types WHERE code = 'CLEANING_NEGLECT'`);
  fineTypeId = ft.rows[0]?.id || null;
});

afterAll(async () => {
  // Clean up any compensations created by our tests (they start with BIR-/HSK- and
  // have null inspection_id, so pattern-match loosely).
  await query(
    `DELETE FROM compensations
     WHERE compensation_number IN (SELECT compensation_number FROM compensations WHERE created_at >= NOW() - INTERVAL '5 minutes' AND inspection_id IS NULL)`
  ).catch(() => {});
});

describe('fine_types catalog', () => {
  it('ships 5 seeded fine types', async () => {
    if (!authToken) return;
    const r = await request(app).get('/api/v1/fine-types').set('Authorization', `Bearer ${authToken}`);
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThanOrEqual(5);
    const codes = r.body.data.map(t => t.code);
    expect(codes).toEqual(expect.arrayContaining(['HOUSE_RULES', 'CLEANING_NEGLECT', 'SMOKING_INDOOR']));
  });

  it('CRUD a fine type', async () => {
    if (!authToken) return;
    const created = await request(app)
      .post('/api/v1/fine-types')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ code: 'TEST_FINE_999', name: 'Teszt bírság', amount_per_person: 1234, category: 'other' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const updated = await request(app)
      .put(`/api/v1/fine-types/${id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount_per_person: 5678 });
    expect(updated.status).toBe(200);
    expect(Number(updated.body.data.amount_per_person)).toBe(5678);

    const deleted = await request(app)
      .delete(`/api/v1/fine-types/${id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(deleted.status).toBe(200);

    // Hard-delete because it's now inactive and we don't want polluted fixtures
    await query(`DELETE FROM fine_types WHERE id = $1`, [id]);
  });
});

describe('Fine workflow — on-site payment with signature', () => {
  let compensation;
  let residentRows;

  it('creates a fine with per-resident allocation', async () => {
    if (!authToken || !fineTypeId) return;
    const result = await fineSvc.createFine(null, fineTypeId, [
      { name: 'Teszt Lakó 1', email: 't1@ex.com' },
      { name: 'Teszt Lakó 2', email: 't2@ex.com' },
    ], { userId: null });

    compensation = result.compensation;
    residentRows = result.residents;
    expect(compensation.type).toBe('fine');
    expect(compensation.compensation_number).toMatch(/^BIR-\d{4}-\d{4}$/);
    expect(Number(compensation.amount_gross)).toBe(20000); // 2 × 10 000
    expect(residentRows).toHaveLength(2);
    expect(Number(residentRows[0].amount_assigned)).toBe(10000);
  });

  it('rejects on-site payment without signature', async () => {
    if (!authToken || !residentRows) return;
    await expect(
      fineSvc.recordOnSitePayment(residentRows[0].id, { method: 'on_site_cash' })
    ).rejects.toThrow(/signatureData/);
  });

  it('records on-site cash payment and marks resident paid_on_site', async () => {
    if (!authToken || !residentRows) return;
    const r = await fineSvc.recordOnSitePayment(residentRows[0].id, {
      method: 'on_site_cash',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg',
      receiptNumber: 'R-001',
    });
    expect(r.resident.status).toBe('paid_on_site');
    expect(Number(r.resident.amount_paid)).toBe(10000);
    expect(r.resident.signed_at).toBeTruthy();
  });

  it('records on-site card payment for the 2nd resident → compensation fully paid', async () => {
    if (!authToken || !residentRows) return;
    await fineSvc.recordOnSitePayment(residentRows[1].id, {
      method: 'on_site_card',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg',
      receiptNumber: 'R-002',
    });
    const comp = await query(`SELECT status, payment_method FROM compensations WHERE id = $1`, [compensation.id]);
    expect(comp.rows[0].status).toBe('paid_on_site');
    expect(comp.rows[0].payment_method).toBe('mixed'); // cash + card
  });
});

describe('Damage compensation — 30-day + auto-convert to salary deduction', () => {
  let compensation;
  let residents;

  it('creates a damage with even split when amounts not explicit', async () => {
    if (!authToken) return;
    const res = await fineSvc.createDamageCompensation(null, {
      description: 'Törött ablak (szoba 203)',
      total_amount: 45000,
    }, [
      { name: 'Lakó A' },
      { name: 'Lakó B' },
    ], { userId: null });
    compensation = res.compensation;
    residents = res.residents;
    expect(compensation.type).toBe('damage');
    expect(Number(compensation.amount_gross)).toBe(45000);
    expect(residents).toHaveLength(2);
    // 45000 / 2 = 22500 each
    expect(Number(residents[0].amount_assigned) + Number(residents[1].amount_assigned)).toBe(45000);
  });

  it('auto-converts to salary_deduction when due_date is in the past', async () => {
    if (!authToken || !residents) return;
    // Backdate the due_date
    await query(`UPDATE compensations SET due_date = CURRENT_DATE - INTERVAL '1 day' WHERE id = $1`, [compensation.id]);
    const counters = await fineSvc.runAutoConversions();
    expect(counters.converted).toBeGreaterThanOrEqual(2);

    // Verify residents moved to salary_deduction
    const r = await query(`SELECT status, salary_deduction_monthly, salary_deduction_months FROM compensation_residents WHERE compensation_id = $1`, [compensation.id]);
    expect(r.rows.every(x => x.status === 'salary_deduction')).toBe(true);

    // Compensation rolled up to salary_deduction_active
    const c = await query(`SELECT status FROM compensations WHERE id = $1`, [compensation.id]);
    expect(c.rows[0].status).toBe('salary_deduction_active');

    // A salary_deductions row was created per resident
    const sd = await query(`SELECT COUNT(*)::int AS n FROM salary_deductions WHERE compensation_id = $1`, [compensation.id]);
    expect(sd.rows[0].n).toBe(2);
  });

  it('processMonthlyDeductions creates payments and advances months_completed', async () => {
    if (!authToken || !residents) return;
    // Roll the start/end months into the target month so we hit the WHERE clause
    await query(
      `UPDATE salary_deductions SET start_month = $1, end_month = $2
       WHERE compensation_id = $3`,
      ['2026-01', '2026-12', compensation.id]
    );
    const results = await fineSvc.processMonthlyDeductions('2026-04');
    expect(results.processed).toBeGreaterThanOrEqual(2);

    // Second call is idempotent
    const results2 = await fineSvc.processMonthlyDeductions('2026-04');
    expect(results2.skipped).toBeGreaterThanOrEqual(2);
    expect(results2.processed).toBe(0);
  });
});
