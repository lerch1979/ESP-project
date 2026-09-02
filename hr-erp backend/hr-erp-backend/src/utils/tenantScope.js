/**
 * Tenant scope — the one place that decides "which contractor's rows may this
 * caller see or touch".
 *
 * WHY THIS EXISTS
 * ---------------
 * Tenant isolation in this system is app-layer `WHERE`, not RLS (2026-07-02
 * decision: RLS is inert in prod — the app connects as the postgres superuser).
 * That makes every unscoped query a leak, and DEEP_AUDIT findings 6, 7 and 8 are
 * exactly that failure repeated across employees, finance, tasks and timesheets.
 *
 * The recurring bug is never "the filter was written wrong" — it is "the filter
 * was not written at all". So the fix is a single named helper that reads as a
 * required step, rather than three private `scopeOf` copies (compensation, fine,
 * document) that a fourth controller can silently fail to imitate.
 *
 * SEMANTICS
 * ---------
 *   • superadmin sees everything (`all: true`).
 *   • everyone else sees only their own `contractor_id`.
 *   • NULL-owned rows stay visible/writable. This is deliberate: the deployment
 *     is single-operator and globally-authored content carries a NULL contractor.
 *     Filtering it out is the "strict contractor_id hides GLOBAL content"
 *     anti-pattern already logged in PROJECT_STATE (it bit 5 places). Pass
 *     `{ includeNull: false }` for genuinely per-tenant operational data where a
 *     NULL owner should NOT be shared.
 *   • Out-of-scope single-row reads should answer 404, never 403 — a 403 confirms
 *     the row exists to someone who may not know that. `denied()` below is the
 *     shared shape for that.
 */

/** Caller's scope. `all` short-circuits every predicate below. */
const scopeOf = (req) => ({
  all: !!req.user?.roles?.includes('superadmin'),
  contractorId: req.user?.contractorId ?? null,
});

/**
 * Build a SQL predicate for a contractor-owning column.
 *
 * Returns `{ sql, params }` where `sql` is always a complete boolean expression
 * (never an empty string), so callers can concatenate it unconditionally and
 * cannot accidentally emit a filter-less WHERE.
 *
 *   const s = scopeOf(req);
 *   const { sql, params } = contractorPredicate(s, 'e.contractor_id', nextParamIndex);
 *   `SELECT ... WHERE ${sql}`  // -> 'TRUE' for superadmin, else the real filter
 *
 * @param {{all:boolean,contractorId:string|null}} scope
 * @param {string} column         qualified column, e.g. 'e.contractor_id'
 * @param {number} startIndex     next free $n placeholder index
 * @param {{includeNull?:boolean}} [opts]
 */
function contractorPredicate(scope, column, startIndex, opts = {}) {
  const includeNull = opts.includeNull !== false;
  if (scope.all) return { sql: 'TRUE', params: [], nextIndex: startIndex };

  // A scoped caller with no contractor of their own must match nothing rather
  // than everything — `contractor_id = NULL` is never true, so spell it out.
  if (!scope.contractorId) {
    return includeNull
      ? { sql: `${column} IS NULL`, params: [], nextIndex: startIndex }
      : { sql: 'FALSE', params: [], nextIndex: startIndex };
  }

  const sql = includeNull
    ? `(${column} = $${startIndex} OR ${column} IS NULL)`
    : `${column} = $${startIndex}`;
  return { sql, params: [scope.contractorId], nextIndex: startIndex + 1 };
}

/**
 * Does this caller own this row? For single-row reads/writes where the owning
 * contractor is already loaded.
 */
function ownsRow(scope, rowContractorId, opts = {}) {
  if (scope.all) return true;
  if (rowContractorId == null) return opts.includeNull !== false;
  return rowContractorId === scope.contractorId;
}

/** The 404 body used when a row exists but is out of the caller's scope. */
const denied = (message = 'Nem található') => ({ success: false, message });

module.exports = { scopeOf, contractorPredicate, ownsRow, denied };
