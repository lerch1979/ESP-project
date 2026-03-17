/**
 * End-to-end workflow tests for the wellbeing platform.
 * Tests complete user journeys across WellMind, CarePath, and Integration layers.
 */

const wellmindService = require('../src/services/wellmind.service');
const carepathService = require('../src/services/carepath.service');
const integrationService = require('../src/services/wellbeingIntegration.service');

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { query } = require('../src/database/connection');

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 1: High Burnout → CarePath Referral → Case → Booking
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow: High Burnout → CarePath Case', () => {
  test('MBI scoring correctly identifies red risk from high scores', () => {
    const responses = [
      { category: 'emotional_exhaustion', score: 9 },
      { category: 'emotional_exhaustion', score: 8 },
      { category: 'emotional_exhaustion', score: 9 },
      { category: 'depersonalization', score: 8 },
      { category: 'depersonalization', score: 7 },
      { category: 'personal_accomplishment', score: 2 },
      { category: 'personal_accomplishment', score: 3 },
    ];
    const burnout = wellmindService.calculateBurnoutScore(responses);
    expect(burnout.total).toBeGreaterThan(70);
    expect(burnout.emotional_exhaustion).toBeGreaterThan(75);
  });

  test('red risk triggers intervention recommendations', () => {
    const assessment = {
      burnout_score: 82, engagement_score: 28,
      emotional_exhaustion_score: 85, depersonalization_score: 70,
      personal_accomplishment_score: 25,
    };
    const interventions = wellmindService.recommendInterventions(assessment);
    const types = interventions.map(i => i.intervention_type);
    expect(types).toContain('eap_referral');
    expect(types).toContain('coaching');
    expect(types).toContain('time_off');
  });

  test('risk level correctly classifies burnout 82 + engagement 28 as red', () => {
    expect(wellmindService.determineRiskLevel(82, 28)).toBe('red');
  });

  test('auto-referral creates CarePath referral for burnout > 80', async () => {
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    query.mockResolvedValueOnce({ rows: [] }); // no existing referral

    const referral = await integrationService.checkWellMindRiskTriggers('u1', 'c1', {
      id: 'a1', burnout_score: 85, risk_level: 'red',
    });
    expect(referral).not.toBeNull();
  });

  test('CarePath case generates correct case number format', async () => {
    query.mockResolvedValueOnce({ rows: [{ seq: 42 }] });
    const num = await carepathService.generateCaseNumber();
    expect(num).toMatch(/^CP-\d{4}-\d{6}$/);
  });

  test('Haversine distance correctly calculates Budapest providers', () => {
    // Budapest center to Debrecen
    const dist = carepathService.haversineDistance(47.4979, 19.0402, 47.5316, 21.6273);
    expect(dist).toBeGreaterThan(150);
    expect(dist).toBeLessThan(250);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 2: Consecutive Low Pulse → Auto-Referral
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow: Consecutive Low Pulse Detection', () => {
  test('3 consecutive scores ≤ 2 triggers referral', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 2 }, { mood_score: 1 }, { mood_score: 2 }] });
    query.mockResolvedValueOnce({ rows: [] }); // no existing referral
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });

    const result = await integrationService.checkConsecutiveLowPulse('u1', 'c1');
    expect(result).not.toBeNull();
  });

  test('scores of 3 do NOT trigger (threshold is ≤ 2)', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 3 }, { mood_score: 2 }, { mood_score: 3 }] });
    const result = await integrationService.checkConsecutiveLowPulse('u1', 'c1');
    expect(result).toBeNull();
  });

  test('only 2 low scores does NOT trigger', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 1 }, { mood_score: 2 }] });
    const result = await integrationService.checkConsecutiveLowPulse('u1', 'c1');
    expect(result).toBeNull();
  });

  test('duplicate referral prevention works', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 1 }, { mood_score: 1 }, { mood_score: 1 }] });
    query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] }); // existing referral
    const result = await integrationService.checkConsecutiveLowPulse('u1', 'c1');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 3: Chatbot Crisis Detection
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow: Chatbot Crisis Keywords', () => {
  const crisisMessages = [
    'I want to kill myself',
    'Meg akarok halni',
    'Öngyilkos gondolataim vannak',
    'I want to end it all',
  ];

  const mentalHealthMessages = [
    'Nagyon depresszióval küzdök',
    'I feel so anxious and overwhelmed',
    'Nagyon stresszes vagyok a munkában',
  ];

  const normalMessages = [
    'Mikor van a következő csapatépítő?',
    'What is the vacation policy?',
    'Hogyan kérhetek szabadságot?',
  ];

  test.each(crisisMessages)('crisis: "%s" triggers immediate referral', async (msg) => {
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    const result = await integrationService.checkChatbotMentalHealthKeywords('u1', 'c1', msg);
    expect(result).not.toBeNull();
    expect(result.type).toBe('crisis');
  });

  test.each(mentalHealthMessages)('mental health: "%s" triggers medium referral', async (msg) => {
    query.mockResolvedValueOnce({ rows: [] }); // no existing
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    const result = await integrationService.checkChatbotMentalHealthKeywords('u1', 'c1', msg);
    expect(result).not.toBeNull();
    expect(result.type).toBe('mental_health');
  });

  test.each(normalMessages)('normal: "%s" returns null', async (msg) => {
    const result = await integrationService.checkChatbotMentalHealthKeywords('u1', 'c1', msg);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 4: Manager Concern → Assessment
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow: Manager Concern', () => {
  test('manager concern creates referral to WellMind', async () => {
    // createReferral needs: user lookup (if no contractor_id) + insert
    // handleManagerConcern passes contractor_id directly, so just the insert
    query.mockResolvedValueOnce({ rows: [{ id: 'ref1', status: 'pending', contractor_id: 'c1', referral_type: 'manager_concern_to_assessment', urgency_level: 'medium' }] }); // createReferral insert
    query.mockResolvedValue({ rows: [{ id: 'n1', contractor_id: 'c1' }] }); // notifications + audit

    const result = await integrationService.handleManagerConcern('mgr1', 'emp1', 'c1', {
      concern_type: 'general', description: 'Employee seems withdrawn',
    });
    expect(result).toBeDefined();
    expect(result.id).toBe('ref1');
  });

  test('urgent concern gets high urgency', async () => {
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    await integrationService.handleManagerConcern('mgr1', 'emp1', 'c1', {
      concern_type: 'urgent', description: 'Sudden change',
    });
    const refCall = query.mock.calls.find(c =>
      c[0]?.includes('wellbeing_referrals') && c[0]?.includes('INSERT')
    );
    expect(refCall[1]).toContain('high');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 5: Complete Scoring Accuracy
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow: Scoring Accuracy', () => {
  test('minimum burnout = 0 (best case)', () => {
    const responses = [
      { category: 'emotional_exhaustion', score: 1 },
      { category: 'depersonalization', score: 1 },
      { category: 'personal_accomplishment', score: 10 },
    ];
    const result = wellmindService.calculateBurnoutScore(responses);
    expect(result.total).toBe(0);
  });

  test('maximum burnout = 100 (worst case)', () => {
    const responses = [
      { category: 'emotional_exhaustion', score: 10 },
      { category: 'depersonalization', score: 10 },
      { category: 'personal_accomplishment', score: 1 },
    ];
    const result = wellmindService.calculateBurnoutScore(responses);
    expect(result.total).toBe(100);
  });

  test('MBI weights sum to 1.0', () => {
    const { ee, dp, pa } = wellmindService.MBI_WEIGHTS;
    expect(ee + dp + pa).toBe(1);
  });

  test('UWES weights sum to 1.0', () => {
    const { vigor, dedication, absorption } = wellmindService.UWES_WEIGHTS;
    expect(vigor + dedication + absorption).toBe(1);
  });

  test('minimum engagement = 0', () => {
    const responses = [
      { category: 'vigor', score: 1 },
      { category: 'dedication', score: 1 },
      { category: 'absorption', score: 1 },
    ];
    expect(wellmindService.calculateEngagementScore(responses).total).toBe(0);
  });

  test('maximum engagement = 100', () => {
    const responses = [
      { category: 'vigor', score: 10 },
      { category: 'dedication', score: 10 },
      { category: 'absorption', score: 10 },
    ];
    expect(wellmindService.calculateEngagementScore(responses).total).toBe(100);
  });

  // Risk matrix boundary tests
  const riskCases = [
    [0, 100, 'green'],   [49, 51, 'green'],
    [50, 60, 'yellow'],  [70, 50, 'yellow'],  [30, 50, 'yellow'],
    [71, 60, 'red'],     [30, 29, 'red'],     [100, 0, 'red'],
  ];

  test.each(riskCases)('burnout=%d engagement=%d → %s', (b, e, expected) => {
    expect(wellmindService.determineRiskLevel(b, e)).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 6: Notification Templates
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow: Notification System', () => {
  const { renderTemplate, listTemplates } = require('../src/config/notificationTemplates');

  test('all templates render without error', () => {
    const names = listTemplates();
    expect(names.length).toBeGreaterThanOrEqual(12);
    names.forEach(name => {
      expect(() => renderTemplate(name, {})).not.toThrow();
    });
  });

  test('appointment reminder renders with provider data', () => {
    const result = renderTemplate('carepath_appointment_reminder', {
      time: '10:00', provider_name: 'Dr. Kovács Anna',
      location_info: 'Budapest, Fő u. 1.', booking_id: 'b123',
    });
    expect(result.message).toContain('10:00');
    expect(result.message).toContain('Dr. Kovács Anna');
    expect(result.action_url).toContain('b123');
  });

  test('crisis hotline has urgent priority', () => {
    const result = renderTemplate('crisis_hotline');
    expect(result.priority).toBe('urgent');
    expect(result.message).toContain('116-123');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 7: Privacy & Aggregation
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow: Privacy Enforcement', () => {
  test('team metrics require minimum 5 employees', async () => {
    // getTeamMetrics passes MIN_TEAM_SIZE as SQL param
    query.mockResolvedValueOnce({ rows: [] });
    const result = await wellmindService.getTeamMetrics('c1', '2026-01-01', '2026-03-31');
    // Verify 5 was passed as parameter
    expect(query.mock.calls[0][1]).toContain(5);
  });

  test('company wellbeing index requires >= 5 employees', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    await expect(
      integrationService.getCompanyWellbeingIndex('c1')
    ).rejects.toThrow('minimum 5 employees');
  });

  test('MIN_TEAM_SIZE constant is 5', () => {
    expect(wellmindService.MIN_TEAM_SIZE).toBe(5);
    expect(integrationService.MIN_AGGREGATION_SIZE).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW 8: Intervention Rule Coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('Workflow: Intervention Rules Complete Coverage', () => {
  test('7 rules defined', () => {
    expect(wellmindService.INTERVENTION_RULES).toHaveLength(7);
  });

  test('all rules have required fields', () => {
    wellmindService.INTERVENTION_RULES.forEach(rule => {
      expect(rule.id).toBeDefined();
      expect(rule.condition).toBeInstanceOf(Function);
      expect(rule.intervention.intervention_type).toBeDefined();
      expect(rule.intervention.title).toBeDefined();
      expect(rule.intervention.description).toBeDefined();
      expect(rule.intervention.priority).toBeDefined();
    });
  });

  test('no intervention for perfectly healthy employee', () => {
    const healthy = {
      burnout_score: 10, engagement_score: 90,
      emotional_exhaustion_score: 10, depersonalization_score: 5,
      personal_accomplishment_score: 95,
    };
    const interventions = wellmindService.recommendInterventions(healthy);
    expect(interventions.filter(i => i.priority === 'urgent')).toHaveLength(0);
    expect(interventions.filter(i => i.priority === 'high')).toHaveLength(0);
  });

  test('maximum interventions for worst-case employee', () => {
    const worst = {
      burnout_score: 90, engagement_score: 15,
      emotional_exhaustion_score: 95, depersonalization_score: 85,
      personal_accomplishment_score: 10,
    };
    const interventions = wellmindService.recommendInterventions(worst);
    // Should fire: R01 (eap), R02 (coaching), R04 (time_off), R05 (workload), R06 (training), R07 (exercise)
    expect(interventions.length).toBeGreaterThanOrEqual(5);
  });
});
