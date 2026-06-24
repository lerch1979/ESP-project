/**
 * STEP 1 regression: admin KB authoring scope.
 *
 * The fix lets the admin UI author GLOBAL entries (contractor_id = NULL) so
 * content reaches ALL residents regardless of contractor — defaulting to
 * global. Guards that:
 *   - no scope            → contractor_id NULL (global)  ← the critical default
 *   - scope 'contractor'  → the chosen/own contractor
 *   - admin LIST query includes global entries
 */
const mockQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'kb-new' }] });
jest.mock('../src/database/connection', () => ({ query: (...a) => mockQuery(...a) }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const ctrl = require('../src/controllers/chatbot.controller');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const insertContractorId = () => {
  const call = mockQuery.mock.calls.find(c => /INSERT INTO chatbot_knowledge_base/i.test(c[0]));
  return call[1][0]; // first param = contractor_id
};

beforeEach(() => mockQuery.mockClear());

describe('createKnowledgeBaseEntry scope', () => {
  test('defaults to GLOBAL (contractor_id NULL) when no scope given', async () => {
    const req = { body: { question: 'Q', answer: 'A' }, user: { contractorId: 'c-admin', roles: ['superadmin'] } };
    await ctrl.createKnowledgeBaseEntry(req, mockRes());
    expect(insertContractorId()).toBeNull();
  });

  test('scope=contractor + superadmin uses the chosen contractor', async () => {
    const req = { body: { question: 'Q', answer: 'A', scope: 'contractor', contractor_id: 'c-target' }, user: { contractorId: 'c-admin', roles: ['superadmin'] } };
    await ctrl.createKnowledgeBaseEntry(req, mockRes());
    expect(insertContractorId()).toBe('c-target');
  });

  test('scope=contractor + non-superadmin is pinned to their own contractor', async () => {
    const req = { body: { question: 'Q', answer: 'A', scope: 'contractor', contractor_id: 'c-other' }, user: { contractorId: 'c-mine', roles: ['admin'] } };
    await ctrl.createKnowledgeBaseEntry(req, mockRes());
    expect(insertContractorId()).toBe('c-mine'); // cannot target another contractor
  });
});

describe('getKnowledgeBase list', () => {
  test('includes global entries (contractor_id IS NULL)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '0' }] });
    const req = { query: {}, user: { contractorId: 'c1', roles: ['admin'] } };
    await ctrl.getKnowledgeBase(req, mockRes());
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/contractor_id IS NULL/i);
  });
});
