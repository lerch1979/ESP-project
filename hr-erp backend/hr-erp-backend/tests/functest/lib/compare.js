/**
 * Expected-vs-actual comparison for the functest harness.
 *
 * The whole point of this suite is that a scenario asserts a VALUE, not a status
 * code — so the comparator has to be precise about the two things that otherwise
 * generate false results in this codebase:
 *   • money arrives as pg numeric STRINGS ("210000.00") — compared numerically;
 *   • per-day round2 accumulation drifts by fillér (DEEP_AUDIT #19) — so numbers
 *     compare within EPS unless a case opts into exactness.
 */
const EPS = 0.005; // half a fillér — tighter than any real drift, looser than float noise

const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)));

/**
 * Compare `actual` against `expected`. Only keys PRESENT in `expected` are checked,
 * so a scenario can assert three fields of a fat row without pinning the rest.
 * @returns {{ok: boolean, diffs: string[]}}
 */
function compare(expected, actual, { eps = EPS, path = '', diffs = [] } = {}) {
  const at = path || '(root)';

  if (expected === null || expected === undefined) {
    if (actual !== expected) diffs.push(`${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return { ok: diffs.length === 0, diffs };
  }

  if (typeof expected === 'number') {
    if (!isNum(actual)) {
      diffs.push(`${at}: expected number ${expected}, got ${JSON.stringify(actual)}`);
    } else if (Math.abs(Number(actual) - expected) > eps) {
      diffs.push(`${at}: expected ${expected}, got ${Number(actual)} (Δ ${(Number(actual) - expected).toFixed(4)})`);
    }
    return { ok: diffs.length === 0, diffs };
  }

  if (expected instanceof RegExp) {
    if (!expected.test(String(actual ?? ''))) diffs.push(`${at}: ${JSON.stringify(actual)} does not match ${expected}`);
    return { ok: diffs.length === 0, diffs };
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      diffs.push(`${at}: expected an array of ${expected.length}, got ${JSON.stringify(actual)}`);
      return { ok: false, diffs };
    }
    if (actual.length !== expected.length) diffs.push(`${at}.length: expected ${expected.length}, got ${actual.length}`);
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
      compare(expected[i], actual[i], { eps, path: `${path}[${i}]`, diffs });
    }
    return { ok: diffs.length === 0, diffs };
  }

  if (typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') {
      diffs.push(`${at}: expected an object, got ${JSON.stringify(actual)}`);
      return { ok: false, diffs };
    }
    for (const k of Object.keys(expected)) {
      compare(expected[k], actual[k], { eps, path: path ? `${path}.${k}` : k, diffs });
    }
    return { ok: diffs.length === 0, diffs };
  }

  // booleans + strings — strict
  if (actual !== expected) diffs.push(`${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  return { ok: diffs.length === 0, diffs };
}

/** One-line render for the report table (pipes escaped, long values clipped). */
function render(v, max = 190) {
  let s;
  if (v === undefined) s = '—';
  else if (typeof v === 'string') s = v;
  else if (v instanceof RegExp) s = String(v);
  else {
    // JSON.stringify turns a RegExp into "{}" — show the pattern instead, at any depth.
    try { s = JSON.stringify(v, (_k, val) => (val instanceof RegExp ? `~${val.source}~` : val)); }
    catch { s = String(v); }
  }
  s = String(s).replace(/\s+/g, ' ').replace(/\|/g, '\\|');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

module.exports = { compare, render, EPS };
