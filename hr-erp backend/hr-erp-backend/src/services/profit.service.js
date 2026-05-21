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

class ProfitService {
  /**
   * GET /api/v1/profit/by-accommodation
   *
   * Income  = SUM(accommodation_billings.total_amount) for the month,
   *           INNER joined against billing_runs to drop billings whose
   *           run is cancelled or non-incoming. Cancelled billings are
   *           also excluded. Draft/finalized/invoiced/paid all count.
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
      SELECT ab.accommodation_id, SUM(ab.total_amount) AS income
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

    // Index income by accommodation_id
    const incomeByAcc = new Map();
    for (const row of incomeRows.rows) {
      incomeByAcc.set(row.accommodation_id, parseFloat(row.income));
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
      const profit = income - expenses.total;
      const profitMargin = income > 0 ? roundPct((profit / income) * 100) : null;

      byAcc.push({
        accommodation_id: accId,
        accommodation_name: nameByAcc.get(accId) || null,
        income,
        expenses: include_categories ? { ...expenses } : { total: expenses.total },
        profit,
        profit_margin_pct: profitMargin,
      });
    }

    // Highest income first, then alpha by name
    byAcc.sort((a, b) => {
      if (b.income !== a.income) return b.income - a.income;
      return (a.accommodation_name || '').localeCompare(b.accommodation_name || '');
    });

    const totalIncome = byAcc.reduce((s, r) => s + r.income, 0);
    const totalExpenses = byAcc.reduce((s, r) => s + r.expenses.total, 0);
    const totalProfit = totalIncome - totalExpenses;
    const totalMargin = totalIncome > 0 ? roundPct((totalProfit / totalIncome) * 100) : null;

    return {
      data: {
        month,
        summary: {
          total_income: totalIncome,
          total_expenses: totalExpenses,
          total_profit: totalProfit,
          profit_margin_pct: totalMargin,
        },
        by_accommodation: byAcc,
      },
    };
  }
}

module.exports = new ProfitService();
