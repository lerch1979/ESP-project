/**
 * FUNCTEST report writer → docs/FUNCTEST_REPORT.md
 *
 * One plain table: scenario · expected · actual · result. Every FAIL gets an exact
 * repro block (the single-case command + the diff + any scenario-supplied hint).
 *
 * Four result states:
 *   PASS       — actual matched expected
 *   FAIL       — a real defect or regression; fails the run (exit 1)
 *   KNOWN-GAP  — asserts CORRECT behaviour against a feature that is documented as
 *                missing/broken (DEEP_AUDIT rows, unbuilt consolidation constraints).
 *                Reported, does NOT fail the run. Flips to FIXED on its own the day
 *                the underlying gap is closed.
 *   FIXED      — a KNOWN-GAP case that now passes → close the gap in the docs.
 */
const fs = require('fs');
const path = require('path');
const { render } = require('./compare');

const ICON = { PASS: '✅ PASS', FAIL: '❌ FAIL', 'KNOWN-GAP': '⚠️ KNOWN-GAP', FIXED: '🎉 FIXED', SKIP: '⏭️ SKIP' };

function tally(results) {
  const t = { PASS: 0, FAIL: 0, 'KNOWN-GAP': 0, FIXED: 0, SKIP: 0 };
  for (const r of results) t[r.result] = (t[r.result] || 0) + 1;
  return t;
}

function summaryLine(results) {
  const t = tally(results);
  let s = `${t.PASS} passed / ${t.FAIL} failed`;
  if (t['KNOWN-GAP']) s += ` / ${t['KNOWN-GAP']} known-gap`;
  if (t.FIXED) s += ` / ${t.FIXED} fixed`;
  if (t.SKIP) s += ` / ${t.SKIP} skipped`;
  return s;
}

function build(results, meta) {
  const t = tally(results);
  const L = [];
  const areas = [...new Set(results.map((r) => r.area))];

  L.push('# FUNCTEST REPORT — automated end-to-end functional suite');
  L.push('');
  L.push(`**${summaryLine(results)}**  ·  ${results.length} scenarios  ·  ${meta.durationMs}ms`);
  L.push('');
  L.push(`- Generated: ${meta.generatedAt}`);
  L.push(`- Database: \`${meta.database}\` (sandbox-only — the guard refuses anything else)`);
  L.push(`- Command: \`npm run functest\`${meta.reset ? '' : ' (this run used `--no-reset`)'}`);
  L.push(`- Fixture month: \`${meta.month}\` · fixture tag: \`${meta.tag}\``);
  L.push('');
  L.push('| State | Meaning |');
  L.push('|---|---|');
  L.push('| ✅ PASS | actual == expected |');
  L.push('| ❌ FAIL | real defect or regression — **fails the run** |');
  L.push('| ⚠️ KNOWN-GAP | asserts correct behaviour against a documented missing/broken feature; reported, does not fail the run |');
  L.push('| 🎉 FIXED | a KNOWN-GAP case now passes — close the gap in the docs |');
  L.push('');
  L.push('---');
  L.push('');

  for (const area of areas) {
    const rows = results.filter((r) => r.area === area);
    const at = tally(rows);
    L.push(`## ${area} — ${at.PASS} passed / ${at.FAIL} failed${at['KNOWN-GAP'] ? ` / ${at['KNOWN-GAP']} known-gap` : ''}${at.FIXED ? ` / ${at.FIXED} fixed` : ''}`);
    L.push('');
    L.push('| Scenario | Expected | Actual | Result |');
    L.push('|---|---|---|---|');
    for (const r of rows) {
      L.push(`| **${r.id}** ${r.name} | ${render(r.expected)} | ${render(r.actual)} | ${ICON[r.result] || r.result} |`);
    }
    L.push('');
  }

  const bad = results.filter((r) => r.result === 'FAIL');
  if (bad.length) {
    L.push('---');
    L.push('');
    L.push(`## ❌ Failures — exact repro (${bad.length})`);
    L.push('');
    for (const r of bad) {
      L.push(`### ${r.id} — ${r.name}`);
      L.push('');
      L.push(`- **Area:** ${r.area}`);
      L.push(`- **Expected:** \`${render(r.expected, 500)}\``);
      L.push(`- **Actual:** \`${render(r.actual, 500)}\``);
      if (r.diffs && r.diffs.length) {
        L.push('- **Diff:**');
        for (const d of r.diffs) L.push(`  - \`${d.replace(/\|/g, '\\|')}\``);
      }
      if (r.error) L.push(`- **Error:** \`${String(r.error).split('\n')[0]}\``);
      if (r.hint) L.push(`- **Where to look:** ${r.hint}`);
      L.push('- **Repro:**');
      L.push('');
      L.push('  ```bash');
      L.push('  cd "hr-erp backend/hr-erp-backend"');
      L.push(`  npm run functest -- --no-reset --case=${r.id}     # against the CURRENT sandbox state`);
      L.push(`  npm run functest -- --only=${r.area}              # rebuild the fixture, whole area`);
      L.push('  ```');
      if (r.sql) {
        L.push('  Inspect the seeded state:');
        L.push('');
        L.push('  ```sql');
        for (const line of [].concat(r.sql)) L.push(`  ${line}`);
        L.push('  ```');
      }
      L.push('');
      if (r.stack) {
        L.push('<details><summary>stack</summary>');
        L.push('');
        L.push('```');
        L.push(r.stack.split('\n').slice(0, 12).join('\n'));
        L.push('```');
        L.push('');
        L.push('</details>');
        L.push('');
      }
    }
  }

  const gaps = results.filter((r) => r.result === 'KNOWN-GAP');
  if (gaps.length) {
    L.push('---');
    L.push('');
    L.push(`## ⚠️ Known gaps (${gaps.length}) — documented, not regressions`);
    L.push('');
    L.push('These assert the CORRECT behaviour. They fail because the feature is missing or');
    L.push('the bug is still open. Each flips to 🎉 FIXED automatically once closed.');
    L.push('');
    L.push('| Scenario | Gap | Expected (correct) | Actual (today) |');
    L.push('|---|---|---|---|');
    for (const r of gaps) L.push(`| **${r.id}** ${r.name} | ${render(r.gap, 120)} | ${render(r.expected, 90)} | ${render(r.actual, 90)} |`);
    L.push('');
  }

  const fixed = results.filter((r) => r.result === 'FIXED');
  if (fixed.length) {
    L.push('---');
    L.push('');
    L.push(`## 🎉 Gaps that now pass (${fixed.length}) — update the docs`);
    L.push('');
    for (const r of fixed) L.push(`- **${r.id}** ${r.name} — was: ${render(r.gap, 200)}`);
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push(`_Generated by \`tests/functest/\` — ${summaryLine(results)}. Regenerate with \`npm run functest\`._`);
  L.push('');
  return L.join('\n');
}

function write(results, meta, outPath) {
  const md = build(results, meta);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, 'utf8');
  return outPath;
}

module.exports = { write, build, summaryLine, tally, ICON };
