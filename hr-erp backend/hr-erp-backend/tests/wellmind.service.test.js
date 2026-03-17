const wellmind = require('../src/services/wellmind.service');

// ── Mock database ──────────────────────────────────────────────────────────

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
// SCORING: calculateBurnoutScore
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateBurnoutScore', () => {
  test('returns 0 for minimum burnout (all 1s, PA all 10s)', () => {
    const responses = [
      // EE and DP all score 1 (min) → 0% burnout on those dimensions
      { category: 'emotional_exhaustion', score: 1 },
      { category: 'emotional_exhaustion', score: 1 },
      { category: 'emotional_exhaustion', score: 1 },
      { category: 'depersonalization', score: 1 },
      { category: 'depersonalization', score: 1 },
      // PA all 10 (max accomplishment) → 0% burnout on PA dimension
      { category: 'personal_accomplishment', score: 10 },
      { category: 'personal_accomplishment', score: 10 },
      { category: 'personal_accomplishment', score: 10 },
    ];
    const result = wellmind.calculateBurnoutScore(responses);
    expect(result.total).toBe(0);
    expect(result.emotional_exhaustion).toBe(0);
    expect(result.depersonalization).toBe(0);
    expect(result.personal_accomplishment).toBe(100);
  });

  test('returns 100 for maximum burnout (all 10s, PA all 1s)', () => {
    const responses = [
      { category: 'emotional_exhaustion', score: 10 },
      { category: 'emotional_exhaustion', score: 10 },
      { category: 'depersonalization', score: 10 },
      { category: 'depersonalization', score: 10 },
      { category: 'personal_accomplishment', score: 1 },
      { category: 'personal_accomplishment', score: 1 },
    ];
    const result = wellmind.calculateBurnoutScore(responses);
    expect(result.total).toBe(100);
    expect(result.emotional_exhaustion).toBe(100);
    expect(result.depersonalization).toBe(100);
    expect(result.personal_accomplishment).toBe(0);
  });

  test('returns ~50 for mid-range burnout', () => {
    const responses = [
      { category: 'emotional_exhaustion', score: 5.5 },
      { category: 'emotional_exhaustion', score: 5.5 },
      { category: 'depersonalization', score: 5.5 },
      { category: 'personal_accomplishment', score: 5.5 },
    ];
    const result = wellmind.calculateBurnoutScore(responses);
    expect(result.total).toBe(50);
    expect(result.emotional_exhaustion).toBe(50);
  });

  test('weights are applied correctly: EE 45%, DP 25%, PA 30%', () => {
    // EE=100, DP=0, PA=100 (so inverted PA=0)
    const responses = [
      { category: 'emotional_exhaustion', score: 10 },  // 100%
      { category: 'depersonalization', score: 1 },       // 0%
      { category: 'personal_accomplishment', score: 10 }, // PA=100 → burnout contribution = 0
    ];
    const result = wellmind.calculateBurnoutScore(responses);
    // 100*0.45 + 0*0.25 + (100-100)*0.30 = 45
    expect(result.total).toBe(45);
  });

  test('handles empty responses with defaults', () => {
    const result = wellmind.calculateBurnoutScore([]);
    // Default avg = 5, normalize(5) = (5-1)/9*100 = 44.44
    // Total = 44.44*0.45 + 44.44*0.25 + (100-44.44)*0.30 = 20+11.11+16.67 = 47.78
    expect(result.total).toBeGreaterThan(40);
    expect(result.total).toBeLessThan(55);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCORING: calculateEngagementScore
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateEngagementScore', () => {
  test('returns 100 for maximum engagement (all 10s)', () => {
    const responses = [
      { category: 'vigor', score: 10 },
      { category: 'vigor', score: 10 },
      { category: 'dedication', score: 10 },
      { category: 'dedication', score: 10 },
      { category: 'absorption', score: 10 },
      { category: 'absorption', score: 10 },
    ];
    const result = wellmind.calculateEngagementScore(responses);
    expect(result.total).toBe(100);
  });

  test('returns 0 for minimum engagement (all 1s)', () => {
    const responses = [
      { category: 'vigor', score: 1 },
      { category: 'dedication', score: 1 },
      { category: 'absorption', score: 1 },
    ];
    const result = wellmind.calculateEngagementScore(responses);
    expect(result.total).toBe(0);
  });

  test('returns ~50 for mid-range engagement', () => {
    const responses = [
      { category: 'vigor', score: 5.5 },
      { category: 'dedication', score: 5.5 },
      { category: 'absorption', score: 5.5 },
    ];
    const result = wellmind.calculateEngagementScore(responses);
    expect(result.total).toBe(50);
  });

  test('weights: Vigor 35%, Dedication 40%, Absorption 25%', () => {
    const responses = [
      { category: 'vigor', score: 10 },       // 100%
      { category: 'dedication', score: 1 },    // 0%
      { category: 'absorption', score: 1 },    // 0%
    ];
    const result = wellmind.calculateEngagementScore(responses);
    // 100*0.35 + 0*0.40 + 0*0.25 = 35
    expect(result.total).toBe(35);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RISK LEVEL
// ═══════════════════════════════════════════════════════════════════════════

describe('determineRiskLevel', () => {
  test('green: low burnout AND high engagement', () => {
    expect(wellmind.determineRiskLevel(30, 70)).toBe('green');
    expect(wellmind.determineRiskLevel(0, 100)).toBe('green');
    expect(wellmind.determineRiskLevel(49, 51)).toBe('green');
  });

  test('yellow: moderate burnout OR moderate engagement', () => {
    expect(wellmind.determineRiskLevel(50, 60)).toBe('yellow');
    expect(wellmind.determineRiskLevel(60, 55)).toBe('yellow');
    expect(wellmind.determineRiskLevel(30, 50)).toBe('yellow');
    expect(wellmind.determineRiskLevel(69, 80)).toBe('yellow');
  });

  test('red: high burnout OR very low engagement', () => {
    expect(wellmind.determineRiskLevel(71, 60)).toBe('red');
    expect(wellmind.determineRiskLevel(80, 20)).toBe('red');
    expect(wellmind.determineRiskLevel(30, 29)).toBe('red');
    expect(wellmind.determineRiskLevel(100, 0)).toBe('red');
  });

  test('boundary: burnout=70 is yellow, 70.01 is red', () => {
    expect(wellmind.determineRiskLevel(70, 60)).toBe('yellow');
    expect(wellmind.determineRiskLevel(70.01, 60)).toBe('red');
  });

  test('boundary: engagement=30 is yellow, 29.99 is red', () => {
    expect(wellmind.determineRiskLevel(30, 30)).toBe('yellow');
    expect(wellmind.determineRiskLevel(30, 29.99)).toBe('red');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERVENTION RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('recommendInterventions', () => {
  test('high burnout triggers CarePath referral', () => {
    const assessment = { burnout_score: 75, engagement_score: 40, emotional_exhaustion_score: 50, depersonalization_score: 40, personal_accomplishment_score: 60 };
    const interventions = wellmind.recommendInterventions(assessment);
    expect(interventions.some(i => i.intervention_type === 'eap_referral')).toBe(true);
    expect(interventions.find(i => i.intervention_type === 'eap_referral').priority).toBe('urgent');
  });

  test('low engagement triggers coaching', () => {
    const assessment = { burnout_score: 30, engagement_score: 35, emotional_exhaustion_score: 30, depersonalization_score: 20, personal_accomplishment_score: 70 };
    const interventions = wellmind.recommendInterventions(assessment);
    expect(interventions.some(i => i.intervention_type === 'coaching')).toBe(true);
  });

  test('moderate burnout triggers meditation', () => {
    const assessment = { burnout_score: 55, engagement_score: 60, emotional_exhaustion_score: 50, depersonalization_score: 40, personal_accomplishment_score: 60 };
    const interventions = wellmind.recommendInterventions(assessment);
    expect(interventions.some(i => i.intervention_type === 'meditation')).toBe(true);
  });

  test('high emotional exhaustion triggers time_off', () => {
    const assessment = { burnout_score: 60, engagement_score: 50, emotional_exhaustion_score: 75, depersonalization_score: 40, personal_accomplishment_score: 60 };
    const interventions = wellmind.recommendInterventions(assessment);
    expect(interventions.some(i => i.intervention_type === 'time_off')).toBe(true);
  });

  test('high depersonalization triggers workload adjustment', () => {
    const assessment = { burnout_score: 55, engagement_score: 50, emotional_exhaustion_score: 50, depersonalization_score: 65, personal_accomplishment_score: 60 };
    const interventions = wellmind.recommendInterventions(assessment);
    expect(interventions.some(i => i.intervention_type === 'workload_adjustment')).toBe(true);
  });

  test('low personal accomplishment triggers training', () => {
    const assessment = { burnout_score: 40, engagement_score: 55, emotional_exhaustion_score: 30, depersonalization_score: 20, personal_accomplishment_score: 35 };
    const interventions = wellmind.recommendInterventions(assessment);
    expect(interventions.some(i => i.intervention_type === 'training')).toBe(true);
  });

  test('green assessment generates no urgent interventions', () => {
    const assessment = { burnout_score: 20, engagement_score: 80, emotional_exhaustion_score: 15, depersonalization_score: 10, personal_accomplishment_score: 90 };
    const interventions = wellmind.recommendInterventions(assessment);
    expect(interventions.filter(i => i.priority === 'urgent')).toHaveLength(0);
  });

  test('multiple rules can fire simultaneously', () => {
    const assessment = { burnout_score: 75, engagement_score: 30, emotional_exhaustion_score: 80, depersonalization_score: 65, personal_accomplishment_score: 35 };
    const interventions = wellmind.recommendInterventions(assessment);
    expect(interventions.length).toBeGreaterThanOrEqual(4);
    const types = interventions.map(i => i.intervention_type);
    expect(types).toContain('eap_referral');
    expect(types).toContain('coaching');
    expect(types).toContain('time_off');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PULSE SUBMISSION
// ═══════════════════════════════════════════════════════════════════════════

describe('submitPulse', () => {
  test('submits pulse successfully', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'p1', mood_score: 4 }] }) // insert
      .mockResolvedValueOnce({ rows: [{ mood_score: 4 }, { mood_score: 3 }, { mood_score: 5 }] }); // risk check

    const result = await wellmind.submitPulse('u1', 'c1', { mood_score: 4, stress_level: 5 });
    expect(result.mood_score).toBe(4);
  });

  test('rejects invalid mood_score', async () => {
    await expect(wellmind.submitPulse('u1', 'c1', { mood_score: 0 })).rejects.toThrow('mood_score must be between 1 and 5');
    await expect(wellmind.submitPulse('u1', 'c1', { mood_score: 6 })).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// IMMEDIATE RISK DETECTION
// ═══════════════════════════════════════════════════════════════════════════

describe('checkImmediateRisk', () => {
  test('triggers referral on 3 consecutive low scores', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ mood_score: 1 }, { mood_score: 2 }, { mood_score: 1 }] }) // 3 low scores
      .mockResolvedValueOnce({ rows: [] })  // no existing referral
      .mockResolvedValueOnce({ rows: [{ id: 'ref1' }] })  // insert referral
      .mockResolvedValueOnce({ rows: [{ id: 'notif1' }] }); // insert notification

    const result = await wellmind.checkImmediateRisk('u1', 'c1');
    expect(result).toBe(true);
    expect(query).toHaveBeenCalledTimes(4);
  });

  test('does NOT trigger if scores are above threshold', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 3 }, { mood_score: 2 }, { mood_score: 4 }] });
    const result = await wellmind.checkImmediateRisk('u1', 'c1');
    expect(result).toBe(false);
  });

  test('does NOT trigger if fewer than 3 entries', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 1 }] });
    const result = await wellmind.checkImmediateRisk('u1', 'c1');
    expect(result).toBe(false);
  });

  test('does NOT trigger if referral already exists', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ mood_score: 1 }, { mood_score: 1 }, { mood_score: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-ref' }] }); // existing referral

    const result = await wellmind.checkImmediateRisk('u1', 'c1');
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERVENTION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

describe('intervention lifecycle', () => {
  test('acceptIntervention updates status', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'accepted' }] });
    const result = await wellmind.acceptIntervention('i1', 'u1');
    expect(result.status).toBe('accepted');
  });

  test('acceptIntervention throws if not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(wellmind.acceptIntervention('bad-id', 'u1')).rejects.toThrow('not found');
  });

  test('declineIntervention updates status with reason', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'declined' }] });
    const result = await wellmind.declineIntervention('i1', 'u1', 'Not relevant');
    expect(result.status).toBe('declined');
  });

  test('completeIntervention sets notes and rating', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'completed', effectiveness_rating: 4 }] });
    const result = await wellmind.completeIntervention('i1', 'u1', 'Very helpful', 4);
    expect(result.effectiveness_rating).toBe(4);
  });

  test('completeIntervention throws if already completed', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(wellmind.completeIntervention('done-id', 'u1')).rejects.toThrow('not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COACHING
// ═══════════════════════════════════════════════════════════════════════════

describe('coaching sessions', () => {
  test('scheduleCoachingSession creates session', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 's1', status: 'scheduled' }] });
    const result = await wellmind.scheduleCoachingSession('u1', 'c1', {
      coach_name: 'Dr. Kovács', session_date: '2026-04-01 10:00', duration_minutes: 45, session_type: 'stress_management'
    });
    expect(result.status).toBe('scheduled');
  });

  test('rateCoachingSession saves rating', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 's1', employee_rating: 5 }] });
    const result = await wellmind.rateCoachingSession('s1', 'u1', 5, 'Excellent!');
    expect(result.employee_rating).toBe(5);
  });

  test('rateCoachingSession throws if not completed', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(wellmind.rateCoachingSession('s1', 'u1', 5)).rejects.toThrow('not completed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM METRICS
// ═══════════════════════════════════════════════════════════════════════════

describe('team metrics', () => {
  test('getTeamMetrics returns data when >= 5 employees', async () => {
    query.mockResolvedValueOnce({
      rows: [{ metric_date: '2026-03-15', employee_count: 8, avg_mood_score: 3.8 }]
    });
    const result = await wellmind.getTeamMetrics('c1', '2026-03-01', '2026-03-31');
    expect(result).toHaveLength(1);
    expect(result[0].employee_count).toBe(8);
  });

  test('getTeamMetrics filters out teams < 5', async () => {
    // The SQL WHERE clause handles this — verify the query has the filter
    query.mockResolvedValueOnce({ rows: [] });
    const result = await wellmind.getTeamMetrics('c1', '2026-03-01', '2026-03-31');
    expect(result).toHaveLength(0);
    // Verify MIN_TEAM_SIZE was passed as parameter
    expect(query.mock.calls[0][1]).toContain(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

describe('getCompanyDashboard', () => {
  test('returns dashboard with all sections', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ active_users: 10, avg_mood: 3.7, avg_stress: 5.2 }] })
      .mockResolvedValueOnce({ rows: [{ risk_level: 'green', count: '7' }, { risk_level: 'yellow', count: '2' }, { risk_level: 'red', count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ metric_date: '2026-03-15' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'u1', turnover_risk_score: 78 }] });

    const result = await wellmind.getCompanyDashboard('c1');
    expect(result.overview.active_users).toBe(10);
    expect(result.risk_distribution).toEqual({ green: 7, yellow: 2, red: 1 });
    expect(result.top_risk_employees).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUBMIT ASSESSMENT (integration)
// ═══════════════════════════════════════════════════════════════════════════

describe('submitAssessment', () => {
  test('computes scores, saves, and generates interventions for yellow', async () => {
    // Mock: insert assessment
    query.mockResolvedValueOnce({
      rows: [{
        id: 'a1', burnout_score: 55, engagement_score: 45,
        risk_level: 'yellow', emotional_exhaustion_score: 60,
        depersonalization_score: 40, personal_accomplishment_score: 50
      }]
    });
    // Mock: generateInterventions queries (check existing + insert for each rule)
    // R03_moderate_burnout, R07_exercise may fire
    query.mockResolvedValue({ rows: [] }); // generic mock for remaining calls

    const responses = [
      { category: 'emotional_exhaustion', score: 7 },
      { category: 'emotional_exhaustion', score: 6 },
      { category: 'depersonalization', score: 5 },
      { category: 'personal_accomplishment', score: 5 },
      { category: 'vigor', score: 4 },
      { category: 'dedication', score: 5 },
      { category: 'absorption', score: 5 },
    ];

    const result = await wellmind.submitAssessment('u1', 'c1', responses);
    expect(result.risk_level).toBe('yellow');
    // Verify the INSERT query was called
    expect(query).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

describe('getCurrentQuarter', () => {
  test('returns current quarter string', () => {
    const q = wellmind.getCurrentQuarter();
    expect(q).toMatch(/^\d{4}-Q[1-4]$/);
  });
});

describe('constants', () => {
  test('MBI weights sum to 1.0', () => {
    const sum = wellmind.MBI_WEIGHTS.ee + wellmind.MBI_WEIGHTS.dp + wellmind.MBI_WEIGHTS.pa;
    expect(sum).toBe(1);
  });

  test('UWES weights sum to 1.0', () => {
    const sum = wellmind.UWES_WEIGHTS.vigor + wellmind.UWES_WEIGHTS.dedication + wellmind.UWES_WEIGHTS.absorption;
    expect(sum).toBe(1);
  });

  test('MIN_TEAM_SIZE is 5', () => {
    expect(wellmind.MIN_TEAM_SIZE).toBe(5);
  });

  test('7 intervention rules defined', () => {
    expect(wellmind.INTERVENTION_RULES.length).toBe(7);
  });
});
