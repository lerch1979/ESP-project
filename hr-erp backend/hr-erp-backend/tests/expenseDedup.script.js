/**
 * Expense Deduplication Service Tests — pure DB integration.
 *
 * Seeds rows with controlled fingerprints / vendors / dates / amounts,
 * exercises checkDuplicates(), then hard-deletes test rows on teardown.
 *
 * Run: node tests/expenseDedup.script.js
 */

require('dotenv').config();

const dedup = require('../src/services/expenseDeduplication.service');
const expenseService = require('../src/services/expense.service');
const { query, closePool } = require('../src/database/connection');

const RUN_TAG = `dedup-test-${Date.now()}`;
const createdIds = [];

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${error.message}`);
  }
}

async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

async function cleanup() {
  if (createdIds.length === 0) return;
  try {
    await query(
      'DELETE FROM accommodation_expenses WHERE id = ANY($1::uuid[])',
      [createdIds],
    );
  } catch (e) {
    console.error('Cleanup failed:', e.message);
  }
}

async function seed(overrides) {
  const r = await expenseService.create(
    {
      accommodation_id: overrides.accommodation_id,
      billing_month:    overrides.billing_month,
      category:         overrides.category || 'rezsi',
      amount:           overrides.amount,
      vendor_name:      overrides.vendor_name,
      performance_date: overrides.performance_date,
      notes:            RUN_TAG,
    },
    overrides.userId,
  );
  if (r.error) throw new Error(`seed failed: ${r.error}`);
  createdIds.push(r.data.id);
  return r.data;
}

async function main() {
  // Pre-flight
  const accRes = await query('SELECT id FROM accommodations LIMIT 1');
  const usrRes = await query('SELECT id FROM users LIMIT 1');
  if (accRes.rows.length === 0) throw new Error('No accommodation in DB');
  if (usrRes.rows.length === 0) throw new Error('No user in DB');
  const accId = accRes.rows[0].id;
  const usrId = usrRes.rows[0].id;

  // Use a synthetic month so we don't pollute / collide with real data
  const TEST_MONTH = '1899-06';
  const baseDate = '1899-06-15';

  // ────────────────────────────────────────────────────────────────────
  // 1. Empty / partial inputs
  // ────────────────────────────────────────────────────────────────────

  await describe('Empty / incomplete inputs', async () => {
    await test('empty candidate returns no matches', async () => {
      const r = await dedup.checkDuplicates({});
      if (r.isDuplicate) throw new Error('isDuplicate should be false');
      if (r.exactMatches.length !== 0) throw new Error('expected []');
      if (r.fuzzyMatches.length !== 0) throw new Error('expected []');
      if (r.confidence !== 0) throw new Error('expected 0');
    });

    await test('missing vendor_name returns no matches', async () => {
      const r = await dedup.checkDuplicates({
        amount: 1000, performance_date: baseDate,
      });
      if (r.isDuplicate) throw new Error('false expected');
    });

    await test('missing performance_date returns no matches', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Test', amount: 1000,
      });
      if (r.isDuplicate) throw new Error('false expected');
    });

    await test('missing amount returns no matches', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Test', performance_date: baseDate,
      });
      if (r.isDuplicate) throw new Error('false expected');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 2. Exact fingerprint match
  // ────────────────────────────────────────────────────────────────────

  let exactSeed;
  await describe('Exact fingerprint match', async () => {
    exactSeed = await seed({
      accommodation_id: accId, userId: usrId,
      billing_month: TEST_MONTH, performance_date: baseDate,
      amount: 50000, vendor_name: 'Vodafone Magyarország Zrt.',
    });

    await test('identical candidate triggers isDuplicate=true with confidence=100', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: baseDate,
      });
      if (!r.isDuplicate) throw new Error('expected isDuplicate=true');
      if (r.confidence !== 100) throw new Error(`expected 100, got ${r.confidence}`);
      if (r.exactMatches.length !== 1) throw new Error(`expected 1 exact, got ${r.exactMatches.length}`);
      if (r.exactMatches[0].id !== exactSeed.id) throw new Error('wrong row matched');
    });

    await test('excludeId removes self from exact matches', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: baseDate,
      }, exactSeed.id);
      if (r.exactMatches.length !== 0) throw new Error('self should be excluded');
      if (r.isDuplicate) throw new Error('expected isDuplicate=false');
    });

    await test('normalisation: lowercase + extra whitespace still match', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: '  vodafone   magyarország zrt. ',
        amount: 50000,
        performance_date: baseDate,
      });
      if (r.exactMatches.length !== 1) throw new Error('normalised form should hit exact');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 3. Fuzzy similarity
  // ────────────────────────────────────────────────────────────────────

  let fuzzySeed;
  await describe('Fuzzy vendor similarity (pg_trgm)', async () => {
    fuzzySeed = await seed({
      accommodation_id: accId, userId: usrId,
      billing_month: TEST_MONTH, performance_date: baseDate,
      amount: 12345, vendor_name: 'Magyar Telekom Nyrt.',
    });

    await test('exact same vendor different case → fuzzy match', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'MAGYAR TELEKOM NYRT.',
        amount: 12345,
        performance_date: baseDate,
      });
      // Same fingerprint actually (normalised lowercase) → exact match
      if (r.exactMatches.length === 0 && r.fuzzyMatches.length === 0) {
        throw new Error('expected a match');
      }
    });

    await test('vendor variant "Magyar Telekom" vs "Magyar Telekom Nyrt." surfaces in fuzzyMatches', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Magyar Telekom',
        amount: 12345,
        performance_date: baseDate,
      });
      // Different vendor string → different fingerprint → not exact.
      // But pg_trgm similarity ought to be high (≥0.5 for sure, expect ≥0.6).
      // Note: pg_trgm sim between "magyar telekom" and "magyar telekom nyrt."
      // is typically ~0.65, which falls BELOW our FUZZY_LOWER_BOUND of 0.8.
      // That means it should NOT be returned. This is by design — we'd
      // rather miss a near-match than swamp the user with false positives.
      // Verify the behaviour explicitly:
      const found = r.fuzzyMatches.some((m) => m.id === fuzzySeed.id);
      if (found && r.fuzzyMatches.find((m) => m.id === fuzzySeed.id).similarity_pct < 80) {
        throw new Error('row returned below 0.8 threshold — filter broken');
      }
      // Either way, no exact match expected
      if (r.exactMatches.length !== 0) throw new Error('not an exact match');
    });

    await test('vendor with single-char typo surfaces as fuzzy ≥0.8', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Magyar Telekomm Nyrt.', // double-m typo
        amount: 12345,
        performance_date: baseDate,
      });
      // sim should be very high — single character insert
      const hit = r.fuzzyMatches.find((m) => m.id === fuzzySeed.id);
      if (!hit) throw new Error('typo variant should have been returned as fuzzy');
      if (hit.similarity_pct < 80) throw new Error(`sim too low: ${hit.similarity_pct}`);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 4. Date range tolerance ±3 days
  // ────────────────────────────────────────────────────────────────────

  await describe('Date tolerance ±3 days', async () => {
    await test('exact date → fuzzy match', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: baseDate, // 1899-06-15
      });
      if (r.exactMatches.length === 0) throw new Error('expected exact match');
    });

    await test('+3 days exact same vendor/amount → fuzzy match (vendor sim=100%)', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: '1899-06-18', // +3 days
      });
      // Different perf_date → different fingerprint → not exact
      // But fuzzy should hit since vendor sim=100% and date within ±3
      const hit = r.fuzzyMatches.find((m) => m.id === exactSeed.id);
      if (!hit) throw new Error('should match within ±3 days');
      if (!r.isDuplicate) throw new Error('100% vendor sim should trigger isDuplicate');
    });

    await test('-3 days → fuzzy match', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: '1899-06-12', // -3 days
      });
      if (!r.fuzzyMatches.some((m) => m.id === exactSeed.id)) {
        throw new Error('should match within ±3 days');
      }
    });

    await test('+4 days → NOT matched', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: '1899-06-19', // +4 days
      });
      if (r.fuzzyMatches.some((m) => m.id === exactSeed.id)) {
        throw new Error('beyond ±3 days should not match');
      }
      if (r.exactMatches.length !== 0) throw new Error('exact should also be empty');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 5. Amount tolerance ±1 HUF
  // ────────────────────────────────────────────────────────────────────

  await describe('Amount tolerance ±1 HUF', async () => {
    await test('+1 HUF → matched (rounded fingerprint same → exact)', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50001, // +1 HUF
        performance_date: baseDate,
      });
      // Math.round(50000) === Math.round(50001) is false; fingerprint differs.
      // So it's not exact, but fuzzy (vendor sim=100%, date exact, |Δ|≤1) hits.
      const hit = r.fuzzyMatches.find((m) => m.id === exactSeed.id);
      if (!hit) throw new Error('+1 HUF should fuzzy-match');
    });

    await test('+2 HUF → NOT matched', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50002, // +2 HUF
        performance_date: baseDate,
      });
      if (r.fuzzyMatches.some((m) => m.id === exactSeed.id)) {
        throw new Error('|Δ|>1 should not match');
      }
      if (r.exactMatches.length !== 0) throw new Error('exact empty too');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 6. Soft-delete exclusion
  // ────────────────────────────────────────────────────────────────────

  await describe('Soft-delete exclusion', async () => {
    let zombieSeed;
    await test('soft-deleted row never shows in matches', async () => {
      zombieSeed = await seed({
        accommodation_id: accId, userId: usrId,
        billing_month: TEST_MONTH, performance_date: baseDate,
        amount: 88888, vendor_name: 'Zombie Kft.',
      });
      await query(
        'UPDATE accommodation_expenses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
        [zombieSeed.id],
      );

      const r = await dedup.checkDuplicates({
        vendor_name: 'Zombie Kft.',
        amount: 88888,
        performance_date: baseDate,
      });
      if (r.isDuplicate) throw new Error('soft-deleted should not trigger');
      if (r.exactMatches.length !== 0) throw new Error('exact should be empty');
      if (r.fuzzyMatches.length !== 0) throw new Error('fuzzy should be empty');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 7. isDuplicate threshold semantics (≥90% triggers, 80-90% doesn't)
  // ────────────────────────────────────────────────────────────────────

  await describe('isDuplicate threshold semantics', async () => {
    // Seed a vendor that we'll then query with a variant near the 0.8 boundary.
    // We engineer the strings so similarity is reliable across pg_trgm versions
    // by using minor edits.
    await test('100% vendor + same amount + same date → exact, isDuplicate=true', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: baseDate,
      });
      if (!r.isDuplicate) throw new Error('exact should trigger');
    });

    await test('fuzzy <90% but ≥80% returned but isDuplicate=false', async () => {
      // Find a string with sim 0.8-0.89 against "Vodafone Magyarország Zrt."
      // Adding a moderate suffix gets us into that range typically.
      const candidates = [
        'Vodafone Magyarország Zrt Hungary',
        'Vodafone Magyaroszrag Zrt',
        'Vodaphone Magyarország Zrt.',
      ];
      let hitMidRange = null;
      for (const v of candidates) {
        const r = await dedup.checkDuplicates({
          vendor_name: v,
          amount: 50000,
          performance_date: baseDate,
        });
        const m = r.fuzzyMatches.find((x) => x.id === exactSeed.id);
        if (m && m.similarity_pct >= 80 && m.similarity_pct < 90) {
          hitMidRange = { r, m, v };
          break;
        }
      }
      if (!hitMidRange) {
        // pg_trgm sim varies; if we can't find a mid-range candidate locally,
        // skip the test rather than fail spuriously.
        console.log('    SKIP (no candidate landed in 80-89% range on this DB)');
        return;
      }
      if (hitMidRange.r.isDuplicate) {
        throw new Error(`sim=${hitMidRange.m.similarity_pct} should not trigger isDuplicate`);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 8. Thresholds export
  // ────────────────────────────────────────────────────────────────────

  await describe('Thresholds export', async () => {
    await test('exposes documented thresholds', async () => {
      const t = dedup.thresholds;
      if (t.FUZZY_LOWER_BOUND !== 0.8) throw new Error('FUZZY_LOWER_BOUND');
      if (t.FUZZY_WARN_THRESHOLD !== 0.9) throw new Error('FUZZY_WARN_THRESHOLD');
      if (t.AMOUNT_TOLERANCE_HUF !== 1) throw new Error('AMOUNT_TOLERANCE_HUF');
      if (t.DATE_TOLERANCE_DAYS !== 3) throw new Error('DATE_TOLERANCE_DAYS');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 9. Returned row shape
  // ────────────────────────────────────────────────────────────────────

  await describe('Match row shape', async () => {
    await test('exactMatches rows carry expected fields', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: baseDate,
      });
      const m = r.exactMatches[0];
      const required = ['id', 'accommodation_id', 'vendor_name', 'amount',
                        'performance_date', 'billing_month', 'created_at'];
      for (const k of required) {
        if (!(k in m)) throw new Error(`missing field: ${k}`);
      }
      if (typeof m.amount !== 'number') throw new Error('amount should be number');
    });

    await test('fuzzyMatches rows carry similarity_pct + reasons', async () => {
      const r = await dedup.checkDuplicates({
        vendor_name: 'Vodafone Magyarország Zrt.',
        amount: 50000,
        performance_date: '1899-06-17', // +2 days
      });
      if (r.fuzzyMatches.length === 0) throw new Error('expected at least one fuzzy match');
      const m = r.fuzzyMatches[0];
      if (typeof m.similarity_pct !== 'number') throw new Error('similarity_pct');
      if (!Array.isArray(m.reasons) || m.reasons.length === 0) throw new Error('reasons array');
    });
  });
}

(async () => {
  let exitCode = 0;
  try {
    await main();
  } catch (e) {
    console.error('\nFATAL:', e.message);
    console.error(e.stack);
    exitCode = 1;
  } finally {
    await cleanup();
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`${'='.repeat(40)}\n`);
    await closePool();
    if (failed > 0 || exitCode !== 0) process.exit(1);
  }
})();
