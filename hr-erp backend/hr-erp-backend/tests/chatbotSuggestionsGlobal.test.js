/**
 * Regression test: the remaining chatbot content queries must include global
 * (contractor_id IS NULL) rows.
 *
 *  A — getSuggestions   (chatbot_knowledge_base) : was the last ACTIVE instance
 *  B — matchDecisionTree (chatbot_decision_trees) : hardened (table empty today)
 *  C — getContractorConfig via getWelcomeMessage (chatbot_config) : hardened
 *
 * All three filtered `contractor_id = $1`, which excludes the global content the
 * app actually ships. Fix uses `(contractor_id = $1 OR contractor_id IS NULL)`.
 */
const mockQuery = jest.fn();
jest.mock('../src/database/connection', () => ({ query: (...a) => mockQuery(...a) }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const svc = require('../src/services/chatbot.service');

let n = 0;
const newContractor = () => `contractor-${++n}`;
const lastSql = () => mockQuery.mock.calls[mockQuery.mock.calls.length - 1][0];

beforeEach(() => mockQuery.mockReset());

describe('A — getSuggestions (the last active instance)', () => {
  test('query includes global entries and surfaces a global suggestion', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'kb-1', question: 'Kinek jelentsem?', answer: 'HR.', score: 0.9 }] });
    const out = await svc.getSuggestions('jelentem a hibat', newContractor());
    expect(lastSql()).toMatch(/contractor_id = \$1 OR contractor_id IS NULL/i);
    expect(out).toHaveLength(1);
  });
});

describe('B — matchDecisionTree (hardened)', () => {
  test('query includes global decision trees', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 't-1', name: 'Hiba', trigger_keywords: ['hiba'] }] });
    const tree = await svc.matchDecisionTree('van egy hiba', newContractor());
    expect(lastSql()).toMatch(/contractor_id = \$1 OR contractor_id IS NULL/i);
    expect(tree && tree.id).toBe('t-1'); // global tree is reachable + matched
  });
});

describe('C — chatbot_config via getWelcomeMessage (hardened)', () => {
  test('config query includes a global fallback row', async () => {
    mockQuery.mockResolvedValue({ rows: [{ welcome_message: 'Üdv globálisan!' }] });
    const msg = await svc.getWelcomeMessage(newContractor());
    expect(lastSql()).toMatch(/contractor_id = \$1 OR contractor_id IS NULL/i);
    expect(msg).toBe('Üdv globálisan!'); // global config is honoured
  });
});
