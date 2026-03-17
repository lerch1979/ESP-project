const ctrl = require('../src/controllers/wellbeingIntegration.controller');

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../src/services/wellbeingIntegration.service');
jest.mock('../src/services/carepath.service');

const { query } = require('../src/database/connection');
const integrationService = require('../src/services/wellbeingIntegration.service');
const carepathService = require('../src/services/carepath.service');

const mockReq = (overrides = {}) => ({
  user: { id: 'u1', contractorId: 'c1', roles: ['employee'] },
  params: {}, query: {}, body: {},
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
// POST /referrals
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /referrals', () => {
  test('creates referral and sends notification', async () => {
    integrationService.createReferral.mockResolvedValue({ id: 'r1', status: 'pending' });
    integrationService.createNotification.mockResolvedValue({});

    const res = mockRes();
    await ctrl.createReferral(mockReq({
      body: {
        source_module: 'wellmind', target_module: 'carepath',
        referral_type: 'self_referral', referral_reason: 'Need support',
      }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.status).toBe('pending');
  });

  test('returns 400 on missing fields', async () => {
    const res = mockRes();
    await ctrl.createReferral(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 on missing target_module', async () => {
    const res = mockRes();
    await ctrl.createReferral(mockReq({
      body: { source_module: 'wellmind', referral_type: 'test', referral_reason: 'test' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('creates referral even if notification fails', async () => {
    integrationService.createReferral.mockResolvedValue({ id: 'r1' });
    integrationService.createNotification.mockRejectedValue(new Error('push failed'));

    const res = mockRes();
    await ctrl.createReferral(mockReq({
      body: { source_module: 'wellmind', target_module: 'carepath', referral_type: 'test', referral_reason: 'test' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /my-referrals
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /my-referrals', () => {
  test('returns referrals with counts', async () => {
    integrationService.getReferrals.mockResolvedValue([
      { id: 'r1', status: 'pending' },
      { id: 'r2', status: 'expired' },
      { id: 'r3', status: 'accepted' },
    ]);

    const res = mockRes();
    await ctrl.getMyReferrals(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.pending_count).toBe(1);
    expect(res.json.mock.calls[0][0].data.expired_count).toBe(1);
    expect(res.json.mock.calls[0][0].data.referrals).toHaveLength(3);
  });

  test('applies status filter', async () => {
    integrationService.getReferrals.mockResolvedValue([]);
    const res = mockRes();
    await ctrl.getMyReferrals(mockReq({ query: { status: 'pending' } }), res);
    expect(integrationService.getReferrals).toHaveBeenCalledWith('u1', { status: 'pending' });
  });

  test('returns empty state', async () => {
    integrationService.getReferrals.mockResolvedValue([]);
    const res = mockRes();
    await ctrl.getMyReferrals(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.referrals).toHaveLength(0);
    expect(res.json.mock.calls[0][0].data.pending_count).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /referrals/:id/accept
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /referrals/:id/accept', () => {
  test('accepts CarePath referral → creates case', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'r1', user_id: 'u1', status: 'pending',
      target_module: 'carepath', urgency_level: 'high',
      referral_reason: 'High burnout', source_module: 'wellmind',
    }]});
    integrationService.acceptReferral.mockResolvedValue({ id: 'r1', status: 'accepted' });
    query.mockResolvedValueOnce({ rows: [{ id: 'cat1' }] }); // category
    carepathService.createCase.mockResolvedValue({ id: 'case1', case_number: 'CP-2026-000010' });
    query.mockResolvedValue({ rowCount: 1 }); // link + log
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.acceptReferral(mockReq({ params: { id: 'r1' } }), res);
    expect(res.json.mock.calls[0][0].data.action_taken.type).toBe('carepath_case_created');
    expect(res.json.mock.calls[0][0].data.action_taken.case_number).toBe('CP-2026-000010');
  });

  test('accepts WellMind referral → schedules assessment', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'r1', user_id: 'u1', status: 'pending',
      target_module: 'wellmind', urgency_level: 'medium',
      referral_reason: 'Manager concern', source_module: 'manager_alert',
    }]});
    integrationService.acceptReferral.mockResolvedValue({ id: 'r1', status: 'accepted' });
    integrationService.createNotification.mockResolvedValue({});
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.acceptReferral(mockReq({ params: { id: 'r1' } }), res);
    expect(res.json.mock.calls[0][0].data.action_taken.type).toBe('assessment_scheduled');
  });

  test('accepts coaching referral → notifies HR', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'r1', user_id: 'u1', status: 'pending',
      target_module: 'coaching', urgency_level: 'medium',
      referral_reason: 'Coaching recommended', source_module: 'wellmind',
    }]});
    integrationService.acceptReferral.mockResolvedValue({ id: 'r1', status: 'accepted' });
    integrationService.createNotification.mockResolvedValue({});
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.acceptReferral(mockReq({ params: { id: 'r1' } }), res);
    expect(res.json.mock.calls[0][0].data.action_taken.type).toBe('coaching_notification_sent');
  });

  test('returns 404 if referral not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await ctrl.acceptReferral(mockReq({ params: { id: 'bad' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 if already processed', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'r1', user_id: 'u1', status: 'accepted', target_module: 'carepath',
    }]});
    const res = mockRes();
    await ctrl.acceptReferral(mockReq({ params: { id: 'r1' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('handles CarePath case creation failure gracefully', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'r1', user_id: 'u1', status: 'pending',
      target_module: 'carepath', urgency_level: 'medium',
      referral_reason: 'Test', source_module: 'chatbot',
    }]});
    integrationService.acceptReferral.mockResolvedValue({ id: 'r1', status: 'accepted' });
    query.mockResolvedValueOnce({ rows: [{ id: 'cat1' }] });
    carepathService.createCase.mockRejectedValue(new Error('DB error'));
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.acceptReferral(mockReq({ params: { id: 'r1' } }), res);
    expect(res.json.mock.calls[0][0].data.action_taken.type).toBe('carepath_case_failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /referrals/:id/decline
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /referrals/:id/decline', () => {
  test('declines with reason and offers alternatives', async () => {
    integrationService.declineReferral.mockResolvedValue({ id: 'r1', status: 'declined' });
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.declineReferral(mockReq({
      params: { id: 'r1' },
      body: { decline_reason: 'Not needed right now' },
    }), res);
    expect(res.json.mock.calls[0][0].data.referral.status).toBe('declined');
    expect(res.json.mock.calls[0][0].data.alternative_support).toHaveLength(3);
  });

  test('returns 400 without decline_reason', async () => {
    const res = mockRes();
    await ctrl.declineReferral(mockReq({ params: { id: 'r1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 if not found', async () => {
    integrationService.declineReferral.mockRejectedValue(new Error('Referral not found'));
    const res = mockRes();
    await ctrl.declineReferral(mockReq({
      params: { id: 'bad' }, body: { decline_reason: 'No' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 if not pending', async () => {
    integrationService.declineReferral.mockRejectedValue(new Error('not pending'));
    const res = mockRes();
    await ctrl.declineReferral(mockReq({
      params: { id: 'r1' }, body: { decline_reason: 'No' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /notifications
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /notifications', () => {
  test('returns notifications with unread count', async () => {
    integrationService.getNotifications.mockResolvedValue([
      { id: 'n1', title: 'Test', status: 'delivered' },
    ]);
    integrationService.getUnreadCount.mockResolvedValue(5);

    const res = mockRes();
    await ctrl.getNotifications(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.notifications).toHaveLength(1);
    expect(res.json.mock.calls[0][0].data.unread_count).toBe(5);
    expect(res.json.mock.calls[0][0].data.total_count).toBe(1);
  });

  test('applies unread filter', async () => {
    integrationService.getNotifications.mockResolvedValue([]);
    integrationService.getUnreadCount.mockResolvedValue(0);

    const res = mockRes();
    await ctrl.getNotifications(mockReq({ query: { unread: 'true' } }), res);
    expect(integrationService.getNotifications).toHaveBeenCalledWith('u1', { unread: true });
  });

  test('applies limit', async () => {
    integrationService.getNotifications.mockResolvedValue([]);
    integrationService.getUnreadCount.mockResolvedValue(0);

    const res = mockRes();
    await ctrl.getNotifications(mockReq({ query: { limit: '5' } }), res);
    expect(integrationService.getNotifications).toHaveBeenCalledWith('u1', { limit: 5 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /notifications/:id/read
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /notifications/:id/read', () => {
  test('marks as read', async () => {
    integrationService.markAsRead.mockResolvedValue({ id: 'n1' });
    const res = mockRes();
    await ctrl.markNotificationRead(mockReq({ params: { id: 'n1' } }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('returns 404 if already read', async () => {
    integrationService.markAsRead.mockRejectedValue(new Error('already read'));
    const res = mockRes();
    await ctrl.markNotificationRead(mockReq({ params: { id: 'n1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /notifications/read-all
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /notifications/read-all', () => {
  test('marks all as read and returns count', async () => {
    integrationService.markAllAsRead.mockResolvedValue(7);
    const res = mockRes();
    await ctrl.markAllNotificationsRead(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.marked_count).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /feedback
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /feedback', () => {
  test('submits feedback', async () => {
    integrationService.submitFeedback.mockResolvedValue({ id: 'f1', rating: 4 });
    const res = mockRes();
    await ctrl.submitFeedback(mockReq({
      body: { feedback_type: 'intervention', rating: 4, feedback_text: 'Great!' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('returns 400 on missing type', async () => {
    const res = mockRes();
    await ctrl.submitFeedback(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 on invalid rating', async () => {
    const res = mockRes();
    await ctrl.submitFeedback(mockReq({ body: { feedback_type: 'general', rating: 6 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
