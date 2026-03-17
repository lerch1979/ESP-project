const ctrl = require('../src/controllers/carepath.controller');

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../src/services/carepath.service');
jest.mock('../src/services/wellbeingIntegration.service');

const { query } = require('../src/database/connection');
const carepathService = require('../src/services/carepath.service');
const integrationService = require('../src/services/wellbeingIntegration.service');

const mockReq = (overrides = {}) => ({
  user: { id: 'u1', contractorId: 'c1', roles: ['employee'], permissions: [] },
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
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /categories', () => {
  test('returns categories', async () => {
    carepathService.getCategories.mockResolvedValue([{ id: 'c1', category_name: 'Counseling' }]);
    const res = mockRes();
    await ctrl.getCategories(mockReq(), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /cases', () => {
  test('creates case with matched providers', async () => {
    carepathService.createCase.mockResolvedValue({ id: 'case1', case_number: 'CP-2026-000001', status: 'open' });
    carepathService.matchProviders.mockResolvedValue([{ id: 'p1', full_name: 'Dr. A', match_score: 85 }]);
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.createCase(mockReq({
      body: { service_category_id: 'cat1', urgency_level: 'medium', issue_description: 'Stressed' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.case.case_number).toMatch(/^CP-/);
    expect(res.json.mock.calls[0][0].data.matched_providers).toHaveLength(1);
  });

  test('returns 400 on missing category', async () => {
    const res = mockRes();
    await ctrl.createCase(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('creates case even if provider matching fails', async () => {
    carepathService.createCase.mockResolvedValue({ id: 'case1', case_number: 'CP-2026-000002' });
    carepathService.matchProviders.mockRejectedValue(new Error('No providers'));
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.createCase(mockReq({
      body: { service_category_id: 'cat1', issue_description: 'Test' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.matched_providers).toEqual([]);
  });
});

describe('GET /my-cases', () => {
  test('returns cases with counts', async () => {
    carepathService.getCases.mockResolvedValue([
      { id: 'c1', status: 'open' },
      { id: 'c2', status: 'closed' },
    ]);
    const res = mockRes();
    await ctrl.getMyCases(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.active_count).toBe(1);
    expect(res.json.mock.calls[0][0].data.closed_count).toBe(1);
  });

  test('applies status filter', async () => {
    carepathService.getCases.mockResolvedValue([]);
    const res = mockRes();
    await ctrl.getMyCases(mockReq({ query: { status: 'open' } }), res);
    expect(carepathService.getCases).toHaveBeenCalledWith('u1', { status: 'open' });
  });
});

describe('GET /cases/:id', () => {
  test('returns case details and logs access', async () => {
    carepathService.getCaseDetails.mockResolvedValue({ id: 'c1', sessions: [], bookings: [] });
    integrationService.logDataAccess.mockResolvedValue({});
    const res = mockRes();
    await ctrl.getCaseDetails(mockReq({ params: { id: 'c1' } }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(integrationService.logDataAccess).toHaveBeenCalled();
  });

  test('returns 404 if not found', async () => {
    carepathService.getCaseDetails.mockRejectedValue(new Error('Case not found'));
    const res = mockRes();
    await ctrl.getCaseDetails(mockReq({ params: { id: 'bad' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('PUT /cases/:id/close', () => {
  test('closes case with rating and schedules followup', async () => {
    carepathService.closeCase.mockResolvedValue({ id: 'c1', status: 'closed' });
    integrationService.createNotification.mockResolvedValue({});

    const res = mockRes();
    await ctrl.closeCase(mockReq({
      params: { id: 'c1' }, body: { resolution_notes: 'Resolved', employee_satisfaction_rating: 5 }
    }), res);
    expect(res.json.mock.calls[0][0].data.followup_scheduled).toBe(true);
  });

  test('returns 400 on invalid rating', async () => {
    const res = mockRes();
    await ctrl.closeCase(mockReq({
      params: { id: 'c1' }, body: { employee_satisfaction_rating: 6 }
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 if already closed', async () => {
    carepathService.closeCase.mockRejectedValue(new Error('already closed'));
    const res = mockRes();
    await ctrl.closeCase(mockReq({ params: { id: 'c1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /providers/search', () => {
  test('geo search with lat/lng', async () => {
    carepathService.searchProvidersByLocation.mockResolvedValue([{ id: 'p1', distance_km: 2.5 }]);
    const res = mockRes();
    await ctrl.searchProviders(mockReq({ query: { lat: '47.5', lng: '19.0', radius: '10' } }), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
    expect(carepathService.searchProvidersByLocation).toHaveBeenCalledWith(47.5, 19.0, 10, expect.any(Object));
  });

  test('non-geo search with filters', async () => {
    carepathService.searchProviders.mockResolvedValue([{ id: 'p1' }]);
    const res = mockRes();
    await ctrl.searchProviders(mockReq({ query: { provider_type: 'counselor', city: 'Budapest' } }), res);
    expect(carepathService.searchProviders).toHaveBeenCalledWith(expect.objectContaining({ provider_type: 'counselor' }));
  });

  test('parses comma-separated specialties', async () => {
    carepathService.searchProviders.mockResolvedValue([]);
    const res = mockRes();
    await ctrl.searchProviders(mockReq({ query: { specialties: 'anxiety,depression' } }), res);
    expect(carepathService.searchProviders).toHaveBeenCalledWith(expect.objectContaining({
      specialties: ['anxiety', 'depression']
    }));
  });
});

describe('GET /providers/:id', () => {
  test('returns provider', async () => {
    carepathService.getProvider.mockResolvedValue({ id: 'p1', full_name: 'Dr. Test' });
    const res = mockRes();
    await ctrl.getProvider(mockReq({ params: { id: 'p1' } }), res);
    expect(res.json.mock.calls[0][0].data.full_name).toBe('Dr. Test');
  });

  test('returns 404 if not found', async () => {
    carepathService.getProvider.mockRejectedValue(new Error('Provider not found'));
    const res = mockRes();
    await ctrl.getProvider(mockReq({ params: { id: 'bad' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('GET /providers/:id/availability', () => {
  test('returns available slots', async () => {
    carepathService.getProviderAvailability.mockResolvedValue([
      { datetime: '2026-04-01T10:00:00', available: true }
    ]);
    const res = mockRes();
    await ctrl.getProviderAvailability(mockReq({ params: { id: 'p1' } }), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOOKINGS
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /bookings', () => {
  test('creates booking with notification', async () => {
    carepathService.createBooking.mockResolvedValue({ id: 'b1', status: 'scheduled' });
    integrationService.createNotification.mockResolvedValue({});

    const res = mockRes();
    await ctrl.createBooking(mockReq({
      body: { provider_id: 'p1', appointment_datetime: '2026-04-01T10:00:00', booking_type: 'video_call' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('returns 400 on missing fields', async () => {
    const res = mockRes();
    await ctrl.createBooking(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 409 on double booking', async () => {
    carepathService.createBooking.mockRejectedValue({ code: '23505' });
    const res = mockRes();
    await ctrl.createBooking(mockReq({
      body: { provider_id: 'p1', appointment_datetime: '2026-04-01T10:00:00' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('GET /my-bookings', () => {
  test('returns bookings with upcoming count', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    carepathService.getBookings.mockResolvedValue([
      { id: 'b1', status: 'scheduled', appointment_datetime: tomorrow },
      { id: 'b2', status: 'completed', appointment_datetime: '2026-01-01' },
    ]);
    const res = mockRes();
    await ctrl.getMyBookings(mockReq(), res);
    expect(res.json.mock.calls[0][0].data.upcoming_count).toBe(1);
  });
});

describe('PUT /bookings/:id/cancel', () => {
  test('cancels booking', async () => {
    carepathService.cancelBooking.mockResolvedValue({ id: 'b1', status: 'cancelled' });
    const res = mockRes();
    await ctrl.cancelBooking(mockReq({ params: { id: 'b1' }, body: { cancellation_reason: 'Conflict' } }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('returns 404 if not cancellable', async () => {
    carepathService.cancelBooking.mockRejectedValue(new Error('not cancellable'));
    const res = mockRes();
    await ctrl.cancelBooking(mockReq({ params: { id: 'b1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('PUT /bookings/:id/reschedule', () => {
  test('reschedules booking', async () => {
    carepathService.rescheduleBooking.mockResolvedValue({
      cancelled: { id: 'b1' }, new_booking: { id: 'b2' }
    });
    const res = mockRes();
    await ctrl.rescheduleBooking(mockReq({
      params: { id: 'b1' }, body: { new_appointment_datetime: '2026-04-05T14:00:00' }
    }), res);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('returns 400 on missing datetime', async () => {
    const res = mockRes();
    await ctrl.rescheduleBooking(mockReq({ params: { id: 'b1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 409 on double booking', async () => {
    carepathService.rescheduleBooking.mockRejectedValue({ code: '23505' });
    const res = mockRes();
    await ctrl.rescheduleBooking(mockReq({
      params: { id: 'b1' }, body: { new_appointment_datetime: '2026-04-01T10:00:00' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /provider/sessions', () => {
  test('creates session with encrypted notes', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'prov1' }] }); // provider lookup
    carepathService.createSession.mockResolvedValue({ id: 's1', session_number: 1 });
    integrationService.logDataAccess.mockResolvedValue({});

    const res = mockRes();
    await ctrl.createSession(mockReq({
      body: {
        case_id: 'c1', session_date: '2026-03-15', duration_minutes: 50,
        session_type: 'individual_counseling', session_notes: 'Confidential',
      }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.session_notes_encrypted).toBe(true);
  });

  test('returns 400 on missing fields', async () => {
    const res = mockRes();
    await ctrl.createSession(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 403 if not assigned provider', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // no provider match
    query.mockResolvedValueOnce({ rows: [{ assigned_provider_id: null }] }); // case has no provider

    const res = mockRes();
    await ctrl.createSession(mockReq({
      body: { case_id: 'c1', session_date: '2026-03-15', duration_minutes: 50, session_type: 'follow_up' }
    }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('GET /provider/cases', () => {
  test('returns assigned cases', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'prov1' }] }) // provider lookup
      .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'in_progress', is_anonymous: false }] });
    const res = mockRes();
    await ctrl.getProviderCases(mockReq(), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  });

  test('strips identity for anonymous cases', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'prov1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1', is_anonymous: true }] });
    const res = mockRes();
    await ctrl.getProviderCases(mockReq(), res);
    expect(res.json.mock.calls[0][0].data[0].user_name).toBe('Anonim');
  });

  test('returns 403 if no provider profile', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await ctrl.getProviderCases(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /admin/usage-stats', () => {
  test('returns stats and logs access', async () => {
    carepathService.getUsageStats.mockResolvedValue([{ stat_month: '2026-03-01' }]);
    integrationService.logDataAccess.mockResolvedValue({});
    const res = mockRes();
    await ctrl.getUsageStats(mockReq(), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(1);
    expect(integrationService.logDataAccess).toHaveBeenCalled();
  });
});

describe('GET /admin/providers', () => {
  test('returns all providers', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'p1' }, { id: 'p2' }] });
    const res = mockRes();
    await ctrl.getAdminProviders(mockReq(), res);
    expect(res.json.mock.calls[0][0].data).toHaveLength(2);
  });
});

describe('POST /admin/providers', () => {
  test('creates provider', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'p1', full_name: 'Dr. New' }] });
    const res = mockRes();
    await ctrl.createProvider(mockReq({
      body: { provider_type: 'counselor', full_name: 'Dr. New', email: 'new@test.hu',
              specialties: ['anxiety'], languages: ['hu'] }
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('returns 400 on missing required fields', async () => {
    const res = mockRes();
    await ctrl.createProvider(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('PUT /admin/providers/:id', () => {
  test('updates provider', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'p1', full_name: 'Updated' }] });
    const res = mockRes();
    await ctrl.updateProvider(mockReq({ params: { id: 'p1' }, body: { full_name: 'Updated' } }), res);
    expect(res.json.mock.calls[0][0].data.full_name).toBe('Updated');
  });

  test('returns 404 if not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await ctrl.updateProvider(mockReq({ params: { id: 'bad' }, body: { full_name: 'X' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 if no fields', async () => {
    const res = mockRes();
    await ctrl.updateProvider(mockReq({ params: { id: 'p1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('handles geo_location update', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'p1' }] });
    const res = mockRes();
    await ctrl.updateProvider(mockReq({
      params: { id: 'p1' }, body: { geo_location: { lat: 47.5, lng: 19.0 } }
    }), res);
    // Verify geo_lat and geo_lng in the query params
    const updateCall = query.mock.calls[0];
    expect(updateCall[1]).toContain(47.5);
    expect(updateCall[1]).toContain(19.0);
  });
});
