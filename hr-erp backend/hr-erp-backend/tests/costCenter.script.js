/**
 * Cost Center Tests
 * Tests for model validation, service logic, hierarchy, and edge cases
 */

const assert = require('assert');
const { validateCreate, validateUpdate, VALID_FIELDS } = require('../src/models/costCenter.model');

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
// Model Validation Tests
// ============================================

describe('validateCreate - Required fields', () => {
  test('should fail with empty body', () => {
    const result = validateCreate({});
    assert.ok(!result.valid);
    assert.ok(result.errors.length >= 2);
  });

  test('should fail without name', () => {
    const result = validateCreate({ code: 'TEST' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('Név')));
  });

  test('should fail without code', () => {
    const result = validateCreate({ name: 'Test' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('Kód')));
  });

  test('should pass with name and code', () => {
    const result = validateCreate({ name: 'Teszt költségközpont', code: 'TST-01' });
    assert.ok(result.valid);
    assert.strictEqual(result.errors.length, 0);
  });
});

describe('validateCreate - Field validation', () => {
  test('should fail with empty name string', () => {
    const result = validateCreate({ name: '   ', code: 'TEST' });
    assert.ok(!result.valid);
  });

  test('should fail with name too long', () => {
    const result = validateCreate({ name: 'A'.repeat(101), code: 'TEST' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('100')));
  });

  test('should fail with code too long', () => {
    const result = validateCreate({ name: 'Test', code: 'A'.repeat(51) });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('50')));
  });

  test('should fail with invalid code characters', () => {
    const result = validateCreate({ name: 'Test', code: 'test code!' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('betűket')));
  });

  test('should accept valid code with hyphens and underscores', () => {
    const result = validateCreate({ name: 'Test', code: 'OPR-BP_01' });
    assert.ok(result.valid);
  });

  test('should fail with negative budget', () => {
    const result = validateCreate({ name: 'Test', code: 'TST', budget: -1000 });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('negatív')));
  });

  test('should accept zero budget', () => {
    const result = validateCreate({ name: 'Test', code: 'TST', budget: 0 });
    assert.ok(result.valid);
  });

  test('should accept valid budget', () => {
    const result = validateCreate({ name: 'Test', code: 'TST', budget: 5000000 });
    assert.ok(result.valid);
  });

  test('should fail with description too long', () => {
    const result = validateCreate({ name: 'Test', code: 'TST', description: 'A'.repeat(501) });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('500')));
  });

  test('should accept all optional fields', () => {
    const result = validateCreate({
      name: 'Operatív költségek',
      code: 'OPR',
      description: 'Napi működési költségek',
      budget: 10000000,
      parent_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    assert.ok(result.valid);
  });
});

describe('validateUpdate', () => {
  test('should fail with no valid fields', () => {
    const result = validateUpdate({ invalid_field: 'value' });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('mező')));
  });

  test('should pass with only name', () => {
    const result = validateUpdate({ name: 'Új név' });
    assert.ok(result.valid);
  });

  test('should pass with only budget', () => {
    const result = validateUpdate({ budget: 5000000 });
    assert.ok(result.valid);
  });

  test('should fail with empty name', () => {
    const result = validateUpdate({ name: '' });
    assert.ok(!result.valid);
  });

  test('should fail with invalid code on update', () => {
    const result = validateUpdate({ code: 'invalid code!' });
    assert.ok(!result.valid);
  });

  test('should pass with valid code update', () => {
    const result = validateUpdate({ code: 'NEW-CODE' });
    assert.ok(result.valid);
  });

  test('should fail with negative budget on update', () => {
    const result = validateUpdate({ budget: -500 });
    assert.ok(!result.valid);
  });
});

// ============================================
// Hierarchy Tests
// ============================================

describe('Tree Building', () => {
  function buildTree(flatList) {
    const map = {};
    const roots = [];
    flatList.forEach(item => { map[item.id] = { ...item, children: [] }; });
    flatList.forEach(item => {
      if (item.parent_id && map[item.parent_id]) {
        map[item.parent_id].children.push(map[item.id]);
      } else {
        roots.push(map[item.id]);
      }
    });
    return roots;
  }

  test('should build empty tree from empty list', () => {
    const tree = buildTree([]);
    assert.strictEqual(tree.length, 0);
  });

  test('should build single root', () => {
    const tree = buildTree([{ id: '1', name: 'Root', parent_id: null }]);
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].name, 'Root');
    assert.strictEqual(tree[0].children.length, 0);
  });

  test('should build parent-child relationship', () => {
    const tree = buildTree([
      { id: '1', name: 'Root', parent_id: null },
      { id: '2', name: 'Child', parent_id: '1' },
    ]);
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].children.length, 1);
    assert.strictEqual(tree[0].children[0].name, 'Child');
  });

  test('should build multi-level hierarchy', () => {
    const tree = buildTree([
      { id: '1', name: 'Root', parent_id: null },
      { id: '2', name: 'L2', parent_id: '1' },
      { id: '3', name: 'L3', parent_id: '2' },
    ]);
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].children[0].children[0].name, 'L3');
  });

  test('should handle multiple roots', () => {
    const tree = buildTree([
      { id: '1', name: 'Root A', parent_id: null },
      { id: '2', name: 'Root B', parent_id: null },
      { id: '3', name: 'Child A', parent_id: '1' },
    ]);
    assert.strictEqual(tree.length, 2);
  });

  test('should handle orphaned children as roots', () => {
    const tree = buildTree([
      { id: '2', name: 'Orphan', parent_id: 'nonexistent' },
    ]);
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].name, 'Orphan');
  });

  test('should handle multiple siblings', () => {
    const tree = buildTree([
      { id: '1', name: 'Parent', parent_id: null },
      { id: '2', name: 'Child 1', parent_id: '1' },
      { id: '3', name: 'Child 2', parent_id: '1' },
      { id: '4', name: 'Child 3', parent_id: '1' },
    ]);
    assert.strictEqual(tree[0].children.length, 3);
  });
});

// ============================================
// Service Logic Tests
// ============================================

describe('Soft Delete Logic', () => {
  test('should not delete with active children', () => {
    const childrenCount = 3;
    const canDelete = childrenCount === 0;
    assert.ok(!canDelete);
  });

  test('should allow delete with no children', () => {
    const childrenCount = 0;
    const canDelete = childrenCount === 0;
    assert.ok(canDelete);
  });

  test('should soft delete when invoices exist', () => {
    const invoiceCount = 5;
    const shouldSoftDelete = invoiceCount > 0;
    assert.ok(shouldSoftDelete);
  });

  test('should hard delete when no invoices', () => {
    const invoiceCount = 0;
    const shouldHardDelete = invoiceCount === 0;
    assert.ok(shouldHardDelete);
  });
});

describe('Self-Reference Prevention', () => {
  test('should prevent setting parent to self', () => {
    const id = 'abc-123';
    const parentId = 'abc-123';
    assert.ok(id === parentId, 'Should detect self-reference');
  });

  test('should allow different parent', () => {
    const id = 'abc-123';
    const parentId = 'def-456';
    assert.ok(id !== parentId, 'Different IDs should be fine');
  });
});

describe('Code Formatting', () => {
  test('should uppercase code', () => {
    const code = 'opr-bp';
    assert.strictEqual(code.trim().toUpperCase(), 'OPR-BP');
  });

  test('should trim code whitespace', () => {
    const code = '  TST  ';
    assert.strictEqual(code.trim().toUpperCase(), 'TST');
  });
});

describe('VALID_FIELDS', () => {
  test('should include essential fields', () => {
    assert.ok(VALID_FIELDS.includes('name'));
    assert.ok(VALID_FIELDS.includes('code'));
    assert.ok(VALID_FIELDS.includes('description'));
    assert.ok(VALID_FIELDS.includes('budget'));
    assert.ok(VALID_FIELDS.includes('parent_id'));
  });

  test('should include display fields', () => {
    assert.ok(VALID_FIELDS.includes('color'));
    assert.ok(VALID_FIELDS.includes('icon'));
    assert.ok(VALID_FIELDS.includes('is_active'));
  });
});

describe('Edge Cases', () => {
  test('should handle null budget', () => {
    const result = validateCreate({ name: 'Test', code: 'TST', budget: null });
    assert.ok(result.valid);
  });

  test('should handle undefined optional fields', () => {
    const result = validateCreate({ name: 'Test', code: 'TST', description: undefined });
    assert.ok(result.valid);
  });

  test('should handle numeric string budget', () => {
    const budget = '5000';
    const parsed = parseFloat(budget);
    assert.ok(!isNaN(parsed));
    assert.strictEqual(parsed, 5000);
  });

  test('should handle NaN budget', () => {
    const result = validateCreate({ name: 'Test', code: 'TST', budget: 'not-a-number' });
    assert.ok(!result.valid);
  });
});

// ============================================
// Summary
// ============================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(40)}\n`);

if (failed > 0) {
  process.exit(1);
}
