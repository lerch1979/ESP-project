/**
 * Field-level money redaction, for endpoints a role must reach but whose payload carries
 * money it must not see.
 *
 * WHY A ROUTE GATE IS NOT ENOUGH
 * ------------------------------
 * Most financial surfaces can simply be closed: eighteen route files answer to
 * `finance.*` and a site manager never holds it. But `accommodations.view` is a
 * permission the szállásfelelős MUST hold — it is how they manage rooms and occupants —
 * and `accommodation.controller` returns `monthly_rent` in sixteen places alongside the
 * room data. The route is legitimately theirs; the rent in it is not.
 *
 * So the boundary for that surface is the FIELD, not the endpoint.
 *
 * ONE HELPER, NOT SIXTEEN CALL SITES
 * ----------------------------------
 * Applied at the serialisation points rather than beside each query. The recurring bug in
 * this codebase is never "the filter was written wrong", it is "the filter was not
 * written at all" — and sixteen chances to forget is sixteen too many. Pair it with the
 * ROLES scanner in the functest suite, which walks a site manager's reachable endpoints
 * and fails on any money-shaped key, so a new endpoint is covered without anyone
 * remembering this file exists.
 *
 * NULL, NOT DELETE. The keys stay present and become null, because the admin UI reads
 * `acc.monthly_rent` and a missing key renders "undefined" while a null renders "—".
 * A redaction that breaks the page for privileged users gets reverted.
 */

/** Money-bearing keys that may ride along in an otherwise non-financial payload. */
const MONEY_FIELDS = [
  'monthly_rent', 'rent_amount', 'rent_basis', 'rent_per_bed_night',
  'utility_lines', 'total_utilities', 'operating_cost', 'total_cost', 'monthly_cost',
  'cost_per_bed', 'rate_per_night', 'rate_used', 'rate_empty', 'flat_amount',
  'margin', 'margin_pct', 'profit',
  'gross_salary', 'net_salary', 'salary',
];

/** May this caller see money at all? */
const canSeeMoney = (req) =>
  !!req?.user?.roles?.includes('superadmin')
  || !!req?.user?.permissions?.includes('finance.view');

/**
 * Null out every money field in a payload, in place-safe fashion (returns a copy).
 * Arrays and nested objects are walked, so a list endpoint is covered by one call.
 */
function stripMoney(node) {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) return node.map(stripMoney);
  if (typeof node !== 'object') return node;
  if (node instanceof Date) return node;

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = MONEY_FIELDS.includes(k) ? null : stripMoney(v);
  }
  return out;
}

/**
 * The call site's one-liner: `res.json({ data: redactMoney(rows, req) })`.
 * A privileged caller gets the payload untouched, so this is safe to apply broadly.
 */
const redactMoney = (payload, req) => (canSeeMoney(req) ? payload : stripMoney(payload));

module.exports = { redactMoney, stripMoney, canSeeMoney, MONEY_FIELDS };
