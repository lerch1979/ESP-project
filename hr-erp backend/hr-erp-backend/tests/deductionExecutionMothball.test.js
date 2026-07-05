/**
 * Deduction-execution MOTHBALL guard (no DB — services mocked).
 *
 * Proves the three execution endpoints are 403 when DEDUCTION_EXECUTION_ENABLED
 * is off (prod default), pass the gate when on (future EOR), and that the CASH
 * repayment path is NEVER gated by the flag.
 */
jest.mock('../src/services/fine.service');
jest.mock('../src/services/compensation.service');
jest.mock('../src/services/inspectionPDF.service');

const fineSvc = require('../src/services/fine.service');
const compSvc = require('../src/services/compensation.service');
const fineCtrl = require('../src/controllers/fine.controller');
const compCtrl = require('../src/controllers/compensation.controller');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const req = (over = {}) => ({ params: {}, body: {}, query: {}, user: { id: 'u1', contractorId: 'c1', roles: [] }, ...over });

describe('deduction-execution mothball guard', () => {
  const OLD = process.env.DEDUCTION_EXECUTION_ENABLED;
  afterEach(() => jest.clearAllMocks());
  afterAll(() => { if (OLD === undefined) delete process.env.DEDUCTION_EXECUTION_ENABLED; else process.env.DEDUCTION_EXECUTION_ENABLED = OLD; });

  describe('OFF (prod default — our process ends at the jegyzőkönyv)', () => {
    beforeEach(() => { delete process.env.DEDUCTION_EXECUTION_ENABLED; });

    it('runPayroll → 403, engine NOT called', async () => {
      const res = mockRes();
      await fineCtrl.runPayroll(req({ body: { month: '2026-04' } }), res);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('deduction_execution_disabled');
      expect(res.body.message).toMatch(/jegyzőkönyv/);
      expect(fineSvc.processMonthlyDeductions).not.toHaveBeenCalled();
    });

    it('convertToDeduction → 403, engine NOT called (no new schedule)', async () => {
      const res = mockRes();
      await fineCtrl.convertToDeduction(req({ params: { residentId: 'r1' }, body: { months: 3 } }), res);
      expect(res.statusCode).toBe(403);
      expect(fineSvc.convertToSalaryDeduction).not.toHaveBeenCalled();
    });

    it('scheduleDeduction → 403, engine NOT called (no new schedule)', async () => {
      const res = mockRes();
      await compCtrl.scheduleDeduction(req({ params: { id: 'c1' }, body: {} }), res);
      expect(res.statusCode).toBe(403);
      expect(compSvc.scheduleSalaryDeduction).not.toHaveBeenCalled();
    });

    it('CASH recordOnSite is NOT gated → calls the service (201)', async () => {
      fineSvc.recordOnSitePayment.mockResolvedValue({ ok: true });
      const res = mockRes();
      await fineCtrl.recordOnSite(req({ params: { residentId: 'r1' }, body: { method: 'on_site_cash', signature_data: 'sig' } }), res);
      expect(res.statusCode).toBe(201);
      expect(fineSvc.recordOnSitePayment).toHaveBeenCalled();
    });

    it('CASH recordPayment is NOT gated → calls the service (201)', async () => {
      fineSvc.recordResidentPayment.mockResolvedValue({ ok: true });
      const res = mockRes();
      await fineCtrl.recordPayment(req({ params: { residentId: 'r1' }, body: { amount: 1000 } }), res);
      expect(res.statusCode).toBe(201);
      expect(fineSvc.recordResidentPayment).toHaveBeenCalled();
    });
  });

  describe('ON (future EOR — DEDUCTION_EXECUTION_ENABLED=true)', () => {
    beforeEach(() => { process.env.DEDUCTION_EXECUTION_ENABLED = 'true'; });

    it('runPayroll passes the gate → engine runs live', async () => {
      fineSvc.processMonthlyDeductions.mockResolvedValue({ processed: 2, skipped: 1 });
      const res = mockRes();
      await fineCtrl.runPayroll(req({ body: { month: '2026-04' } }), res);
      expect(res.statusCode).toBe(200);
      expect(fineSvc.processMonthlyDeductions).toHaveBeenCalledWith('2026-04', expect.any(Object));
    });

    it('scheduleDeduction passes the gate → creates a schedule', async () => {
      compSvc.scheduleSalaryDeduction.mockResolvedValue({ id: 'd1' });
      const res = mockRes();
      await compCtrl.scheduleDeduction(req({ params: { id: 'c1' }, body: {} }), res);
      expect(res.statusCode).toBe(201);
      expect(compSvc.scheduleSalaryDeduction).toHaveBeenCalled();
    });
  });
});
