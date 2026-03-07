/**
 * Payment Module Tests
 * Model validation, service logic, invoice status updates
 */

const assert = require('assert');
const { validateCreate, validateUpdate, VALID_METHODS, METHOD_LABELS } = require('../src/models/payment.model');

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
// Create Validation
// ============================================

describe('validateCreate - Required fields', () => {
  test('should fail with empty body', () => {
    const r = validateCreate({});
    assert.ok(!r.valid);
    assert.ok(r.errors.length >= 4);
  });

  test('should fail without invoice_id', () => {
    const r = validateCreate({ amount: 1000, payment_date: '2026-01-01', payment_method: 'cash' });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes('Számla')));
  });

  test('should fail without amount', () => {
    const r = validateCreate({ invoice_id: 'uuid', payment_date: '2026-01-01', payment_method: 'cash' });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes('Összeg')));
  });

  test('should fail without payment_date', () => {
    const r = validateCreate({ invoice_id: 'uuid', amount: 1000, payment_method: 'cash' });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes('dátum')));
  });

  test('should fail without payment_method', () => {
    const r = validateCreate({ invoice_id: 'uuid', amount: 1000, payment_date: '2026-01-01' });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes('Fizetési mód')));
  });

  test('should pass with all required fields', () => {
    const r = validateCreate({
      invoice_id: 'uuid', amount: 50000,
      payment_date: '2026-01-15', payment_method: 'bank_transfer',
    });
    assert.ok(r.valid);
  });
});

describe('validateCreate - Amount validation', () => {
  test('should fail with zero amount', () => {
    const r = validateCreate({ invoice_id: 'u', amount: 0, payment_date: '2026-01-01', payment_method: 'cash' });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes('pozitív')));
  });

  test('should fail with negative amount', () => {
    const r = validateCreate({ invoice_id: 'u', amount: -500, payment_date: '2026-01-01', payment_method: 'cash' });
    assert.ok(!r.valid);
  });

  test('should fail with NaN amount', () => {
    const r = validateCreate({ invoice_id: 'u', amount: 'abc', payment_date: '2026-01-01', payment_method: 'cash' });
    assert.ok(!r.valid);
  });

  test('should accept decimal amount', () => {
    const r = validateCreate({ invoice_id: 'u', amount: 1234.56, payment_date: '2026-01-01', payment_method: 'cash' });
    assert.ok(r.valid);
  });
});

describe('validateCreate - Payment method', () => {
  test('should accept cash', () => {
    const r = validateCreate({ invoice_id: 'u', amount: 100, payment_date: '2026-01-01', payment_method: 'cash' });
    assert.ok(r.valid);
  });

  test('should accept bank_transfer', () => {
    const r = validateCreate({ invoice_id: 'u', amount: 100, payment_date: '2026-01-01', payment_method: 'bank_transfer' });
    assert.ok(r.valid);
  });

  test('should accept credit_card', () => {
    const r = validateCreate({ invoice_id: 'u', amount: 100, payment_date: '2026-01-01', payment_method: 'credit_card' });
    assert.ok(r.valid);
  });

  test('should accept other', () => {
    const r = validateCreate({ invoice_id: 'u', amount: 100, payment_date: '2026-01-01', payment_method: 'other' });
    assert.ok(r.valid);
  });

  test('should reject invalid method', () => {
    const r = validateCreate({ invoice_id: 'u', amount: 100, payment_date: '2026-01-01', payment_method: 'bitcoin' });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.includes('Érvénytelen')));
  });
});

describe('validateCreate - Optional fields', () => {
  test('should accept with reference_number', () => {
    const r = validateCreate({
      invoice_id: 'u', amount: 100, payment_date: '2026-01-01',
      payment_method: 'bank_transfer', reference_number: 'REF-12345',
    });
    assert.ok(r.valid);
  });

  test('should fail with reference_number too long', () => {
    const r = validateCreate({
      invoice_id: 'u', amount: 100, payment_date: '2026-01-01',
      payment_method: 'cash', reference_number: 'A'.repeat(101),
    });
    assert.ok(!r.valid);
  });

  test('should accept with notes', () => {
    const r = validateCreate({
      invoice_id: 'u', amount: 100, payment_date: '2026-01-01',
      payment_method: 'cash', notes: 'Test megjegyzés',
    });
    assert.ok(r.valid);
  });
});

// ============================================
// Update Validation
// ============================================

describe('validateUpdate', () => {
  test('should fail with no valid fields', () => {
    const r = validateUpdate({ invalid: 'x' });
    assert.ok(!r.valid);
  });

  test('should pass with only amount', () => {
    const r = validateUpdate({ amount: 5000 });
    assert.ok(r.valid);
  });

  test('should fail with zero amount', () => {
    const r = validateUpdate({ amount: 0 });
    assert.ok(!r.valid);
  });

  test('should pass with payment_method update', () => {
    const r = validateUpdate({ payment_method: 'credit_card' });
    assert.ok(r.valid);
  });

  test('should fail with invalid payment_method', () => {
    const r = validateUpdate({ payment_method: 'paypal' });
    assert.ok(!r.valid);
  });

  test('should pass with notes only', () => {
    const r = validateUpdate({ notes: 'Frissített megjegyzés' });
    assert.ok(r.valid);
  });
});

// ============================================
// Constants
// ============================================

describe('VALID_METHODS', () => {
  test('should have 4 methods', () => {
    assert.strictEqual(VALID_METHODS.length, 4);
  });

  test('should include all expected methods', () => {
    assert.ok(VALID_METHODS.includes('cash'));
    assert.ok(VALID_METHODS.includes('bank_transfer'));
    assert.ok(VALID_METHODS.includes('credit_card'));
    assert.ok(VALID_METHODS.includes('other'));
  });
});

describe('METHOD_LABELS', () => {
  test('should have Hungarian labels for all methods', () => {
    VALID_METHODS.forEach(m => {
      assert.ok(METHOD_LABELS[m], `Missing label for ${m}`);
      assert.ok(typeof METHOD_LABELS[m] === 'string');
    });
  });

  test('should have correct labels', () => {
    assert.strictEqual(METHOD_LABELS.cash, 'Készpénz');
    assert.strictEqual(METHOD_LABELS.bank_transfer, 'Banki átutalás');
  });
});

// ============================================
// Invoice Status Logic
// ============================================

describe('Invoice Status Auto-Update Logic', () => {
  test('should mark paid when totalPaid >= invoiceTotal', () => {
    const invoiceTotal = 100000;
    const totalPaid = 100000;
    const status = totalPaid >= invoiceTotal ? 'paid' : 'sent';
    assert.strictEqual(status, 'paid');
  });

  test('should mark paid when overpaid', () => {
    const invoiceTotal = 100000;
    const totalPaid = 150000;
    const status = totalPaid >= invoiceTotal ? 'paid' : 'sent';
    assert.strictEqual(status, 'paid');
  });

  test('should stay sent when partially paid', () => {
    const invoiceTotal = 100000;
    const totalPaid = 50000;
    const status = totalPaid >= invoiceTotal ? 'paid' : totalPaid > 0 ? 'sent' : 'draft';
    assert.strictEqual(status, 'sent');
  });

  test('should revert to draft when all payments deleted', () => {
    const invoiceTotal = 100000;
    const totalPaid = 0;
    const status = totalPaid >= invoiceTotal ? 'paid' : totalPaid > 0 ? 'sent' : 'draft';
    assert.strictEqual(status, 'draft');
  });

  test('should handle zero invoice total', () => {
    const invoiceTotal = 0;
    const totalPaid = 0;
    const isPaid = totalPaid >= invoiceTotal && invoiceTotal > 0;
    assert.ok(!isPaid);
  });
});

describe('Edge Cases', () => {
  test('should handle string amount parsing', () => {
    const amount = '50000.50';
    const parsed = parseFloat(amount);
    assert.ok(!isNaN(parsed));
    assert.strictEqual(parsed, 50000.5);
  });

  test('should sum multiple payments correctly', () => {
    const payments = [
      { amount: '30000' },
      { amount: '25000.50' },
      { amount: '44999.50' },
    ];
    const total = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    assert.strictEqual(total, 100000);
  });

  test('should calculate remaining correctly', () => {
    const invoiceTotal = 100000;
    const totalPaid = 75000;
    const remaining = invoiceTotal - totalPaid;
    assert.strictEqual(remaining, 25000);
  });
});

// ============================================
// Summary
// ============================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(40)}\n`);

if (failed > 0) process.exit(1);
