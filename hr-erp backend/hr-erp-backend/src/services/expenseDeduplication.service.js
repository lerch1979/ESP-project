const { query } = require('../database/connection');
const { generateFingerprint } = require('../models/expense.model');

/**
 * Deduplication thresholds — match the policy locked in 2026-05-21:
 *   • Exact fingerprint match → warn-with-override (NOT block)
 *   • Fuzzy similarity ≥ 0.9  → warn-with-override
 *   • Fuzzy similarity 0.8–0.9 → soft notice (returned in fuzzyMatches but
 *     does NOT trigger isDuplicate=true; UI shows in audit screen only)
 *   • < 0.8 → silent (not returned)
 *
 * Fuzzy match also requires amount within ±1 HUF and performance_date
 * within ±3 days — vendor similarity alone is too noisy.
 */
const FUZZY_LOWER_BOUND = 0.8;
const FUZZY_WARN_THRESHOLD = 0.9;
const AMOUNT_TOLERANCE_HUF = 1;
const DATE_TOLERANCE_DAYS = 3;

class ExpenseDeduplicationService {
  /**
   * Look for likely duplicates of the given candidate expense.
   *
   * @param {Object} candidate
   *   { vendor_name, amount, performance_date, dedup_fingerprint? }
   *   The fingerprint is recomputed if missing.
   * @param {string|null} [excludeId]
   *   ID of an existing expense to exclude from matches (used on update flows
   *   so a row doesn't "match itself"). Null on the create path.
   *
   * @returns {Promise<{
   *   isDuplicate: boolean,
   *   exactMatches: Array<MatchRow>,
   *   fuzzyMatches: Array<MatchRow & {similarity_pct: number, reasons: string[]}>,
   *   confidence: number  // 0-100, highest match confidence
   * }>}
   */
  async checkDuplicates(candidate, excludeId = null) {
    const empty = { isDuplicate: false, exactMatches: [], fuzzyMatches: [], confidence: 0 };

    const { vendor_name, amount, performance_date } = candidate || {};
    if (!vendor_name || amount == null || !performance_date) {
      // Missing the three inputs we'd hash — nothing to compare meaningfully.
      return empty;
    }

    const fingerprint = candidate.dedup_fingerprint
      || generateFingerprint({ vendor_name, amount, performance_date });

    // ─── 1. Exact fingerprint match ───────────────────────────────────
    let exactMatches = [];
    if (fingerprint) {
      const params = [fingerprint];
      let exclude = '';
      if (excludeId) { params.push(excludeId); exclude = ' AND id <> $2'; }

      const exactRes = await query(
        `SELECT id, accommodation_id, vendor_name, amount, performance_date,
                billing_month, invoice_number, created_at, created_by, notes
           FROM accommodation_expenses
          WHERE dedup_fingerprint = $1
            AND deleted_at IS NULL
            ${exclude}
          ORDER BY created_at DESC
          LIMIT 10`,
        params,
      );
      exactMatches = exactRes.rows.map((r) => ({
        id: r.id,
        accommodation_id: r.accommodation_id,
        vendor_name: r.vendor_name,
        amount: parseFloat(r.amount),
        performance_date: r.performance_date,
        billing_month: r.billing_month,
        invoice_number: r.invoice_number,
        created_at: r.created_at,
        created_by: r.created_by,
        notes: r.notes,
      }));
    }

    // ─── 2. Fuzzy match ───────────────────────────────────────────────
    //
    // Uses the pg_trgm GIN index on lower(vendor_name) for fast candidate
    // lookup (the `%` operator is the trigram bool match, threshold default
    // 0.3 — we tighten with similarity() in the SELECT and filter to
    // FUZZY_LOWER_BOUND below).
    //
    // We also exclude rows already in exactMatches (same fingerprint) so we
    // don't double-report the same row.
    const excludeFpClause = fingerprint
      ? `AND (dedup_fingerprint IS NULL OR dedup_fingerprint <> $5)`
      : '';
    const params = [
      vendor_name,
      performance_date,
      amount,
      excludeId,
    ];
    if (fingerprint) params.push(fingerprint);

    const fuzzyRes = await query(
      `SELECT id, accommodation_id, vendor_name, amount, performance_date,
              billing_month, invoice_number, dedup_fingerprint,
              created_at, created_by, notes,
              similarity(lower(vendor_name), lower($1)) AS sim
         FROM accommodation_expenses
        WHERE deleted_at IS NULL
          AND vendor_name IS NOT NULL
          AND lower(vendor_name) % lower($1)
          AND performance_date BETWEEN
                $2::date - INTERVAL '${DATE_TOLERANCE_DAYS} days'
            AND $2::date + INTERVAL '${DATE_TOLERANCE_DAYS} days'
          AND ABS(amount - $3) <= ${AMOUNT_TOLERANCE_HUF}
          AND ($4::uuid IS NULL OR id <> $4::uuid)
          ${excludeFpClause}
        ORDER BY sim DESC, created_at DESC
        LIMIT 20`,
      params,
    );

    const fuzzyMatches = fuzzyRes.rows
      .filter((r) => Number(r.sim) >= FUZZY_LOWER_BOUND)
      .map((r) => {
        const sim = Number(r.sim);
        const pct = Math.round(sim * 100);
        const reasons = [
          `Beszállító név hasonlóság: ${pct}%`,
          `Összeg eltérés ≤ ${AMOUNT_TOLERANCE_HUF} Ft`,
          `Teljesítés dátum ±${DATE_TOLERANCE_DAYS} nap`,
        ];
        return {
          id: r.id,
          accommodation_id: r.accommodation_id,
          vendor_name: r.vendor_name,
          amount: parseFloat(r.amount),
          performance_date: r.performance_date,
          billing_month: r.billing_month,
          invoice_number: r.invoice_number,
          created_at: r.created_at,
          created_by: r.created_by,
          notes: r.notes,
          similarity_pct: pct,
          reasons,
        };
      });

    // ─── 3. Aggregate ─────────────────────────────────────────────────
    const triggeringFuzzy = fuzzyMatches.filter((m) => m.similarity_pct >= FUZZY_WARN_THRESHOLD * 100);
    const isDuplicate = exactMatches.length > 0 || triggeringFuzzy.length > 0;

    let confidence = 0;
    if (exactMatches.length > 0) confidence = 100;
    else if (fuzzyMatches.length > 0) confidence = fuzzyMatches[0].similarity_pct;

    return { isDuplicate, exactMatches, fuzzyMatches, confidence };
  }

  /** Expose thresholds for tests + UI labels. */
  get thresholds() {
    return {
      FUZZY_LOWER_BOUND,
      FUZZY_WARN_THRESHOLD,
      AMOUNT_TOLERANCE_HUF,
      DATE_TOLERANCE_DAYS,
    };
  }
}

module.exports = new ExpenseDeduplicationService();
