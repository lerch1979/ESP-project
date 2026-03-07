#!/usr/bin/env node

/**
 * QA Agent - Teszt eredmeny figyelo
 *
 * Futtatja a teszteket, elemzi az eredmenyt, es alert-et kuld hiba eseten.
 * GitHub Actions-bol is hivhato webhook-kent.
 *
 * Futtatas: node scripts/qa_agent.js
 * Futtatas CI eredmennyel: node scripts/qa_agent.js --ci-result '{"passed":30,"failed":2}'
 * GitHub Actions webhook: POST /api/v1/qa-webhook (body: { action, conclusion, ... })
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { execSync } = require('child_process');
const { sendAlert } = require('../src/services/agentEmail.service');

// ============================================
// CONFIG
// ============================================

const TEST_DIR = path.resolve(__dirname, '..', 'tests');
const TEST_FILES = [
  'payment.test.js',
  'costCenter.test.js',
  'invoice.test.js',
  'sprint2-invoice.test.js',
];

// ============================================
// TEST RUNNER
// ============================================

function runTestFile(filename) {
  const filePath = path.join(TEST_DIR, filename);
  const startTime = Date.now();

  try {
    const output = execSync(`node "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: path.resolve(__dirname, '..'),
    });

    const duration = Date.now() - startTime;

    // Parse results from output line: "Results: X passed, Y failed, Z total"
    const resultMatch = output.match(/Results:\s*(\d+)\s*passed,\s*(\d+)\s*failed,\s*(\d+)\s*total/);

    const passed = resultMatch ? parseInt(resultMatch[1]) : 0;
    const failed = resultMatch ? parseInt(resultMatch[2]) : 0;
    const total = resultMatch ? parseInt(resultMatch[3]) : 0;

    // Parse individual FAIL lines
    const failedTests = [];
    const failLines = output.split('\n').filter((l) => l.includes('FAIL:'));
    for (const line of failLines) {
      const name = line.replace(/.*FAIL:\s*/, '').trim();
      // Try to get the error from next line
      const idx = output.indexOf(line);
      const nextLines = output.substring(idx + line.length).split('\n').slice(1, 3);
      const error = nextLines.find((l) => l.trim().startsWith(''))?.trim() || '';
      failedTests.push({ name, error });
    }

    return {
      file: filename,
      success: failed === 0,
      passed,
      failed,
      total,
      duration: `${duration}ms`,
      failedTests,
      output: output.substring(output.length - 500), // Last 500 chars
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      file: filename,
      success: false,
      passed: 0,
      failed: 1,
      total: 1,
      duration: `${duration}ms`,
      failedTests: [{ name: filename, error: error.message.substring(0, 200) }],
      output: (error.stdout || error.message).substring(0, 500),
    };
  }
}

function runAllTests() {
  console.log('Tesztek futtatasa...');
  const results = [];

  for (const file of TEST_FILES) {
    try {
      // Check if file exists
      require.resolve(path.join(TEST_DIR, file));
      console.log(`  Futtatva: ${file}`);
      const result = runTestFile(file);
      results.push(result);
      console.log(`    ${result.success ? 'OK' : 'FAIL'}: ${result.passed}/${result.total} (${result.duration})`);
    } catch (e) {
      console.log(`  Kihagyva: ${file} (nem talalhato)`);
    }
  }

  return results;
}

// ============================================
// CI RESULT PARSING
// ============================================

function parseCIResult() {
  const args = process.argv.slice(2);
  const ciIndex = args.indexOf('--ci-result');

  if (ciIndex === -1) return null;

  try {
    const ciData = JSON.parse(args[ciIndex + 1]);
    return ciData;
  } catch (e) {
    console.error('CI result parse hiba:', e.message);
    return null;
  }
}

// ============================================
// ANALYSIS & ALERTING
// ============================================

async function analyzeAndAlert(testResults) {
  const totalPassed = testResults.reduce((s, r) => s + r.passed, 0);
  const totalFailed = testResults.reduce((s, r) => s + r.failed, 0);
  const totalTests = testResults.reduce((s, r) => s + r.total, 0);
  const allPassed = totalFailed === 0;

  const allFailedTests = testResults.flatMap((r) => r.failedTests);

  const totalDuration = testResults.reduce((s, r) => s + parseInt(r.duration), 0);

  console.log(`\nOsszes eredmeny: ${totalPassed}/${totalTests} sikeres, ${totalFailed} sikertelen (${totalDuration}ms)`);

  if (allPassed) {
    console.log('Minden teszt sikeres!');

    // Only send success email if explicitly requested
    if (process.argv.includes('--notify-success')) {
      await sendAlert('success', {
        title: 'Minden teszt sikeres',
        message: `${totalTests} teszt sikeresen lefutott (${totalDuration}ms).`,
        testResults: {
          passed: totalPassed,
          failed: 0,
          total: totalTests,
          duration: `${totalDuration}ms`,
        },
      });
    }
    return;
  }

  // Send failure alert
  console.log('Sikertelen tesztek talalhatoak, alert kuldes...');

  const failedFiles = testResults.filter((r) => !r.success).map((r) => r.file);

  const result = await sendAlert('error', {
    title: `${totalFailed} teszt sikertelen`,
    message: `${totalFailed}/${totalTests} teszt sikertelen a kovetkezo fajlokban: ${failedFiles.join(', ')}`,
    testResults: {
      passed: totalPassed,
      failed: totalFailed,
      total: totalTests,
      duration: `${totalDuration}ms`,
    },
    failedTests: allFailedTests,
    details: testResults.filter((r) => !r.success).map((r) => `--- ${r.file} ---\n${r.output}`).join('\n\n'),
  });

  if (result.skipped) {
    console.log('Email kihagyva (SMTP nincs konfigralva)');
  } else if (result.success) {
    console.log(`Alert email elkuldve: ${result.messageId}`);
  } else {
    console.error(`Email hiba: ${result.error}`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('QA Agent inditas...');
  console.log(`Datum: ${new Date().toLocaleString('hu-HU')}`);
  console.log('---');

  // Check if CI result was provided
  const ciResult = parseCIResult();

  let testResults;

  if (ciResult) {
    console.log('CI eredmeny hasznalata...');
    testResults = [{
      file: 'CI Pipeline',
      success: (ciResult.failed || 0) === 0,
      passed: ciResult.passed || 0,
      failed: ciResult.failed || 0,
      total: (ciResult.passed || 0) + (ciResult.failed || 0),
      duration: ciResult.duration || '0ms',
      failedTests: (ciResult.failedTests || []),
      output: ciResult.output || '',
    }];
  } else {
    // Run tests locally
    testResults = runAllTests();
  }

  if (testResults.length === 0) {
    console.log('Nincs futtathato teszt.');
    return;
  }

  await analyzeAndAlert(testResults);

  // Exit with error code if tests failed
  const anyFailed = testResults.some((r) => !r.success);
  if (anyFailed) {
    process.exit(1);
  }

  console.log('\nQA Agent befejezve.');
}

main().catch((err) => {
  console.error('QA Agent hiba:', err);
  process.exit(1);
});
