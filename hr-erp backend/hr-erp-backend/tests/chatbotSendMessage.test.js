/**
 * Regression test for the chatbot sendMessage bot-reply INSERT.
 *
 * Bug (introduced 2026-04-21, commit c2883438; fixed here): the
 * chatbot_messages INSERT listed 10 columns but supplied only 9 value
 * expressions — the `sender_type` literal ('bot') was missing — so every
 * resident chatbot send failed with Postgres 42601 "INSERT has more target
 * columns than expressions" (HTTP 500). This guards the column/value balance
 * so it can't silently break again.
 */
const mockQuery = jest.fn();
jest.mock('../src/database/connection', () => ({ query: (...a) => mockQuery(...a), transaction: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../src/utils/validation', () => ({ isValidUUID: () => true }));
jest.mock('../src/services/chatbot.service', () => ({
  sanitizeInput: (s) => s,
  processMessage: jest.fn().mockResolvedValue({ message_type: 'text', content: 'Szia! Miben segíthetek?', metadata: {} }),
}));
jest.mock('../src/services/translation.service', () => ({
  getUserLanguage: jest.fn().mockResolvedValue('hu'),
}));

const { sendMessage } = require('../src/controllers/chatbot.controller');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

// Parse a flat "INSERT INTO t (cols...) VALUES (vals...)" and count both sides.
const balance = (sql) => {
  const cols = sql.match(/INSERT INTO chatbot_messages\s*\(([^)]*)\)/i)[1].split(',').length;
  const vals = sql.match(/VALUES\s*\(([^)]*)\)/i)[1].split(',').length;
  return { cols, vals };
};

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'active' }] })   // ownership check
    .mockResolvedValueOnce({ rows: [{ id: 'um1' }] })                    // user message insert
    .mockResolvedValueOnce({ rows: [{ id: 'bm1', content: 'r', translated_content: null, is_translated: false }] }) // bot insert
    .mockResolvedValueOnce({ rows: [{ cnt: '1' }] })                     // message count
    .mockResolvedValueOnce({ rows: [] });                                // title update
});

const run = () => {
  const req = { params: { conversationId: 'c1' }, body: { content: 'Sziasztok' }, user: { id: 'u1', contractorId: 'k1' } };
  const res = mockRes();
  return sendMessage(req, res).then(() => res);
};

test('send completes successfully (no 500)', async () => {
  const res = await run();
  expect(res.status).not.toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

test('bot-reply INSERT has equal column and value counts', async () => {
  await run();
  const botInsert = mockQuery.mock.calls
    .map((c) => c[0])
    .find((sql) => /INSERT INTO chatbot_messages/i.test(sql) && /is_translated/.test(sql));
  expect(botInsert).toBeDefined();
  const { cols, vals } = balance(botInsert);
  expect(cols).toBe(10);
  expect(vals).toBe(cols); // the bug was 10 cols vs 9 vals
});

test('sender_type is explicitly inserted as the second value', async () => {
  await run();
  const botInsert = mockQuery.mock.calls.map((c) => c[0]).find((sql) => /is_translated/.test(sql));
  const vals = botInsert.match(/VALUES\s*\(([^)]*)\)/i)[1].split(',').map((s) => s.trim());
  expect(vals[1]).toBe("'bot'"); // column index 1 = sender_type
});
