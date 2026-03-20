/**
 * Damage Report Service — Unit Tests
 * Tests: report number generation, payment plan calculation, PDF generation
 */
const damageService = require('../src/services/damageReport.service');

describe('Damage Report Service', () => {

  describe('calculatePaymentPlan', () => {
    it('should calculate single-month plan when cost fits within max deduction', () => {
      // 85,000 Ft cost, 280,000 Ft salary → max 140,000/month → 1 month
      const plan = damageService.calculatePaymentPlan(85000, 280000, 100);
      expect(plan).toHaveLength(1);
      expect(plan[0].month).toBe(1);
      expect(plan[0].amount).toBe(85000);
      expect(plan[0].remaining).toBe(0);
    });

    it('should calculate multi-month plan when cost exceeds max deduction', () => {
      // 300,000 Ft cost, 280,000 Ft salary → max 140,000/month → 3 months
      const plan = damageService.calculatePaymentPlan(300000, 280000, 100);
      expect(plan).toHaveLength(3);
      expect(plan[0].amount).toBe(140000); // Max 50%
      expect(plan[1].amount).toBe(140000);
      expect(plan[2].amount).toBe(20000); // Remaining
      expect(plan[2].remaining).toBe(0);
    });

    it('should respect Mt. 177.§ — max 50% of monthly salary', () => {
      const plan = damageService.calculatePaymentPlan(500000, 200000, 100);
      // Max deduction: 200,000 × 50% = 100,000/month
      plan.forEach(p => {
        expect(p.amount).toBeLessThanOrEqual(100000);
      });
    });

    it('should adjust cost by fault percentage', () => {
      // 100,000 Ft cost, 50% fault → 50,000 Ft adjusted
      const plan = damageService.calculatePaymentPlan(100000, 280000, 50);
      const totalPaid = plan.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBe(50000);
    });

    it('should return empty plan for zero cost', () => {
      const plan = damageService.calculatePaymentPlan(0, 280000, 100);
      expect(plan).toHaveLength(0);
    });

    it('should return empty plan for zero salary', () => {
      const plan = damageService.calculatePaymentPlan(85000, 0, 100);
      expect(plan).toHaveLength(0);
    });

    it('should return empty plan for null inputs', () => {
      const plan = damageService.calculatePaymentPlan(null, null, 100);
      expect(plan).toHaveLength(0);
    });

    it('should handle 0% fault percentage', () => {
      const plan = damageService.calculatePaymentPlan(100000, 280000, 0);
      expect(plan).toHaveLength(0);
    });

    it('should calculate correctly for large amounts', () => {
      // 1,000,000 Ft, 400,000 salary → max 200,000/month → 5 months
      const plan = damageService.calculatePaymentPlan(1000000, 400000, 100);
      expect(plan).toHaveLength(5);
      const totalPaid = plan.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBe(1000000);
    });
  });
});
