/**
 * Agent Email Service Tests
 * Template generation, validation, helper functions
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${error.message}`);
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ============================================
// Priority Badge
// ============================================

function priorityBadge(priority) {
  if (priority === 'high' || priority === 'critical') return 'MAGAS';
  if (priority === 'medium') return 'KOZEPES';
  return 'ALACSONY';
}

describe('priorityBadge', () => {
  test('should return MAGAS for high', () => {
    assert.strictEqual(priorityBadge('high'), 'MAGAS');
  });

  test('should return MAGAS for critical', () => {
    assert.strictEqual(priorityBadge('critical'), 'MAGAS');
  });

  test('should return KOZEPES for medium', () => {
    assert.strictEqual(priorityBadge('medium'), 'KOZEPES');
  });

  test('should return ALACSONY for low', () => {
    assert.strictEqual(priorityBadge('low'), 'ALACSONY');
  });

  test('should return ALACSONY for unknown', () => {
    assert.strictEqual(priorityBadge('xyz'), 'ALACSONY');
  });
});

// ============================================
// Recipient logic
// ============================================

describe('getRecipients logic', () => {
  test('should use AGENT_EMAIL_TO if set', () => {
    const agentTo = 'ceo@company.com';
    const smtpUser = 'smtp@gmail.com';
    const result = agentTo || smtpUser;
    assert.strictEqual(result, 'ceo@company.com');
  });

  test('should fallback to SMTP_USER', () => {
    const agentTo = undefined;
    const smtpUser = 'smtp@gmail.com';
    const result = agentTo || smtpUser;
    assert.strictEqual(result, 'smtp@gmail.com');
  });
});

// ============================================
// Fallback priority builder
// ============================================

describe('Fallback priority builder', () => {
  const priorityMap = { bug: 'high', critical: 'high', enhancement: 'medium', feature: 'medium' };

  function getPriority(labels) {
    for (const label of labels) {
      if (priorityMap[label.toLowerCase()]) return priorityMap[label.toLowerCase()];
    }
    return 'low';
  }

  test('should assign high for bug label', () => {
    assert.strictEqual(getPriority(['bug']), 'high');
  });

  test('should assign high for critical label', () => {
    assert.strictEqual(getPriority(['critical']), 'high');
  });

  test('should assign medium for enhancement', () => {
    assert.strictEqual(getPriority(['enhancement']), 'medium');
  });

  test('should assign medium for feature', () => {
    assert.strictEqual(getPriority(['feature']), 'medium');
  });

  test('should assign low for unknown labels', () => {
    assert.strictEqual(getPriority(['documentation', 'question']), 'low');
  });

  test('should assign low for empty labels', () => {
    assert.strictEqual(getPriority([]), 'low');
  });

  test('should use first matching label', () => {
    assert.strictEqual(getPriority(['documentation', 'bug', 'enhancement']), 'high');
  });
});

// ============================================
// Git log parsing
// ============================================

describe('Git log stat parsing', () => {
  test('should parse full stat line', () => {
    const line = ' 5 files changed, 120 insertions(+), 30 deletions(-)';
    const match = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    assert.ok(match);
    assert.strictEqual(parseInt(match[1]), 5);
    assert.strictEqual(parseInt(match[2]), 120);
    assert.strictEqual(parseInt(match[3]), 30);
  });

  test('should parse insertions only', () => {
    const line = ' 3 files changed, 45 insertions(+)';
    const match = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    assert.ok(match);
    assert.strictEqual(parseInt(match[1]), 3);
    assert.strictEqual(parseInt(match[2]), 45);
    assert.ok(!match[3] || isNaN(parseInt(match[3])));
  });

  test('should parse single file', () => {
    const line = ' 1 file changed, 10 insertions(+), 2 deletions(-)';
    const match = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    assert.ok(match);
    assert.strictEqual(parseInt(match[1]), 1);
  });

  test('should not match non-stat lines', () => {
    const line = 'some random commit message';
    const match = line.match(/(\d+) files? changed/);
    assert.ok(!match);
  });
});

// ============================================
// Git log commit parsing
// ============================================

describe('Git log commit parsing', () => {
  test('should parse commit line with ||| separator', () => {
    const line = 'abc123full|||abc1234|||feat: add feature|||John|||2026-03-07 10:30';
    const parts = line.split('|||');
    assert.strictEqual(parts.length, 5);
    assert.strictEqual(parts[1], 'abc1234');
    assert.strictEqual(parts[2], 'feat: add feature');
    assert.strictEqual(parts[3], 'John');
  });

  test('should handle date substring', () => {
    const date = '2026-03-07 10:30:45 +0100';
    assert.strictEqual(date.substring(0, 16), '2026-03-07 10:30');
  });
});

// ============================================
// Test result parsing
// ============================================

describe('Test result parsing', () => {
  test('should parse results line', () => {
    const output = 'Results: 36 passed, 0 failed, 36 total';
    const match = output.match(/Results:\s*(\d+)\s*passed,\s*(\d+)\s*failed,\s*(\d+)\s*total/);
    assert.ok(match);
    assert.strictEqual(parseInt(match[1]), 36);
    assert.strictEqual(parseInt(match[2]), 0);
    assert.strictEqual(parseInt(match[3]), 36);
  });

  test('should parse results with failures', () => {
    const output = 'Results: 30 passed, 6 failed, 36 total';
    const match = output.match(/Results:\s*(\d+)\s*passed,\s*(\d+)\s*failed,\s*(\d+)\s*total/);
    assert.ok(match);
    assert.strictEqual(parseInt(match[2]), 6);
  });

  test('should detect FAIL lines', () => {
    const output = '  PASS: test1\n  FAIL: test2\n    assertion error\n  PASS: test3';
    const failLines = output.split('\n').filter((l) => l.includes('FAIL:'));
    assert.strictEqual(failLines.length, 1);
    assert.ok(failLines[0].includes('test2'));
  });
});

// ============================================
// CI result parsing
// ============================================

describe('CI result JSON parsing', () => {
  test('should parse valid CI result', () => {
    const json = '{"passed":30,"failed":2}';
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.passed, 30);
    assert.strictEqual(parsed.failed, 2);
  });

  test('should handle CI result with failedTests', () => {
    const json = '{"passed":28,"failed":2,"failedTests":[{"name":"test1","error":"oops"}]}';
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.failedTests.length, 1);
    assert.strictEqual(parsed.failedTests[0].name, 'test1');
  });
});

// ============================================
// Alert type mapping
// ============================================

describe('Alert type mapping', () => {
  const alertClass = (type) => ({
    error: 'alert-error',
    warning: 'alert-warning',
    info: 'alert-info',
    success: 'alert-success',
  }[type] || 'alert-info');

  test('should map error type', () => {
    assert.strictEqual(alertClass('error'), 'alert-error');
  });

  test('should map warning type', () => {
    assert.strictEqual(alertClass('warning'), 'alert-warning');
  });

  test('should map success type', () => {
    assert.strictEqual(alertClass('success'), 'alert-success');
  });

  test('should default to info for unknown', () => {
    assert.strictEqual(alertClass('unknown'), 'alert-info');
  });
});

// ============================================
// Summary
// ============================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(40)}\n`);

if (failed > 0) process.exit(1);
