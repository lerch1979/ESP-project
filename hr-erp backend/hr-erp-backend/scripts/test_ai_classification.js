/**
 * Manual smoke test for the AI assistant's category auto-classification.
 *
 * Usage (from hr-erp-backend/):
 *   node scripts/test_ai_classification.js
 *
 * Requires:
 *   - ANTHROPIC_API_KEY in .env
 *   - DB reachable so _loadUserProfile works (or pass --no-db to skip lookup)
 *
 * Note: this hits the real Claude API. Each test message ~= 1 cheap call.
 */
require('dotenv').config();
const path = require('path');

const ai = require(path.join('..', 'src', 'services', 'aiAssistant.service'));
const { query } = require(path.join('..', 'src', 'database', 'connection'));

const SAMPLES = [
  {
    msg: 'Csöpög a csap a fürdőben',
    expect: { parent: 'technical', sub: 'tech_plumbing', worker: 'plumbing' },
  },
  {
    msg: 'Áramszünet az 5. szobában',
    expect: { parent: 'technical', sub: 'tech_electrical', worker: 'electrical' },
  },
  {
    msg: 'Gázszag van!',
    expect: { parent: 'technical', sub: 'tech_gas', worker: 'gas', severity: 'emergency' },
  },
  {
    msg: 'Mosógép nem indul',
    expect: { parent: 'appliance', sub: 'appl_large' },
  },
  {
    msg: 'Egér a konyhában!',
    expect: { parent: 'hygiene', sub: 'hyg_pests', worker: 'cleaning' },
  },
];

(async () => {
  // Use a real active user so the DB profile lookup succeeds. Pick any —
  // the prompt only uses display fields (name, room, workplace).
  const r = await query(`SELECT id FROM users WHERE is_active = TRUE LIMIT 1`);
  const userId = r.rows[0]?.id;
  if (!userId) {
    console.error('No active users found in DB.');
    process.exit(2);
  }

  let pass = 0;
  for (const [i, t] of SAMPLES.entries()) {
    const out = await ai.analyzeMessage(userId, t.msg);
    const e = out.entities || {};
    const ok =
      (!t.expect.parent   || e.parent_category_slug === t.expect.parent) &&
      (!t.expect.sub      || e.sub_category_slug   === t.expect.sub) &&
      (!t.expect.worker   || e.suggested_worker_type === t.expect.worker) &&
      (!t.expect.severity || e.severity === t.expect.severity);
    if (ok) pass++;

    console.log(`\n[${i + 1}] ${t.msg}`);
    console.log(`    intent=${out.intent}  confidence=${out.confidence}`);
    console.log(`    parent=${e.parent_category_slug}  sub=${e.sub_category_slug}`);
    console.log(`    severity=${e.severity}  worker=${e.suggested_worker_type}  est_h=${e.estimated_time_hours}`);
    console.log(`    expected: ${JSON.stringify(t.expect)}`);
    console.log(`    -> ${ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(`\n${pass}/${SAMPLES.length} samples classified as expected.`);
  process.exit(pass === SAMPLES.length ? 0 : 1);
})().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(2);
});
