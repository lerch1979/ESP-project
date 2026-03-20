/**
 * Pulse Question Rotation — Unit Tests
 */
const { formatQuestion } = require('../src/services/pulseQuestionRotation.service');

const mockQuestion = {
  id: 'test-id',
  question_code: 'MW-006',
  category: 'mental_wellbeing',
  question_hu: 'Milyen a hangulatod ma?',
  question_en: 'What is your mood today?',
  question_tl: 'Ano ang mood mo ngayon?',
  question_uk: 'Який у вас настрій сьогодні?',
  question_de: 'Wie ist Ihre Stimmung heute?',
  scale_type: 'scale_1_5',
  scale_min: 1,
  scale_max: 5,
  scale_labels_hu: ['Nagyon rossz', 'Rossz', 'Semleges', 'Jó', 'Nagyon jó'],
  scale_labels_en: ['Very bad', 'Bad', 'Neutral', 'Good', 'Very good'],
  requires_text: false,
  is_core: true,
};

describe('Pulse Question Rotation', () => {
  describe('formatQuestion', () => {
    it('should format question in Hungarian', () => {
      const result = formatQuestion(mockQuestion, 'hu');
      expect(result.question).toBe('Milyen a hangulatod ma?');
      expect(result.code).toBe('MW-006');
      expect(result.category).toBe('mental_wellbeing');
      expect(result.scale_type).toBe('scale_1_5');
      expect(result.is_core).toBe(true);
    });

    it('should format question in English', () => {
      const result = formatQuestion(mockQuestion, 'en');
      expect(result.question).toBe('What is your mood today?');
    });

    it('should format question in Tagalog', () => {
      const result = formatQuestion(mockQuestion, 'tl');
      expect(result.question).toBe('Ano ang mood mo ngayon?');
    });

    it('should format question in Ukrainian', () => {
      const result = formatQuestion(mockQuestion, 'uk');
      expect(result.question).toBe('Який у вас настрій сьогодні?');
    });

    it('should format question in German', () => {
      const result = formatQuestion(mockQuestion, 'de');
      expect(result.question).toBe('Wie ist Ihre Stimmung heute?');
    });

    it('should fallback to Hungarian for invalid language', () => {
      const result = formatQuestion(mockQuestion, 'xx');
      expect(result.question).toBe('Milyen a hangulatod ma?');
    });

    it('should include scale info', () => {
      const result = formatQuestion(mockQuestion, 'hu');
      expect(result.scale_min).toBe(1);
      expect(result.scale_max).toBe(5);
    });
  });
});
