/**
 * Per-bed billing formula (Phase 1b) — pure unit test of computeGroupRevenue's
 * per_bed_night branch against the owner-confirmed worked examples. No DB.
 *
 *   full    = max(occupied, ceil(capacity × occupancy_floor_pct))
 *   reduced = max(0, capacity − full)
 *   net/day = full × rate_used + reduced × rate_empty     (summed over the month)
 */
const { computeGroupRevenue } = require('../../src/services/billingEngine.service');

const MONTH = '2025-06';
const DAYS = 30;

// `occ` distinct employees present on every day of the month.
function rows(occ) {
  const [Y, M] = MONTH.split('-').map(Number);
  const out = [];
  for (let d = 1; d <= DAYS; d++) for (let e = 1; e <= occ; e++) out.push({ snapshot_date: new Date(Y, M - 1, d), employee_id: `emp${e}` });
  return out;
}
const rate = (o) => ({ billing_basis: 'per_bed_night', vat_rate: 0.27, vat_exempt: false, ...o });
const run = (occ, r, accBeds = 500) =>
  computeGroupRevenue(rows(occ), () => r, 'A', 'C', DAYS, { month: MONTH, accBeds });

describe('per_bed_night billing formula', () => {
  test('cap100 / used3500 / empty1500 / floor90% — worked examples (per night × 30)', () => {
    const r = rate({ rate_used: 3500, rate_empty: 1500, occupancy_floor_pct: 0.9, contracted_beds: 100 });
    expect(run(95, r).base_net).toBe(340000 * DAYS); // full 95, reduced 5
    expect(run(80, r).base_net).toBe(330000 * DAYS); // floor lifts full to 90, reduced 10
    expect(run(92, r).base_net).toBe(334000 * DAYS); // full 92, reduced 8
  });

  test('Autoliv 60 beds @ Mór 90% floor, occupied 40 (≤54) → 198000/night', () => {
    const r = rate({ rate_used: 3500, rate_empty: 1500, occupancy_floor_pct: 0.9, contracted_beds: 60 });
    const rev = run(40, r);
    expect(rev.base_net).toBe(198000 * DAYS);              // 54×3500 + 6×1500
    expect(rev.per_bed.avg_full_beds).toBe(54);            // billed at the floor
    expect(rev.per_bed.reduced_bed_nights).toBe(6 * DAYS); // empty beds in the block
    expect(rev.vat).toBe(198000 * DAYS * 0.27);
  });

  test('over-occupancy: occupied 65 on a 60-bed block → all 65 at rate_used, reduced clamped to 0', () => {
    const r = rate({ rate_used: 3500, rate_empty: 1500, occupancy_floor_pct: 0.9, contracted_beds: 60 });
    const rev = run(65, r);
    expect(rev.base_net).toBe(65 * 3500 * DAYS);
    expect(rev.per_bed.reduced_bed_nights).toBe(0);
  });

  test('degenerate floor0 / empty0 → plain per-occupied-bed', () => {
    const r = rate({ rate_used: 3000, rate_empty: 0, occupancy_floor_pct: 0, contracted_beds: 100 });
    expect(run(42, r).base_net).toBe(42 * 3000 * DAYS);
  });

  test('capacity fallback: contracted_beds null → uses physical accBeds', () => {
    const r = rate({ rate_used: 3500, rate_empty: 1500, occupancy_floor_pct: 0.9, contracted_beds: null });
    const rev = run(40, r, 60);
    expect(rev.base_net).toBe(198000 * DAYS);
    expect(rev.per_bed.capacity).toBe(60);
    expect(rev.per_bed.contracted_beds).toBeNull();
  });

  test('VAT-exempt → 0 VAT, gross = net', () => {
    const r = rate({ rate_used: 3500, rate_empty: 0, occupancy_floor_pct: 0, contracted_beds: 50, vat_exempt: true });
    const rev = run(50, r);
    expect(rev.vat).toBe(0);
    expect(rev.gross).toBe(rev.net);
  });
});
