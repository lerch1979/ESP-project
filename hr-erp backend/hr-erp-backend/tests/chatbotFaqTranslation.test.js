/**
 * Regression: the FAQ tab must serve content in the resident's language using
 * the cache-backed translation layer — matching chatbot-message behaviour.
 *
 *  - lang 'hu'  → raw entries, NO translation round-trip (no needless calls)
 *  - lang 'en'/'uk'/… → question + answer (+ category name) translated, with
 *    the Hungarian original kept for a toggle (question_original, is_translated)
 */
jest.mock('../src/services/chatbot.service', () => ({
  getFaqEntries: jest.fn(),
  getFaqCategories: jest.fn(),
}));
jest.mock('../src/services/translation.service', () => ({
  getUserLanguage: jest.fn().mockResolvedValue('hu'),
  translateText: jest.fn((t, from, to) => Promise.resolve(`[${to}] ${t}`)),
}));
jest.mock('../src/database/connection', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const chatbotService = require('../src/services/chatbot.service');
const translation = require('../src/services/translation.service');
const { getUserFaqEntries, getUserFaqCategories } = require('../src/controllers/chatbot.controller');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const ENTRY = { id: '1', question: 'Hogyan jelentsem?', answer: 'A HR csapatnak.', category_name: 'Lakhatás' };

beforeEach(() => {
  jest.clearAllMocks();
  translation.translateText.mockImplementation((t, from, to) => Promise.resolve(`[${to}] ${t}`));
  chatbotService.getFaqEntries.mockResolvedValue([{ ...ENTRY }]);
  chatbotService.getFaqCategories.mockResolvedValue([{ id: 'c1', name: 'Lakhatás' }]);
});

describe('getUserFaqEntries translation', () => {
  test('lang=en → translates question/answer and keeps the Hungarian original', async () => {
    const res = mockRes();
    await getUserFaqEntries({ query: { lang: 'en' }, user: { id: 'u', contractorId: 'c' } }, res);
    const row = res.json.mock.calls[0][0].data[0];
    expect(row.question).toBe('[en] Hogyan jelentsem?');
    expect(row.answer).toBe('[en] A HR csapatnak.');
    expect(row.question_original).toBe('Hogyan jelentsem?');
    expect(row.is_translated).toBe(true);
  });

  test('lang=hu → raw entries, NO translation call', async () => {
    const res = mockRes();
    await getUserFaqEntries({ query: { lang: 'hu' }, user: { id: 'u', contractorId: 'c' } }, res);
    const row = res.json.mock.calls[0][0].data[0];
    expect(row.question).toBe('Hogyan jelentsem?');
    expect(row.is_translated).toBeUndefined();
    expect(translation.translateText).not.toHaveBeenCalled();
  });

  test('no ?lang → falls back to the resident\'s stored language', async () => {
    translation.getUserLanguage.mockResolvedValueOnce('uk');
    const res = mockRes();
    await getUserFaqEntries({ query: {}, user: { id: 'u', contractorId: 'c' } }, res);
    expect(translation.getUserLanguage).toHaveBeenCalledWith('u');
    expect(res.json.mock.calls[0][0].data[0].question).toBe('[uk] Hogyan jelentsem?');
  });
});

describe('getUserFaqCategories translation', () => {
  test('lang=de → category name translated', async () => {
    const res = mockRes();
    await getUserFaqCategories({ query: { lang: 'de' }, user: { id: 'u', contractorId: 'c' } }, res);
    const cat = res.json.mock.calls[0][0].data[0];
    expect(cat.name).toBe('[de] Lakhatás');
    expect(cat.name_original).toBe('Lakhatás');
  });
});
