const { query } = require('../database/connection');
const { VALID_CATEGORIES } = require('../models/expense.model');

const BILLING_MONTH_RE = /^\d{4}-\d{2}$/;

// Hungarian labels for the category columns (mirrors the admin CATEGORIES).
const CATEGORY_LABELS = {
  rezsi: 'Rezsi',
  karbantartas: 'Karbantartás',
  takaritas: 'Takarítás',
  egyeb: 'Egyéb',
};

function emptyCategoryBreakdown() {
  const out = { total: 0 };
  for (const c of VALID_CATEGORIES) out[c] = 0;
  return out;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Per-accommodation OPERATING COSTS (operating-costs-only sibling of the
 * profit dashboard). Built entirely off the live accommodation_id FK on
 * accommodation_expenses — so it auto-tracks added/closed accommodations and
 * never depends on the (now-collapsed) "szálló" cost centers.
 *
 * Adds unit economics: occupant-nights for the month (one row per
 * employee-day in occupancy_snapshots) and cost-per-bed-night = cost / nights.
 */
class OperatingCostsService {
  async getByAccommodation({ month, accommodation_id }) {
    if (!month) return { error: 'month paraméter kötelező (YYYY-MM)', status: 400 };
    if (!BILLING_MONTH_RE.test(month)) return { error: 'month formátuma: YYYY-MM', status: 400 };

    const params = [month];
    let accSuffix = '';
    if (accommodation_id) {
      params.push(accommodation_id);
      accSuffix = ' AND accommodation_id = $2';
    }

    // Costs grouped by accommodation × category.
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

    // Occupant-nights for the month: one occupancy_snapshots row per
    // (employee, day) = one occupant-night. Drives cost-per-bed-night.
    const nightRows = await query(
      `
      SELECT accommodation_id, COUNT(*) AS nights
      FROM occupancy_snapshots
      WHERE TO_CHAR(snapshot_date, 'YYYY-MM') = $1
        ${accSuffix}
      GROUP BY accommodation_id
      `,
      params,
    );

    const expensesByAcc = new Map();
    for (const row of expenseRows.rows) {
      const accId = row.accommodation_id;
      if (!expensesByAcc.has(accId)) expensesByAcc.set(accId, emptyCategoryBreakdown());
      const bucket = expensesByAcc.get(accId);
      const amt = parseFloat(row.amount);
      if (row.category in bucket) bucket[row.category] = amt;
      bucket.total += amt;
    }

    const nightsByAcc = new Map();
    for (const row of nightRows.rows) {
      nightsByAcc.set(row.accommodation_id, parseInt(row.nights, 10));
    }

    // Union of accommodations that had either a cost or occupancy this month.
    const accIds = new Set([...expensesByAcc.keys(), ...nightsByAcc.keys()]);

    const nameByAcc = new Map();
    if (accIds.size > 0) {
      const namesRes = await query(
        'SELECT id, name FROM accommodations WHERE id = ANY($1::uuid[])',
        [[...accIds]],
      );
      for (const row of namesRes.rows) nameByAcc.set(row.id, row.name);
    }

    const byAcc = [];
    for (const accId of accIds) {
      const expenses = expensesByAcc.get(accId) || emptyCategoryBreakdown();
      const nights = nightsByAcc.get(accId) || 0;
      const costPerNight = nights > 0 ? round2(expenses.total / nights) : null;
      byAcc.push({
        accommodation_id: accId,
        accommodation_name: nameByAcc.get(accId) || null,
        expenses: { ...expenses },
        occupant_nights: nights,
        cost_per_night: costPerNight,
      });
    }

    // Highest cost first, then alpha by name.
    byAcc.sort((a, b) => {
      if (b.expenses.total !== a.expenses.total) return b.expenses.total - a.expenses.total;
      return (a.accommodation_name || '').localeCompare(b.accommodation_name || '');
    });

    const totalCost = byAcc.reduce((s, r) => s + r.expenses.total, 0);
    const totalNights = byAcc.reduce((s, r) => s + r.occupant_nights, 0);
    const byCategory = emptyCategoryBreakdown();
    for (const r of byAcc) {
      for (const c of VALID_CATEGORIES) byCategory[c] += r.expenses[c];
      byCategory.total += r.expenses.total;
    }

    return {
      data: {
        month,
        summary: {
          total_cost: round2(totalCost),
          total_occupant_nights: totalNights,
          cost_per_night: totalNights > 0 ? round2(totalCost / totalNights) : null,
          by_category: byCategory,
        },
        by_accommodation: byAcc,
      },
    };
  }

  get categoryLabels() {
    return CATEGORY_LABELS;
  }
}

module.exports = new OperatingCostsService();
module.exports.CATEGORY_LABELS = CATEGORY_LABELS;
