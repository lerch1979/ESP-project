/**
 * Salary Transparency (Bértranszparencia) Tests
 * Validation, business logic, data integrity
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
// Constants (mirror from controller)
// ============================================

const VALID_LEVELS = ['junior', 'medior', 'senior', 'lead', 'manager', 'director'];
const VALID_CHANGE_TYPES = ['initial', 'raise', 'promotion', 'adjustment', 'demotion', 'annual_review'];
const VALID_EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract'];

// ============================================
// Validation helpers (extracted logic)
// ============================================

function validateSalaryBand({ position_name, min_salary, max_salary, level, employment_type }) {
  const errors = [];
  if (!position_name) errors.push('Pozíció megadása kötelező');
  if (min_salary === undefined || min_salary === null) errors.push('Minimum bér megadása kötelező');
  if (max_salary === undefined || max_salary === null) errors.push('Maximum bér megadása kötelező');
  if (min_salary !== undefined && max_salary !== undefined && parseFloat(min_salary) > parseFloat(max_salary)) {
    errors.push('A minimum bér nem lehet nagyobb a maximum bérnél');
  }
  if (level && !VALID_LEVELS.includes(level)) errors.push('Érvénytelen szint');
  if (employment_type && !VALID_EMPLOYMENT_TYPES.includes(employment_type)) errors.push('Érvénytelen foglalkoztatási típus');
  return { valid: errors.length === 0, errors };
}

function validateEmployeeSalary({ employee_id, gross_salary, effective_date, change_type }) {
  const errors = [];
  if (!employee_id) errors.push('Munkavállaló megadása kötelező');
  if (gross_salary === undefined || gross_salary === null) errors.push('Bruttó bér megadása kötelező');
  if (!effective_date) errors.push('Hatályos dátum megadása kötelező');
  if (change_type && !VALID_CHANGE_TYPES.includes(change_type)) errors.push('Érvénytelen változás típus');
  return { valid: errors.length === 0, errors };
}

function isInBand(grossSalary, bandMin, bandMax) {
  return parseFloat(grossSalary) >= parseFloat(bandMin) && parseFloat(grossSalary) <= parseFloat(bandMax);
}

function calculateMedian(salaries) {
  if (!salaries || salaries.length === 0) return 0;
  const sorted = [...salaries].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatCurrency(amount, currency = 'HUF') {
  if (!amount) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

// ============================================
// SALARY BAND VALIDATION
// ============================================

describe('Salary Band Validation', () => {
  test('should accept valid salary band', () => {
    const result = validateSalaryBand({
      position_name: 'Fejlesztő',
      min_salary: 500000,
      max_salary: 900000,
      level: 'senior',
      employment_type: 'full_time',
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('should reject missing position name', () => {
    const result = validateSalaryBand({ min_salary: 500000, max_salary: 900000 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Pozíció')));
  });

  test('should reject missing min_salary', () => {
    const result = validateSalaryBand({ position_name: 'Dev', max_salary: 900000 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Minimum')));
  });

  test('should reject missing max_salary', () => {
    const result = validateSalaryBand({ position_name: 'Dev', min_salary: 500000 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Maximum')));
  });

  test('should reject min > max salary', () => {
    const result = validateSalaryBand({ position_name: 'Dev', min_salary: 900000, max_salary: 500000 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('nem lehet nagyobb')));
  });

  test('should accept min == max salary', () => {
    const result = validateSalaryBand({ position_name: 'Dev', min_salary: 500000, max_salary: 500000 });
    assert.strictEqual(result.valid, true);
  });

  test('should reject invalid level', () => {
    const result = validateSalaryBand({ position_name: 'Dev', min_salary: 500000, max_salary: 900000, level: 'invalid' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('szint')));
  });

  test('should accept all valid levels', () => {
    for (const level of VALID_LEVELS) {
      const result = validateSalaryBand({ position_name: 'Dev', min_salary: 500000, max_salary: 900000, level });
      assert.strictEqual(result.valid, true, `Level ${level} should be valid`);
    }
  });

  test('should reject invalid employment type', () => {
    const result = validateSalaryBand({ position_name: 'Dev', min_salary: 500000, max_salary: 900000, employment_type: 'freelance' });
    assert.strictEqual(result.valid, false);
  });

  test('should accept all valid employment types', () => {
    for (const type of VALID_EMPLOYMENT_TYPES) {
      const result = validateSalaryBand({ position_name: 'Dev', min_salary: 500000, max_salary: 900000, employment_type: type });
      assert.strictEqual(result.valid, true, `Type ${type} should be valid`);
    }
  });

  test('should accept band without optional fields', () => {
    const result = validateSalaryBand({ position_name: 'Dev', min_salary: 400000, max_salary: 800000 });
    assert.strictEqual(result.valid, true);
  });
});

// ============================================
// EMPLOYEE SALARY VALIDATION
// ============================================

describe('Employee Salary Validation', () => {
  test('should accept valid employee salary', () => {
    const result = validateEmployeeSalary({
      employee_id: '123e4567-e89b-12d3-a456-426614174000',
      gross_salary: 650000,
      effective_date: '2026-03-01',
      change_type: 'initial',
    });
    assert.strictEqual(result.valid, true);
  });

  test('should reject missing employee_id', () => {
    const result = validateEmployeeSalary({ gross_salary: 650000, effective_date: '2026-03-01' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Munkavállaló')));
  });

  test('should reject missing gross_salary', () => {
    const result = validateEmployeeSalary({ employee_id: 'uuid', effective_date: '2026-03-01' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Bruttó')));
  });

  test('should reject missing effective_date', () => {
    const result = validateEmployeeSalary({ employee_id: 'uuid', gross_salary: 650000 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('dátum')));
  });

  test('should reject invalid change_type', () => {
    const result = validateEmployeeSalary({ employee_id: 'uuid', gross_salary: 650000, effective_date: '2026-03-01', change_type: 'invalid' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('változás típus')));
  });

  test('should accept all valid change types', () => {
    for (const type of VALID_CHANGE_TYPES) {
      const result = validateEmployeeSalary({ employee_id: 'uuid', gross_salary: 650000, effective_date: '2026-03-01', change_type: type });
      assert.strictEqual(result.valid, true, `Type ${type} should be valid`);
    }
  });

  test('should accept without optional change_type', () => {
    const result = validateEmployeeSalary({ employee_id: 'uuid', gross_salary: 650000, effective_date: '2026-03-01' });
    assert.strictEqual(result.valid, true);
  });
});

// ============================================
// SALARY BAND RANGE CHECK
// ============================================

describe('Salary Band Range Check', () => {
  test('should detect salary within band', () => {
    assert.strictEqual(isInBand(650000, 500000, 900000), true);
  });

  test('should detect salary at min boundary', () => {
    assert.strictEqual(isInBand(500000, 500000, 900000), true);
  });

  test('should detect salary at max boundary', () => {
    assert.strictEqual(isInBand(900000, 500000, 900000), true);
  });

  test('should detect salary below band', () => {
    assert.strictEqual(isInBand(400000, 500000, 900000), false);
  });

  test('should detect salary above band', () => {
    assert.strictEqual(isInBand(1000000, 500000, 900000), false);
  });

  test('should handle string numbers', () => {
    assert.strictEqual(isInBand('650000', '500000', '900000'), true);
  });
});

// ============================================
// MEDIAN CALCULATION
// ============================================

describe('Median Salary Calculation', () => {
  test('should calculate median of odd count', () => {
    assert.strictEqual(calculateMedian([300000, 500000, 700000]), 500000);
  });

  test('should calculate median of even count', () => {
    assert.strictEqual(calculateMedian([300000, 500000, 700000, 900000]), 600000);
  });

  test('should handle single value', () => {
    assert.strictEqual(calculateMedian([500000]), 500000);
  });

  test('should handle empty array', () => {
    assert.strictEqual(calculateMedian([]), 0);
  });

  test('should handle null/undefined', () => {
    assert.strictEqual(calculateMedian(null), 0);
    assert.strictEqual(calculateMedian(undefined), 0);
  });

  test('should handle unsorted input', () => {
    assert.strictEqual(calculateMedian([900000, 300000, 700000, 500000, 100000]), 500000);
  });
});

// ============================================
// CURRENCY FORMATTING
// ============================================

describe('Currency Formatting', () => {
  test('should format HUF correctly', () => {
    const formatted = formatCurrency(650000, 'HUF');
    assert.ok(formatted.includes('650'));
    assert.ok(formatted.includes('Ft') || formatted.includes('HUF'));
  });

  test('should format EUR correctly', () => {
    const formatted = formatCurrency(2500, 'EUR');
    assert.ok(formatted.includes('2'));
  });

  test('should return dash for null', () => {
    assert.strictEqual(formatCurrency(null), '-');
  });

  test('should return dash for zero', () => {
    assert.strictEqual(formatCurrency(0), '-');
  });

  test('should default to HUF', () => {
    const formatted = formatCurrency(500000);
    assert.ok(formatted.includes('500'));
  });
});

// ============================================
// LEVEL ORDERING
// ============================================

describe('Level Constants', () => {
  test('should have 6 levels', () => {
    assert.strictEqual(VALID_LEVELS.length, 6);
  });

  test('should include junior and director', () => {
    assert.ok(VALID_LEVELS.includes('junior'));
    assert.ok(VALID_LEVELS.includes('director'));
  });

  test('should have 6 change types', () => {
    assert.strictEqual(VALID_CHANGE_TYPES.length, 6);
  });

  test('should include initial and annual_review', () => {
    assert.ok(VALID_CHANGE_TYPES.includes('initial'));
    assert.ok(VALID_CHANGE_TYPES.includes('annual_review'));
  });

  test('should have 3 employment types', () => {
    assert.strictEqual(VALID_EMPLOYMENT_TYPES.length, 3);
  });
});

// ============================================
// RESULTS
// ============================================

console.log('\n========================================');
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('========================================\n');

if (failed > 0) process.exit(1);
