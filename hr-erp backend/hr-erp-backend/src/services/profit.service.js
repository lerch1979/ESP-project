const { query } = require('../database/connection');
const { VALID_CATEGORIES } = require('../models/expense.model');

const BILLING_MONTH_RE = /^\d{4}-\d{2}$/;

function emptyCategoryBreakdown() {
  const out = { total: 0 };
  for (const c of VALID_CATEGORIES) out[c] = 0;
  return out;
}

function roundPct(n) {
  return Math.round(n * 10) / 10;
}

const round2 = (n) => Math.round(n * 100) / 100;

class ProfitService {
  /**
   * GET /api/v1/profit/by-accommodation
   *
   * Income  = SUM(accommodation_billings.total_amount) for the month,
   *           INNER joined against billing_runs to drop billings whose
   *           run is cancelled or non-incoming. Cancelled billings are
   *           also excluded. Draft/finalized/invoiced/paid all count.
   * Rent    = SUM(accommodation_billings.cost_amount) − operating expenses.
   *           cost_amount (the billing engine's cost = rent allocation +
   *           allocated operating expenses) minus the operating expenses
   *           leaves the accommodation RENT the engine allocated. Including it
   *           makes profit = income − (expenses + rent) = income − cost_amount,
   *           i.e. it reconciles EXACTLY with the billing engine's margin_amount
   *           (DEEP_AUDIT finding: the dashboard used to omit rent and overstate profit).
   * Expense = SUM(accommodation_expenses.amount) for the month,
   *           excluding soft-deleted rows, grouped by category.
   *
   * Note: accommodation_billings has no deleted_at column — cancellation
   * is tracked via status='cancelled' on both billing_runs and
   * accommodation_billings (per migration 112). billing_runs has a unique
   * index on (billing_month, run_type) WHERE status<>'cancelled' so at most
   * one active incoming run exists per month.
   */
  async getByAccommodation({ month, accommodation_id, include_categories = true }) {
    if (!month) {
      return { error: 'month paraméter kötelező (YYYY-MM)', status: 400 };
    }
    if (!BILLING_MONTH_RE.test(month)) {
      return { error: 'month formátuma: YYYY-MM', status: 400 };
    }

    const params = [month];
    let accSuffix = '';
    if (accommodation_id) {
      params.push(accommodation_id);
      accSuffix = ' AND accommodation_id = $2';
    }

    const incomeRows = await query(
      `
      SELECT ab.accommodation_id, SUM(ab.total_amount) AS income, SUM(COALESCE(ab.cost_amount, 0)) AS billing_cost
      FROM accommodation_billings ab
      INNER JOIN billing_runs br ON br.id = ab.billing_run_id
      WHERE ab.billing_month = $1
        AND ab.status <> 'cancelled'
        AND br.status <> 'cancelled'
        AND br.run_type = 'incoming'
        ${accommodation_id ? 'AND ab.accommodation_id = $2' : ''}
      GROUP BY ab.accommodation_id
      `,
      params,
    );

    const expenseRows = await query(
      `
      SELECT accommodation_id, category, SUM(amount) AS amount
      FROM accommodation_expenses
      WHERE billing_month = $1
        AND deleted_at IS NULL
        ${accSuffix}
      GROUP BY accommodation_id, category
      `,
      params,
    );

    // Index income + billing cost (rent + allocated expenses) by accommodation_id
    const incomeByAcc = new Map();
    const billingCostByAcc = new Map();
    for (const row of incomeRows.rows) {
      incomeByAcc.set(row.accommodation_id, parseFloat(row.income));
      billingCostByAcc.set(row.accommodation_id, parseFloat(row.billing_cost));
    }

    // Index expenses by accommodation_id -> {category: amount, total}
    const expensesByAcc = new Map();
    for (const row of expenseRows.rows) {
      const accId = row.accommodation_id;
      if (!expensesByAcc.has(accId)) expensesByAcc.set(accId, emptyCategoryBreakdown());
      const bucket = expensesByAcc.get(accId);
      const amt = parseFloat(row.amount);
      if (row.category in bucket) bucket[row.category] = amt;
      bucket.total += amt;
    }

    // Union of accommodation_ids touching the month
    const accIds = new Set([...incomeByAcc.keys(), ...expensesByAcc.keys()]);

    let nameByAcc = new Map();
    if (accIds.size > 0) {
      const namesRes = await query(
        'SELECT id, name FROM accommodations WHERE id = ANY($1::uuid[])',
        [[...accIds]],
      );
      for (const row of namesRes.rows) nameByAcc.set(row.id, row.name);
    }

    const byAcc = [];
    for (const accId of accIds) {
      const income = incomeByAcc.get(accId) || 0;
      const expenses = expensesByAcc.get(accId) || emptyCategoryBreakdown();
      // Rent = billing cost beyond operating expenses (the engine's rent allocation).
      // With a real billing (cost_amount = rent + allocated expenses), profit =
      // income − cost_amount ≡ the billing engine's margin_amount. Clamped at 0 so a
      // legacy billing row with no cost_amount (0) falls back to income − expenses.
      const hasBilling = billingCostByAcc.has(accId);
      const rent = hasBilling ? Math.max(0, round2(billingCostByAcc.get(accId) - expenses.total)) : 0;
      const profit = round2(income - expenses.total - rent);
      const profitMargin = income > 0 ? roundPct((profit / income) * 100) : null;

      byAcc.push({
        accommodation_id: accId,
        accommodation_name: nameByAcc.get(accId) || null,
        income,
        expenses: include_categories ? { ...expenses } : { total: expenses.total },
        rent,
        profit,
        profit_margin_pct: profitMargin,
      });
    }

    // Highest income first, then alpha by name
    byAcc.sort((a, b) => {
      if (b.income !== a.income) return b.income - a.income;
      return (a.accommodation_name || '').localeCompare(b.accommodation_name || '');
    });

    const totalIncome = round2(byAcc.reduce((s, r) => s + r.income, 0));
    const totalExpenses = round2(byAcc.reduce((s, r) => s + r.expenses.total, 0));
    const totalRent = round2(byAcc.reduce((s, r) => s + r.rent, 0));
    const totalProfit = round2(totalIncome - totalExpenses - totalRent);
    const totalMargin = totalIncome > 0 ? roundPct((totalProfit / totalIncome) * 100) : null;

    return {
      data: {
        month,
        summary: {
          total_income: totalIncome,
          total_expenses: totalExpenses,
          total_rent: totalRent,
          total_profit: totalProfit,
          profit_margin_pct: totalMargin,
        },
        by_accommodation: byAcc,
      },
    };
  }
}

module.exports = new ProfitService();
