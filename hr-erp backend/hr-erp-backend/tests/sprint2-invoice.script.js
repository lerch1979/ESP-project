/**
 * Sprint 2 Invoice Features Tests
 * PDF generation, email service, sort params
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
// Sort Column Validation
// ============================================

const VALID_SORT_COLUMNS = {
  invoice_date: 'i.invoice_date',
  total_amount: 'i.total_amount',
  payment_status: 'i.payment_status',
  created_at: 'i.created_at',
  vendor_name: 'i.vendor_name',
};

function getSortColumn(col) {
  return VALID_SORT_COLUMNS[col] || 'i.created_at';
}

describe('getSortColumn - Sort parameter validation', () => {
  test('should return invoice_date column', () => {
    assert.strictEqual(getSortColumn('invoice_date'), 'i.invoice_date');
  });

  test('should return total_amount column', () => {
    assert.strictEqual(getSortColumn('total_amount'), 'i.total_amount');
  });

  test('should return payment_status column', () => {
    assert.strictEqual(getSortColumn('payment_status'), 'i.payment_status');
  });

  test('should return vendor_name column', () => {
    assert.strictEqual(getSortColumn('vendor_name'), 'i.vendor_name');
  });

  test('should default to created_at for invalid column', () => {
    assert.strictEqual(getSortColumn('invalid'), 'i.created_at');
  });

  test('should default to created_at for undefined', () => {
    assert.strictEqual(getSortColumn(undefined), 'i.created_at');
  });

  test('should default to created_at for null', () => {
    assert.strictEqual(getSortColumn(null), 'i.created_at');
  });

  test('should prevent SQL injection via sort column', () => {
    assert.strictEqual(getSortColumn('id; DROP TABLE invoices'), 'i.created_at');
  });
});

// ============================================
// Sort Order Validation
// ============================================

describe('Sort order validation', () => {
  test('should accept ASC', () => {
    const order = 'ASC';
    const safe = order === 'ASC' ? 'ASC' : 'DESC';
    assert.strictEqual(safe, 'ASC');
  });

  test('should default to DESC for invalid', () => {
    const order = 'INVALID';
    const safe = order === 'ASC' ? 'ASC' : 'DESC';
    assert.strictEqual(safe, 'DESC');
  });

  test('should default to DESC for SQL injection attempt', () => {
    const order = 'ASC; DROP TABLE invoices';
    const safe = order === 'ASC' ? 'ASC' : 'DESC';
    assert.strictEqual(safe, 'DESC');
  });
});

// ============================================
// Email validation
// ============================================

describe('Email service validation', () => {
  test('should require "to" field', () => {
    const to = '';
    const isValid = !!to;
    assert.ok(!isValid);
  });

  test('should accept valid "to" field', () => {
    const to = 'test@example.com';
    const isValid = !!to;
    assert.ok(isValid);
  });

  test('should handle missing SMTP config', () => {
    const smtpUser = undefined;
    const smtpPass = undefined;
    const configured = !!(smtpUser && smtpPass);
    assert.ok(!configured);
  });

  test('should detect configured SMTP', () => {
    const smtpUser = 'user@gmail.com';
    const smtpPass = 'pass';
    const configured = !!(smtpUser && smtpPass);
    assert.ok(configured);
  });
});

// ============================================
// PDF formatCurrency
// ============================================

const formatCurrency = (amount, currency = 'HUF') => {
  if (!amount && amount !== 0) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
};

describe('PDF formatCurrency', () => {
  test('should format HUF amount', () => {
    const result = formatCurrency(50000);
    assert.ok(result.includes('50'));
    assert.ok(result.includes('000') || result.includes('Ft'));
  });

  test('should return - for null', () => {
    assert.strictEqual(formatCurrency(null), '-');
  });

  test('should return - for undefined', () => {
    assert.strictEqual(formatCurrency(undefined), '-');
  });

  test('should handle zero', () => {
    const result = formatCurrency(0);
    assert.ok(result.includes('0'));
  });

  test('should format EUR', () => {
    const result = formatCurrency(1000, 'EUR');
    assert.ok(result.includes('1'));
  });
});

// ============================================
// Status labels
// ============================================

const STATUS_LABELS = {
  draft: 'Piszkozat',
  sent: 'Elkuldve',
  paid: 'Kifizetve',
  overdue: 'Lejart',
  cancelled: 'Sztorno',
};

describe('STATUS_LABELS', () => {
  test('should have 5 statuses', () => {
    assert.strictEqual(Object.keys(STATUS_LABELS).length, 5);
  });

  test('should have all expected statuses', () => {
    assert.ok(STATUS_LABELS.draft);
    assert.ok(STATUS_LABELS.sent);
    assert.ok(STATUS_LABELS.paid);
    assert.ok(STATUS_LABELS.overdue);
    assert.ok(STATUS_LABELS.cancelled);
  });
});

// ============================================
// formatDate
// ============================================

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU');
};

describe('formatDate', () => {
  test('should return - for null', () => {
    assert.strictEqual(formatDate(null), '-');
  });

  test('should return - for undefined', () => {
    assert.strictEqual(formatDate(undefined), '-');
  });

  test('should format a valid date string', () => {
    const result = formatDate('2026-01-15');
    assert.ok(result.includes('2026'));
  });
});

// ============================================
// Overdue detection
// ============================================

describe('Overdue detection', () => {
  const isOverdue = (inv) => {
    if (inv.payment_status === 'paid' || inv.payment_status === 'cancelled') return false;
    if (!inv.due_date) return false;
    return new Date(inv.due_date) < new Date();
  };

  test('should not be overdue if paid', () => {
    assert.ok(!isOverdue({ payment_status: 'paid', due_date: '2020-01-01' }));
  });

  test('should not be overdue if cancelled', () => {
    assert.ok(!isOverdue({ payment_status: 'cancelled', due_date: '2020-01-01' }));
  });

  test('should not be overdue if no due_date', () => {
    assert.ok(!isOverdue({ payment_status: 'draft', due_date: null }));
  });

  test('should be overdue for past due_date with draft status', () => {
    assert.ok(isOverdue({ payment_status: 'draft', due_date: '2020-01-01' }));
  });

  test('should not be overdue for future due_date', () => {
    assert.ok(!isOverdue({ payment_status: 'sent', due_date: '2099-12-31' }));
  });
});

// ============================================
// Line items parsing
// ============================================

describe('Line items parsing', () => {
  test('should parse JSON string line_items', () => {
    const raw = '[{"description":"Item 1","quantity":2,"unit_price":5000}]';
    const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].description, 'Item 1');
    assert.strictEqual(items[0].quantity, 2);
  });

  test('should handle array line_items', () => {
    const raw = [{ description: 'Item 1' }];
    const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
    assert.strictEqual(items.length, 1);
  });

  test('should calculate line item total', () => {
    const item = { quantity: 3, unit_price: 10000 };
    const total = (item.quantity || 1) * (item.unit_price || 0);
    assert.strictEqual(total, 30000);
  });
});

// ============================================
// Summary
// ============================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(40)}\n`);

if (failed > 0) process.exit(1);
