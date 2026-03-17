const ctrl = require('../src/controllers/wellmind.controller');

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../src/services/wellmind.service');
jest.mock('../src/services/wellbeingIntegration.service');

const { query } = require('../src/database/connection');
const wellmindService = require('../src/services/wellmind.service');
const integrationService = require('../src/services/wellbeingIntegration.service');

const mockReq = (overrides = {}) => ({
  user: { id: 'u1', contractorId: 'c1', roles: ['employee'], permissions: [] },
  params: {},
  query: {},
  body: {},
  ...overrides,
});
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
// PULSE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /pulse', () => {
  test('submits pulse and returns 201', async () => {
    wellmindService.submitPulse.mockResolvedValue({ id: 'p1', mood_score: 4 });
    const req = mockReq({ body: { mood_score: 4, stress_level: 5, sleep_quality: 7, workload_level: 6 } });
    const res = mockRes();
    await ctrl.submitPulse(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('returns 400 on invalid mood_score', async () => {
    wellmindService.submitPulse.mockRejectedValue(new Error('mood_score must be between 1 and 5'));
    const req = mockReq({ body: { mood_score: 99 } });
    const res = mockRes();
    await ctrl.submitPulse(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 500 on server error', async () => {
    wellmindService.submitPulse.mockRejectedValue(new Error('DB down'));
    const req = mockReq({ body: { mood_score: 3 } });
    const res = mockRes();
    await ctrl.submitPulse(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('GET /pulse/history', () => {
  test('returns history with trend and anomaly', async () => {
    wellmindService.getPulseHistory.mockResolvedValue([{ mood_score: 4 }]);
    wellmindService.calculatePulseTrend.mockResolvedValue([{ moving_avg: 3.8 }]);
    wellmindService.detectPulseAnomaly.mockResolvedValue({ anomaly: false });

    const req = mockReq({ query: { days: '14' } });
    const res = mockRes();
    await ctrl.getPulseHistory(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ pulses: expect.any(Array), trend: expect.any(Array) })
    }));
  });

  test('caps days at 90', async () => {
    wellmindService.getPulseHistory.mockResolvedValue([]);
    wellmindService.calculatePulseTrend.mockResolvedValue([]);
    wellmindService.detectPulseAnomaly.mockResolvedValue({ anomaly: false });

    const req = mockReq({ query: { days: '365' } });
    const res = mockRes();
    await ctrl.getPulseHistory(req, res);
    expect(wellmindService.getPulseHistory).toHaveBeenCalledWith('u1', 90);
  });
});

describe('GET /pulse/today', () => {
  test('returns today status with questions', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'p1', mood_score: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'q1', question_text: 'Mood?' }] });

    const req = mockReq();
    const res = mockRes();
    await ctrl.getTodayPulse(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ submitted: true, questions: expect.any(Array) })
    }));
  });

  test('returns submitted: false when no pulse today', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = mockReq();
    const res = mockRes();
    await ctrl.getTodayPulse(req, res);
    expect(res.json.mock.calls[0][0].data.submitted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSESSMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /assessment', () => {
  test('submits assessment with scores and interventions', async () => {
    wellmindService.submitAssessment.mockResolvedValue({
      id: 'a1', burnout_score: 55, risk_level: 'yellow',
    });
    integrationService.checkWellMindRiskTriggers.mockResolvedValue(null);
    wellmindService.getRecommendedInterventions.mockResolvedValue([{ id: 'i1' }]);

    const req = mockReq({ body: { responses: [{ category: 'emotional_exhaustion', score: 6 }] } });
    const res = mockRes();
    await ctrl.submitAssessment(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.assessment.burnout_score).toBe(55);
  });

  test('triggers CarePath referral for red risk', async () => {
    wellmindService.submitAssessment.mockResolvedValue({
      id: 'a1', burnout_score: 85, risk_level: 'red',
    });
    integrationService.checkWellMindRiskTriggers.mockResolvedValue({ id: 'ref1' });
    wellmindService.getRecommendedInterventions.mockResolvedValue([]);

    const req = mockReq({ body: { responses: [{ category: 'emotional_exhaustion', score: 9 }] } });
    const res = mockRes();
    await ctrl.submitAssessment(req, res);
    expect(res.json.mock.calls[0][0].data.referral_created).toBe(true);
  });

  test('returns 400 on empty responses', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await ctrl.submitAssessment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 409 on duplicate quarter', async () => {
    wellmindService.submitAssessment.mockRejectedValue({ code: '23505' });
    const req = mockReq({ body: { responses: [{ category: 'vigor', score: 5 }] } });
    const res = mockRes();
    await ctrl.submitAssessment(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('GET /assessment/history', () => {
  test('returns history', async () => {
    wellmindService.getAssessmentHistory.mockResolvedValue([{ quarter: '2026-Q1' }]);
    const res = mockRes();
    await ctrl.getAssessmentHistory(mockReq(), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /my-dashboard', () => {
  test('returns combined dashboard', async () => {
    integrationService.getUserWellbeingProfile.mockResolvedValue({ overall_health_score: 72, health_status: 'healthy', wellmind: {} });
    wellmindService.getLatestAssessment.mockResolvedValue({ burnout_score: 30 });
    wellmindService.getRecommendedInterventions.mockResolvedValue([]);
    wellmindService.getCoachingSessions.mockResolvedValue([]);
    integrationService.getPendingReferrals.mockResolvedValue([]);
    integrationService.getUnreadCount.mockResolvedValue(3);
    query.mockResolvedValueOnce({ rows: [] });

    const res = mockRes();
    await ctrl.getMyDashboard(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.health_score).toBe(72);
    expect(res.json.mock.calls[0][0].data.unread_notifications).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERVENTIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /interventions', () => {
  test('returns active interventions', async () => {
    wellmindService.getRecommendedInterventions.mockResolvedValue([{ id: 'i1', status: 'recommended' }]);
    const res = mockRes();
    await ctrl.getInterventions(mockReq(), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });

  test('filters by status', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'completed' }] });
    const res = mockRes();
    await ctrl.getInterventions(mockReq({ query: { status: 'completed' } }), res);
    expect(res.json.mock.calls[0][0].data[0].status).toBe('completed');
  });
});

describe('POST /interventions/:id/accept', () => {
  test('accepts intervention', async () => {
    wellmindService.acceptIntervention.mockResolvedValue({ id: 'i1', status: 'accepted' });
    const res = mockRes();
    await ctrl.acceptIntervention(mockReq({ params: { id: 'i1' } }), res);
    expect(res.json.mock.calls[0][0].data.status).toBe('accepted');
  });

  test('returns 404 if not found', async () => {
    wellmindService.acceptIntervention.mockRejectedValue(new Error('not found'));
    const res = mockRes();
    await ctrl.acceptIntervention(mockReq({ params: { id: 'bad' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /interventions/:id/complete', () => {
  test('completes with notes', async () => {
    wellmindService.completeIntervention.mockResolvedValue({ id: 'i1', status: 'completed' });
    const res = mockRes();
    await ctrl.completeIntervention(mockReq({ params: { id: 'i1' }, body: { completion_notes: 'Done' } }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });
});

describe('POST /interventions/:id/skip', () => {
  test('declines with reason', async () => {
    wellmindService.declineIntervention.mockResolvedValue({ id: 'i1', status: 'declined' });
    const res = mockRes();
    await ctrl.skipIntervention(mockReq({ params: { id: 'i1' }, body: { decline_reason: 'Not relevant' } }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COACHING
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /coaching-sessions', () => {
  test('returns sessions without coach_notes', async () => {
    wellmindService.getCoachingSessions.mockResolvedValue([
      { id: 's1', coach_notes: 'secret', employee_rating: 4 }
    ]);
    const res = mockRes();
    await ctrl.getCoachingSessions(mockReq(), res);
    const data = res.json.mock.calls[0][0].data;
    expect(data[0]).not.toHaveProperty('coach_notes');
    expect(data[0].employee_rating).toBe(4);
  });
});

describe('POST /coaching-sessions/:id/feedback', () => {
  test('rates session', async () => {
    wellmindService.rateCoachingSession.mockResolvedValue({ id: 's1', employee_rating: 5 });
    const res = mockRes();
    await ctrl.rateCoachingSession(mockReq({ params: { id: 's1' }, body: { rating: 5, feedback: 'Great' } }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('returns 400 for invalid rating', async () => {
    const res = mockRes();
    await ctrl.rateCoachingSession(mockReq({ params: { id: 's1' }, body: { rating: 0 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM METRICS
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /team/:teamId/metrics', () => {
  test('returns metrics and logs access', async () => {
    wellmindService.getTeamMetrics.mockResolvedValue([{ metric_date: '2026-03-15' }]);
    integrationService.logDataAccess.mockResolvedValue({ id: 'a1' });
    const res = mockRes();
    await ctrl.getTeamMetrics(mockReq({ params: { teamId: 'team1' } }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(integrationService.logDataAccess).toHaveBeenCalled();
  });

  test('returns 403 if < 5 employees', async () => {
    wellmindService.getTeamMetrics.mockRejectedValue(new Error('Insufficient data for privacy-compliant aggregation. Minimum 5 employees required.'));
    const res = mockRes();
    await ctrl.getTeamMetrics(mockReq({ params: { teamId: 'team1' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /admin/dashboard', () => {
  test('returns dashboard with wellbeing index', async () => {
    wellmindService.getCompanyDashboard.mockResolvedValue({
      overview: { active_users: 10 }, risk_distribution: { green: 7, yellow: 2, red: 1 }
    });
    integrationService.getCompanyWellbeingIndex.mockResolvedValue({ wellbeing_index: 72 });
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.getAdminDashboard(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.wellbeing_index.wellbeing_index).toBe(72);
  });
});

describe('GET /admin/risk-employees', () => {
  test('returns risk employees and logs access', async () => {
    wellmindService.getRiskEmployees.mockResolvedValue([{ user_id: 'u1', turnover_risk_score: 80 }]);
    integrationService.logDataAccess.mockResolvedValue({});
    const res = mockRes();
    await ctrl.getRiskEmployees(mockReq({ query: { risk_level: 'red' } }), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });
});

describe('GET /admin/trends', () => {
  test('returns pulse and risk trends', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ week: '2026-03-10', avg_mood: 3.8 }] })
      .mockResolvedValueOnce({ rows: [{ quarter: '2026-Q1', risk_level: 'green', count: '5' }] });
    const res = mockRes();
    await ctrl.getTrends(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.pulse_trends).toHaveLength(1);
  });
});

describe('POST /admin/questions', () => {
  test('creates question', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'q1', question_text: 'New Q' }] });
    const res = mockRes();
    await ctrl.createQuestion(mockReq({
      body: { question_type: 'pulse', question_text: 'New Q', response_type: 'emoji_5', category: 'mood' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('returns 400 on missing fields', async () => {
    const res = mockRes();
    await ctrl.createQuestion(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('PUT /admin/questions/:id', () => {
  test('updates question', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'q1', question_text: 'Updated' }] });
    const res = mockRes();
    await ctrl.updateQuestion(mockReq({ params: { id: 'q1' }, body: { question_text: 'Updated' } }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('returns 404 if not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await ctrl.updateQuestion(mockReq({ params: { id: 'bad' }, body: { question_text: 'X' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 if no fields to update', async () => {
    const res = mockRes();
    await ctrl.updateQuestion(mockReq({ params: { id: 'q1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('DELETE /admin/questions/:id', () => {
  test('hard deletes unused question', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ in_use: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'q1' }] });
    const res = mockRes();
    await ctrl.deleteQuestion(mockReq({ params: { id: 'q1' } }), res);
    expect(res.json.mock.calls[0][0].message).toContain('törölve');
  });

  test('soft deletes in-use question', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ in_use: true }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = mockRes();
    await ctrl.deleteQuestion(mockReq({ params: { id: 'q1' } }), res);
    expect(res.json.mock.calls[0][0].message).toContain('deaktiválva');
  });
});

describe('GET /admin/questions', () => {
  test('returns all questions', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'q1' }, { id: 'q2' }] });
    const res = mockRes();
    await ctrl.getQuestions(mockReq(), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(2);
  });

  test('filters by type', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'q1', question_type: 'pulse' }] });
    const res = mockRes();
    await ctrl.getQuestions(mockReq({ query: { question_type: 'pulse' } }), res);
    expect(query.mock.calls[0][1]).toContain('pulse');
  });
});

describe('POST /admin/bulk-intervention', () => {
  test('creates interventions for target employees', async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }, { user_id: 'u2' }] });
    query.mockResolvedValue({ rowCount: 1 });
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.bulkIntervention(mockReq({
      body: { intervention_type: 'coaching', title: 'Company program', description: 'For all', target_risk_level: 'yellow' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.created_count).toBe(2);
  });

  test('returns 400 on missing fields', async () => {
    const res = mockRes();
    await ctrl.bulkIntervention(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
