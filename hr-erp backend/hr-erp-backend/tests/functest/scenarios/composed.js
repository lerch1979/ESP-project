/**
 * COMPOSED — the existing jest suites that already own a piece of this ground, re-run
 * as part of the one command and folded into the same report.
 *
 * The point is NOT to duplicate the 1434 CI tests. These six are the suites whose subject
 * matter overlaps the functest areas, so a functest report that ignored them would be
 * telling half the story. Everything else stays where it is and runs in CI.
 *
 * One jest process runs all of them (a process per suite would triple the wall time);
 * per-file results are read back out of the JSON summary.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const SUITES = [
  { file: 'tests/integration/billingPerBed.test.js', why: 'per-bed formula, pure unit — the owner\'s worked examples' },
  { file: 'tests/integration/billingProfileMatrix.test.js', why: 'company/private × taxable/exempt × flat/per_person × invoicing on/off' },
  { file: 'tests/integration/billingEngineOptionC.test.js', why: 'engine regression — net revenue unchanged' },
  { file: 'tests/residentLeakGuards.test.js', why: 'DEEP_AUDIT 1-4 route-level guards (mocked layer)' },
  { file: 'tests/deductionExecutionMothball.test.js', why: 'the deduction executor stays mothballed behind its flag' },
  { file: 'tests/damageReportAuthz.test.js', why: 'damage-report authz + tenant scope (resident IDOR)' },
];

module.exports = {
  area: 'COMPOSED',
  title: 'existing jest suites re-run in-place and folded into this report',

  async setup(ctx) {
    const out = path.join(os.tmpdir(), `functest-jest-${process.pid}.json`);
    let raw = null;
    let error = null;
    try {
      execFileSync('npx', ['jest', '--runTestsByPath', ...SUITES.map((s) => s.file), '--json', `--outputFile=${out}`, '--silent', '--forceExit'],
        { cwd: ctx.ROOT, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, NODE_ENV: 'test' }, timeout: 300000 });
    } catch (e) {
      // jest exits non-zero when a test fails — that is data, not a harness error.
      error = e.status === undefined ? e.message : null;
    }
    try { raw = JSON.parse(fs.readFileSync(out, 'utf8')); fs.unlinkSync(out); } catch (e) { error = error || `no jest output: ${e.message}`; }

    const byFile = new Map();
    for (const r of raw?.testResults || []) {
      byFile.set(path.relative(ctx.ROOT, r.name), {
        passed: r.assertionResults.filter((a) => a.status === 'passed').length,
        failed: r.assertionResults.filter((a) => a.status === 'failed').length,
        total: r.assertionResults.length,
        failures: r.assertionResults.filter((a) => a.status === 'failed').map((a) => a.fullName),
        message: (r.message || '').split('\n').slice(0, 3).join(' ').trim(),
      });
    }
    return { byFile, error, raw };
  },

  cases: SUITES.map((s, i) => ({
    id: `COMP-${String(i + 1).padStart(2, '0')}`,
    name: `${path.basename(s.file)} — ${s.why}`,
    expected: { failed: 0, ran: true },
    hint: `run it alone: cd "hr-erp backend/hr-erp-backend" && npx jest ${s.file}`,
    run: async (ctx, st) => {
      const r = st.byFile.get(s.file);
      if (!r) return { failed: null, ran: false, error: st.error || 'suite produced no result' };
      return { failed: r.failed, ran: true, _passed: r.passed, _total: r.total, ...(r.failed ? { _failures: r.failures.slice(0, 3) } : {}) };
    },
  })),
};
