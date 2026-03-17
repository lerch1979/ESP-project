const integration = require('../src/services/wellbeingIntegration.service');

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { query } = require('../src/database/connection');

// Helper: mock query to always resolve with a default unless specifically sequenced
beforeEach(() => jest.clearAllMocks());

// Convenience: make query return a generic success for chains of calls
function mockQueryChain(responses) {
  responses.forEach(r => query.mockResolvedValueOnce(r));
}

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

describe('createReferral', () => {
  test('creates referral with contractor_id provided', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'pending' }] });
    const result = await integration.createReferral({
      user_id: 'u1', contractor_id: 'c1', source_module: 'wellmind',
      target_module: 'carepath', referral_type: 'test', referral_reason: 'Test',
    });
    expect(result.status).toBe('pending');
    expect(query).toHaveBeenCalledTimes(1); // Direct insert, no user lookup
  });

  test('resolves contractor_id from user if not provided', async () => {
    mockQueryChain([
      { rows: [{ contractor_id: 'c1' }] },  // user lookup
      { rows: [{ id: 'r1' }] },             // insert
    ]);
    await integration.createReferral({
      user_id: 'u1', source_module: 'wellmind',
      target_module: 'carepath', referral_type: 'test', referral_reason: 'Test',
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  test('throws on missing required fields', async () => {
    await expect(integration.createReferral({})).rejects.toThrow('required');
  });
});

describe('referral lifecycle', () => {
  test('accept', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'accepted' }] });
    expect((await integration.acceptReferral('r1', 'u1')).status).toBe('accepted');
  });

  test('accept throws if not pending', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(integration.acceptReferral('r1', 'u1')).rejects.toThrow('not pending');
  });

  test('decline with reason', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'declined' }] });
    expect((await integration.declineReferral('r1', 'u1', 'No need')).status).toBe('declined');
  });

  test('complete', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'completed' }] });
    expect((await integration.completeReferral('r1', 'Done')).status).toBe('completed');
  });

  test('complete throws if already processed', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(integration.completeReferral('r1')).rejects.toThrow('already processed');
  });
});

describe('expireOldReferrals', () => {
  test('expires and returns count', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1' }, { id: 'r2' }] });
    expect(await integration.expireOldReferrals()).toBe(2);
  });

  test('returns 0 when nothing to expire', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await integration.expireOldReferrals()).toBe(0);
  });
});

describe('getPendingReferrals', () => {
  test('returns sorted by urgency', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1', urgency_level: 'crisis' }] });
    expect(await integration.getPendingReferrals('u1')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REFERRAL: WellMind Risk Triggers
// ═══════════════════════════════════════════════════════════════════════════

describe('checkWellMindRiskTriggers', () => {
  test('critical burnout (>80, red) → crisis referral', async () => {
    // 1: existing check, 2: createReferral insert, 3: createNotification insert
    query.mockResolvedValue({ rows: [{ id: 'x', status: 'pending', contractor_id: 'c1' }] });
    query.mockResolvedValueOnce({ rows: [] }); // no existing referral

    const result = await integration.checkWellMindRiskTriggers('u1', 'c1',
      { id: 'a1', burnout_score: 85, risk_level: 'red' });
    expect(result).not.toBeNull();
  });

  test('high burnout (71-80, red) → high referral', async () => {
    query.mockResolvedValue({ rows: [{ id: 'x', status: 'pending', contractor_id: 'c1' }] });
    query.mockResolvedValueOnce({ rows: [] }); // no existing

    const result = await integration.checkWellMindRiskTriggers('u1', 'c1',
      { id: 'a1', burnout_score: 75, risk_level: 'red' });
    expect(result).not.toBeNull();
  });

  test('moderate burnout (<70) → null', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // existing check
    const result = await integration.checkWellMindRiskTriggers('u1', 'c1',
      { id: 'a1', burnout_score: 55, risk_level: 'yellow' });
    expect(result).toBeNull();
  });

  test('skips if recent referral already exists', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    expect(await integration.checkWellMindRiskTriggers('u1', 'c1',
      { id: 'a1', burnout_score: 90, risk_level: 'red' })).toBeNull();
  });

  test('burnout=70 with yellow → null (need >70 AND red)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await integration.checkWellMindRiskTriggers('u1', 'c1',
      { id: 'a1', burnout_score: 70, risk_level: 'yellow' })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REFERRAL: Consecutive Low Pulse
// ═══════════════════════════════════════════════════════════════════════════

describe('checkConsecutiveLowPulse', () => {
  test('3 low scores → referral', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 1 }, { mood_score: 2 }, { mood_score: 1 }] });
    query.mockResolvedValueOnce({ rows: [] }); // no existing
    // Remaining calls: createReferral + createNotification (use mockResolvedValue for rest)
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });

    const result = await integration.checkConsecutiveLowPulse('u1', 'c1');
    expect(result).not.toBeNull();
  });

  test('not all low → null', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 3 }, { mood_score: 1 }, { mood_score: 4 }] });
    expect(await integration.checkConsecutiveLowPulse('u1', 'c1')).toBeNull();
  });

  test('<3 entries → null', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 1 }] });
    expect(await integration.checkConsecutiveLowPulse('u1', 'c1')).toBeNull();
  });

  test('existing referral → null', async () => {
    query.mockResolvedValueOnce({ rows: [{ mood_score: 1 }, { mood_score: 1 }, { mood_score: 1 }] });
    query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    expect(await integration.checkConsecutiveLowPulse('u1', 'c1')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REFERRAL: Chatbot Keywords
// ═══════════════════════════════════════════════════════════════════════════

describe('checkChatbotMentalHealthKeywords', () => {
  test('crisis keyword → crisis referral', async () => {
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    const result = await integration.checkChatbotMentalHealthKeywords('u1', 'c1', 'I want to kill myself');
    expect(result).not.toBeNull();
    expect(result.type).toBe('crisis');
  });

  test('HU crisis keyword → crisis', async () => {
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    const result = await integration.checkChatbotMentalHealthKeywords('u1', 'c1', 'Öngyilkos gondolataim vannak');
    expect(result.type).toBe('crisis');
  });

  test('mental health keyword → medium referral', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // no existing
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    const result = await integration.checkChatbotMentalHealthKeywords('u1', 'c1', 'Nagyon stresszes vagyok');
    expect(result).not.toBeNull();
    expect(result.type).toBe('mental_health');
  });

  test('normal message → null', async () => {
    expect(await integration.checkChatbotMentalHealthKeywords('u1', 'c1', 'Mi a mai menü?')).toBeNull();
  });

  test('null/empty → null', async () => {
    expect(await integration.checkChatbotMentalHealthKeywords('u1', 'c1', null)).toBeNull();
    expect(await integration.checkChatbotMentalHealthKeywords('u1', 'c1', '')).toBeNull();
  });

  test('existing mental health referral → null', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    expect(await integration.checkChatbotMentalHealthKeywords('u1', 'c1', 'Depresszióval küzdök')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REFERRAL: Manager Concern
// ═══════════════════════════════════════════════════════════════════════════

describe('handleManagerConcern', () => {
  test('creates referral and notifies employee', async () => {
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    const result = await integration.handleManagerConcern('mgr1', 'emp1', 'c1', {
      concern_type: 'general', description: 'Withdrawn',
    });
    expect(result).toBeDefined();
    expect(query).toHaveBeenCalled();
  });

  test('urgent concern sets high urgency', async () => {
    query.mockResolvedValue({ rows: [{ id: 'x', contractor_id: 'c1' }] });
    await integration.handleManagerConcern('mgr1', 'emp1', 'c1', {
      concern_type: 'urgent', description: 'Sudden change',
    });
    // Find the referral insert call
    const refCall = query.mock.calls.find(c =>
      c[0] && c[0].includes('wellbeing_referrals') && c[0].includes('INSERT')
    );
    expect(refCall).toBeDefined();
    expect(refCall[1]).toContain('high');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('createNotification', () => {
  test('creates notification', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'n1', status: 'pending' }] });
    const result = await integration.createNotification({
      user_id: 'u1', contractor_id: 'c1',
      notification_type: 'test', notification_channel: 'push',
      title: 'Test', message: 'Body',
    });
    expect(result.id).toBe('n1');
  });

  test('throws on missing fields', async () => {
    await expect(integration.createNotification({})).rejects.toThrow('required');
  });

  test('throws on invalid channel', async () => {
    await expect(integration.createNotification({
      user_id: 'u1', notification_type: 't', notification_channel: 'fax', title: 'T', message: 'M',
    })).rejects.toThrow('Invalid notification_channel');
  });
});

describe('markAsRead', () => {
  test('marks notification', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'n1' }] });
    expect((await integration.markAsRead('n1', 'u1')).id).toBe('n1');
  });

  test('throws if already read', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(integration.markAsRead('n1', 'u1')).rejects.toThrow('already read');
  });
});

describe('markAllAsRead', () => {
  test('returns count', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'n1' }, { id: 'n2' }] });
    expect(await integration.markAllAsRead('u1')).toBe(2);
  });
});

describe('getUnreadCount', () => {
  test('returns integer', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '7' }] });
    expect(await integration.getUnreadCount('u1')).toBe(7);
  });
});

describe('sendPendingNotifications', () => {
  test('processes pending queue', async () => {
    mockQueryChain([
      { rows: [
        { id: 'n1', notification_channel: 'in_app' },
        { id: 'n2', notification_channel: 'push' },
      ]},
      { rowCount: 1 },
      { rowCount: 1 },
    ]);
    expect(await integration.sendPendingNotifications()).toBe(2);
  });

  test('handles errors gracefully', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'n1', notification_channel: 'push' }] })
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ rowCount: 1 });
    expect(await integration.sendPendingNotifications()).toBe(0);
  });

  test('empty queue → 0', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await integration.sendPendingNotifications()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════

describe('audit logging', () => {
  test('logDataAccess creates entry', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });
    expect((await integration.logDataAccess('u1', 'u2', 'c1', 'view', 'assessment', 'id1', 'reason')).id).toBe('a1');
  });

  test('logAccessDenied sets access_granted false', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    await integration.logAccessDenied('u1', 'u2', 'c1', 'view', 'session', 's1', 'No permission');
    // Verify false is in the SQL (it's hardcoded in the query, not a param)
    expect(query.mock.calls[0][0]).toContain('false');
  });

  test('getAuditLog returns entries', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });
    expect(await integration.getAuditLog('c1', { action: 'view' })).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════

describe('feedback', () => {
  test('submitFeedback creates entry', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'f1', feedback_type: 'intervention', rating: 4 }] });
    const result = await integration.submitFeedback('u1', 'c1', {
      feedback_type: 'intervention', rating: 4, is_helpful: true, feedback_text: 'Great!',
    });
    expect(result.id).toBe('f1');
  });

  test('throws on missing type', async () => {
    await expect(integration.submitFeedback('u1', 'c1', {})).rejects.toThrow('feedback_type');
  });

  test('throws on invalid rating', async () => {
    await expect(integration.submitFeedback('u1', 'c1', {
      feedback_type: 'general', rating: 6,
    })).rejects.toThrow('Rating must be 1-5');
  });

  test('getFeedbackStats returns aggregated data', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '20', avg_rating: '4.2' }] });
    const result = await integration.getFeedbackStats('c1', 'intervention');
    expect(result.avg_rating).toBe('4.2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-MODULE AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

describe('getUserWellbeingProfile', () => {
  test('returns combined healthy profile', async () => {
    mockQueryChain([
      { rows: [{ avg_mood_30d: '4', avg_stress_30d: '3', pulse_count_30d: '20', latest_burnout: '25', latest_engagement: '75', risk_level: 'green', active_interventions: '1' }] },
      { rows: [{ active_cases: '0', sessions_90d: '2' }] },
      { rows: [{ pending: '0' }] },
    ]);
    const result = await integration.getUserWellbeingProfile('u1');
    expect(result.overall_health_score).toBeGreaterThan(60);
    expect(result.health_status).toBe('healthy');
  });

  test('returns at-risk profile', async () => {
    mockQueryChain([
      { rows: [{ avg_mood_30d: '1.5', avg_stress_30d: '9', pulse_count_30d: '5', latest_burnout: '80', latest_engagement: '20', risk_level: 'red', active_interventions: '3' }] },
      { rows: [{ active_cases: '2', sessions_90d: '5' }] },
      { rows: [{ pending: '2' }] },
    ]);
    const result = await integration.getUserWellbeingProfile('u1');
    expect(result.overall_health_score).toBeLessThan(50);
    expect(result.health_status).toBe('at_risk');
  });
});

describe('getCompanyWellbeingIndex', () => {
  test('returns index when >= 5 employees', async () => {
    mockQueryChain([
      { rows: [{ count: '10' }] },
      { rows: [{ mood_index: '72', stress_index: '65', active_users: '10' }] },
      { rows: [{ burnout_index: '70', engagement_index: '68' }] },
    ]);
    const result = await integration.getCompanyWellbeingIndex('c1');
    expect(result.wellbeing_index).toBeGreaterThan(0);
    expect(result.wellbeing_index).toBeLessThanOrEqual(100);
    expect(result.active_employees).toBe(10);
    expect(result.status).toBeDefined();
  });

  test('throws if < 5 employees', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    await expect(integration.getCompanyWellbeingIndex('c1')).rejects.toThrow('minimum 5 employees');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

describe('constants', () => {
  test('MENTAL_HEALTH_KEYWORDS covers HU and EN', () => {
    expect(integration.MENTAL_HEALTH_KEYWORDS).toContain('depressed');
    expect(integration.MENTAL_HEALTH_KEYWORDS).toContain('depresszió');
    expect(integration.MENTAL_HEALTH_KEYWORDS.length).toBeGreaterThanOrEqual(10);
  });

  test('CRISIS_KEYWORDS covers HU and EN', () => {
    expect(integration.CRISIS_KEYWORDS).toContain('suicide');
    expect(integration.CRISIS_KEYWORDS).toContain('öngyilkos');
    expect(integration.CRISIS_KEYWORDS.length).toBeGreaterThanOrEqual(6);
  });

  test('REFERRAL_STATUSES has 5 states', () => {
    expect(integration.REFERRAL_STATUSES).toHaveLength(5);
  });

  test('MIN_AGGREGATION_SIZE is 5', () => {
    expect(integration.MIN_AGGREGATION_SIZE).toBe(5);
  });
});
