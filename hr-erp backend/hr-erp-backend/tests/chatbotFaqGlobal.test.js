/**
 * Regression test: the resident-facing FAQ queries must include global
 * (contractor_id IS NULL) content.
 *
 * Bug (fixed here): getFaqCategories / getFaqEntries / searchFaq filtered
 * `AND contractor_id = $1`, excluding global rows. The FAQ content is 100%
 * global, so a resident (who has a contractorId) saw an EMPTY FAQ tab. The fix
 * uses `(contractor_id = $1 OR contractor_id IS NULL)`.
 */
const mockQuery = jest.fn();
jest.mock('../src/database/connection', () => ({ query: (...a) => mockQuery(...a) }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const svc = require('../src/services/chatbot.service');

const GLOBAL_CATEGORY = { id: 'cat-1', name: 'Lakhatás', slug: 'home', icon: 'home', color: '#fff', sort_order: 1 };
const GLOBAL_ENTRY = { id: 'kb-1', question: 'Kinek jelentsem?', answer: 'A HR csapatnak.', keywords: [], category_id: 'cat-1' };

// Unique contractor ids per test so the FAQ-category cache never masks a call.
let n = 0;
const newContractor = () => `contractor-${++n}`;
const lastSql = () => mockQuery.mock.calls[mockQuery.mock.calls.length - 1][0];

beforeEach(() => mockQuery.mockReset());

test('getFaqCategories includes global categories for a resident contractor', async () => {
  mockQuery.mockResolvedValue({ rows: [GLOBAL_CATEGORY] });
  const rows = await svc.getFaqCategories(newContractor());
  expect(lastSql()).toMatch(/contractor_id IS NULL/i);
  expect(rows).toHaveLength(1);
});

test('getFaqEntries includes global entries for a resident contractor', async () => {
  mockQuery.mockResolvedValue({ rows: [GLOBAL_ENTRY] });
  const rows = await svc.getFaqEntries(newContractor(), null, null);
  expect(lastSql()).toMatch(/kb\.contractor_id = \$\d+ OR kb\.contractor_id IS NULL/i);
  expect(rows).toHaveLength(1);
});

test('searchFaq includes global entries for a resident contractor', async () => {
  mockQuery.mockResolvedValue({ rows: [GLOBAL_ENTRY] });
  const rows = await svc.searchFaq(newContractor(), 'jelent');
  expect(lastSql()).toMatch(/kb\.contractor_id = \$1 OR kb\.contractor_id IS NULL/i);
  expect(rows).toHaveLength(1);
});
