/**
 * Regression test: global (contractor_id IS NULL) knowledge-base entries must
 * be reachable by the chatbot matchers.
 *
 * Bug (fixed here): matchKnowledgeBase + semanticMatchKnowledgeBase queried
 * `WHERE contractor_id = $1`, which excludes global entries. Since 100% of the
 * KB is global, every contractor matched nothing and the bot always returned
 * the fallback message. The fix uses `(contractor_id = $1 OR contractor_id IS
 * NULL)`. These tests guard both the SQL clause and the end behaviour.
 */
const mockQuery = jest.fn();
jest.mock('../src/database/connection', () => ({ query: (...a) => mockQuery(...a) }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../src/services/claude.service', () => ({
  isAvailable: () => true,
  semanticMatch: jest.fn().mockResolvedValue({ faqIndex: 1, confidence: 72 }),
}));

const { matchKnowledgeBase, semanticMatchKnowledgeBase } = require('../src/services/chatbot.service');

// A global FAQ entry (contractor_id NULL) — the only kind that exists today.
const GLOBAL_ENTRY = {
  id: 'kb-global-1',
  question: 'Kinek jelentsem a lakásproblémát?',
  answer: 'A szálláskezelőnek vagy a HR csapatnak.',
  keywords: ['lakás', 'probléma', 'jelentés', 'hiba'],
  priority: 1,
};

const RESIDENT_CONTRACTOR = 'dff75eff-resident-contractor';

const firstSelectSql = () => mockQuery.mock.calls[0][0];

beforeEach(() => mockQuery.mockReset());

describe('matchKnowledgeBase (keyword path)', () => {
  test('query includes global entries (contractor_id IS NULL)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await matchKnowledgeBase('valami kérdés', RESIDENT_CONTRACTOR);
    expect(firstSelectSql()).toMatch(/contractor_id IS NULL/i);
  });

  test('a global entry is reachable and matched for a contractor that owns none', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [GLOBAL_ENTRY] }) // SELECT (global-inclusive)
      .mockResolvedValueOnce({ rows: [] });            // usage_count UPDATE on match
    // Exact question text → instant exact-normalized match.
    const result = await matchKnowledgeBase('Kinek jelentsem a lakásproblémát?', RESIDENT_CONTRACTOR);
    expect(result).not.toBeNull();
    expect(result.id).toBe('kb-global-1');
  });
});

describe('semanticMatchKnowledgeBase (Claude path)', () => {
  test('query includes global entries (contractor_id IS NULL)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await semanticMatchKnowledgeBase('valami kérdés', RESIDENT_CONTRACTOR);
    expect(firstSelectSql()).toMatch(/contractor_id IS NULL/i);
  });

  test('a global entry is returned via semantic match for a contractor that owns none', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [GLOBAL_ENTRY] }) // SELECT (global-inclusive)
      .mockResolvedValueOnce({ rows: [] });            // usage_count UPDATE on match
    const result = await semanticMatchKnowledgeBase('Hogyan jelentsek be hibát?', RESIDENT_CONTRACTOR);
    expect(result).not.toBeNull();
    expect(result.id).toBe('kb-global-1');
    expect(result.combined_score).toBe(72);
  });
});
