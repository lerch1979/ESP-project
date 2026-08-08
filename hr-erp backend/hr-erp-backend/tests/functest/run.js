#!/usr/bin/env node
/**
 * FUNCTEST — one command that exercises the whole system end-to-end against the
 * sandbox and reports every scenario's ACTUAL output against its EXPECTED output.
 *
 *   npm run functest                       reset sandbox → seed → run everything → write the report
 *   npm run functest -- --no-reset         reuse the current sandbox (fast iteration)
 *   npm run functest -- --only=BILLING     one area (BILLING CONSOLIDATION PERMISSIONS REPORTS DATA AUTOMATIONS COMPOSED)
 *   npm run functest -- --case=BILL-05     one scenario
 *   npm run functest -- --keep             leave the fixture in the DB for manual poking
 *
 * SANDBOX ONLY. The guard (tests/functest/lib/guard.js) checks the env AND the live
 * connection; nothing runs unless both say "sandbox on localhost".
 *
 * Exit code is 1 only on FAIL. KNOWN-GAP rows are documented-open findings — they are
 * reported loudly but do not fail the run (see docs/FUNCTEST_PLAN.md).
 */
// TZ before anything constructs a Date: the app runs in Europe/Budapest, pg hands back
// DATE columns as local-midnight, and REP-15 asserts a UTC-vs-local boundary.
process.env.TZ = process.env.TZ || 'Europe/Budapest';
require('dotenv').config();
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'production' : 'test';

const path = require('path');
const { execFileSync } = require('child_process');
const { assertSandboxEnv, assertSandboxLive } = require('./lib/guard');
const { compare } = require('./lib/compare');
const report = require('./lib/report');

const ROOT = path.join(__dirname, '..', '..');
const REPO_ROOT = path.join(ROOT, '..', '..');
const OUT = path.join(REPO_ROOT, 'docs', 'FUNCTEST_REPORT.md');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const listVal = (n) => { const v = val(n); return v ? v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null; };

const DO_RESET = !flag('no-reset');
const ONLY = listVal('only');
const CASES = listVal('case');
const KEEP = flag('keep');

const MODULES = [
  './scenarios/billing',
  './scenarios/costModel',
  './scenarios/consolidation',
  './scenarios/permissions',
  './scenarios/reports',
  './scenarios/dataIntegrity',
  './scenarios/automations',
  './scenarios/composed',
];

const c = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[34m', d: '\x1b[2m', x: '\x1b[0m' };
const label = { PASS: `${c.g}PASS${c.x}`, FAIL: `${c.r}FAIL${c.x}`, 'KNOWN-GAP': `${c.y}GAP ${c.x}`, FIXED: `${c.g}FIXD${c.x}`, SKIP: `${c.d}SKIP${c.x}` };

async function main() {
  const started = Date.now();

  // ── 1. Guard: env-level, BEFORE anything opens a connection ──
  const envInfo = assertSandboxEnv();
  console.log(`${c.b}▶ FUNCTEST${c.x}  target=${envInfo.name}@${envInfo.host}  reset=${DO_RESET}${ONLY ? `  only=${ONLY}` : ''}${CASES ? `  case=${CASES}` : ''}`);

  // ── 2. Optional full sandbox reset (drop → migrate from scratch → base seed) ──
  if (DO_RESET) {
    console.log(`${c.d}  resetting sandbox (drop + migrate + base seed)…${c.x}`);
    execFileSync('bash', [path.join(ROOT, 'scripts', 'sandbox-reset.sh')], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, SANDBOX_DB: envInfo.name },
    });
  }

  // Require the DB layer only AFTER the env guard has passed.
  const db = require('../../src/database/connection');
  const fixture = require('./fixture');
  const occ = require('../../src/services/occupancyTracking.service');
  const engine = require('../../src/services/billingEngine.service');

  // ── 3. Guard: live-level, on the pool the services themselves use ──
  const liveDb = await assertSandboxLive(db.query);
  console.log(`${c.d}  guard ok — connected to ${liveDb}${c.x}`);

  // ── 4. Build the fixture world, snapshot the month, run the billing engine once ──
  console.log(`${c.d}  building fixture (${fixture.MONTH})…${c.x}`);
  await fixture.teardown();
  const ids = await fixture.build();
  const snapshotRows = await fixture.snapshotMonth(occ);
  const billing = await engine.calculateMonthlyBilling(fixture.MONTH, { notes: 'FUNCTEST' });
  console.log(`${c.d}  fixture ready — ${snapshotRows} snapshots, run ${billing.run_id} (${billing.billing_count} billings)${c.x}`);

  /** Live lookup of an accommodation's billing row(s) on the ACTIVE (non-cancelled) run. */
  const bills = async (accId, clientId) => (await db.query(
    `SELECT ab.* FROM accommodation_billings ab
       JOIN billing_runs br ON br.id = ab.billing_run_id
      WHERE ab.billing_month = $1 AND ab.accommodation_id = $2
        AND ab.status <> 'cancelled' AND br.status <> 'cancelled'
        ${clientId ? 'AND ab.partner_contractor_id = $3' : ''}`,
    clientId ? [fixture.MONTH, accId, clientId] : [fixture.MONTH, accId])).rows;

  const ctx = {
    ids, db, query: db.query, month: fixture.MONTH, days: fixture.DAYS, tag: fixture.TAG,
    day: fixture.day, fixture, occ, engine, billing, snapshotRows, bills,
    bill: async (accId, clientId) => (await bills(accId, clientId))[0],
    ROOT,
  };

  // ── 5. Run the scenario modules ──
  const results = [];
  for (const modPath of MODULES) {
    const mod = require(modPath);
    if (ONLY && !ONLY.includes(mod.area.toUpperCase())) continue;
    const cases = mod.cases.filter((k) => !CASES || CASES.includes(k.id.toUpperCase()));
    if (cases.length === 0) continue;

    console.log(`\n${c.b}── ${mod.area}${c.x} ${c.d}${mod.title || ''}${c.x}`);
    let state = null;
    let setupError = null;
    if (mod.setup) {
      try { state = await mod.setup(ctx); }
      catch (e) { setupError = e; console.log(`  ${c.r}setup failed:${c.x} ${e.message}`); }
    }

    for (const k of cases) {
      const row = { id: k.id, area: mod.area, name: k.name, expected: k.expected, gap: k.gap, hint: k.hint, sql: k.sql };
      if (setupError) {
        row.actual = `setup failed: ${setupError.message}`;
        row.error = setupError.message;
        row.stack = setupError.stack;
        row.result = k.gap ? 'KNOWN-GAP' : 'FAIL';
      } else {
        try {
          const actual = await k.run(ctx, state);
          row.actual = actual;
          const { ok, diffs } = compare(k.expected, actual);
          row.diffs = diffs;
          row.result = k.gap ? (ok ? 'FIXED' : 'KNOWN-GAP') : (ok ? 'PASS' : 'FAIL');
        } catch (e) {
          row.actual = `threw: ${e.message}`;
          row.error = e.message;
          row.stack = e.stack;
          row.result = k.gap ? 'KNOWN-GAP' : 'FAIL';
        }
      }
      results.push(row);
      console.log(`  ${label[row.result]}  ${row.id.padEnd(9)} ${row.name}`);
      if (row.result === 'FAIL' && row.diffs?.length) for (const d of row.diffs.slice(0, 4)) console.log(`         ${c.r}↳${c.x} ${d}`);
      if (row.result === 'FAIL' && row.error) console.log(`         ${c.r}↳${c.x} ${row.error.split('\n')[0]}`);
    }
  }

  // ── 6. Report ──
  const meta = {
    generatedAt: new Date().toISOString(), database: liveDb, month: fixture.MONTH,
    tag: fixture.TAG, reset: DO_RESET, durationMs: Date.now() - started,
  };
  report.write(results, meta, OUT);

  const t = report.tally(results);
  const line = report.summaryLine(results);
  console.log(`\n${t.FAIL ? c.r : c.g}${line}${c.x}`);
  console.log(`${c.d}report → ${path.relative(REPO_ROOT, OUT)}${c.x}`);

  if (!KEEP) await fixture.teardown();
  else console.log(`${c.d}--keep: fixture left in ${liveDb}${c.x}`);

  await db.pool.end().catch(() => {});
  process.exit(t.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e.guard ? e.message : e);
  process.exit(2);
});
