/**
 * Money-key scanner — the durable half of "szállásfelelős sees no financial data".
 *
 * Permission gates say which ROUTES a role may call. They say nothing about what a
 * permitted route puts in the body, and that is where the site-manager boundary actually
 * breaks: `accommodations.view` is a permission they MUST hold to manage rooms and
 * occupants, and the same payload carries monthly_rent in sixteen places.
 *
 * So this scans responses rather than routes. A developer adding an endpoint next year
 * does not have to remember the rule — if their payload carries money and a site manager
 * can reach it, the suite fails.
 *
 * EXACT KEYS, NOT SUBSTRINGS. Matching /cost/ would fire on `cost_center_name` and
 * matching /amount/ on `amount_of_beds`; a scanner that cries wolf gets muted, and a
 * muted scanner protects nothing.
 */

const MONEY_KEYS = new Set([
  // accommodation cost model (mig 142)
  'monthly_rent', 'rent_amount', 'rent_basis', 'rent_per_bed_night',
  'utility_line', 'utility_lines', 'total_utilities',
  // client rates + quotes
  'rate_per_night', 'rate_used', 'rate_empty', 'flat_amount', 'unit_price', 'price',
  'expected_monthly_value',
  // billing / settlement
  'net_amount', 'gross_amount', 'vat_amount', 'total_amount', 'amount',
  'net_total', 'gross_total', 'billed_amount', 'payable',
  // economics
  'margin', 'margin_pct', 'profit', 'total_cost', 'monthly_cost', 'cost_per_bed',
  'operating_cost', 'expense_total',
  // payroll + penalties
  'gross_salary', 'net_salary', 'salary', 'deduction_amount', 'fine_amount',
  'compensation_amount', 'penalty_amount',
]);

/** Every money-shaped key in a payload, with the path where it was found. */
function findMoney(node, path = '$', out = []) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    // Scan the first few elements only: a 300-row list repeats the same shape, and the
    // report should name the leak once rather than 300 times.
    node.slice(0, 3).forEach((v, i) => findMoney(v, `${path}[${i}]`, out));
    return out;
  }
  if (typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node)) {
    if (MONEY_KEYS.has(k) && v !== null && v !== undefined && v !== '') {
      out.push({ key: k, path: `${path}.${k}`, value: v });
    }
    findMoney(v, `${path}.${k}`, out);
  }
  return out;
}

module.exports = { MONEY_KEYS, findMoney };
