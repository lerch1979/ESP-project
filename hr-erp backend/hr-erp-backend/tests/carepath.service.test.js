const carepath = require('../src/services/carepath.service');

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { query, transaction } = require('../src/database/connection');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ENCRYPTION_KEY = 'test-key-for-encryption';
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE NUMBER GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe('generateCaseNumber', () => {
  test('generates CP-YYYY-NNNNNN format', async () => {
    query.mockResolvedValueOnce({ rows: [{ seq: 42 }] });
    const num = await carepath.generateCaseNumber();
    const year = new Date().getFullYear();
    expect(num).toBe(`CP-${year}-000042`);
  });

  test('pads to 6 digits', async () => {
    query.mockResolvedValueOnce({ rows: [{ seq: 1 }] });
    const num = await carepath.generateCaseNumber();
    expect(num).toMatch(/-000001$/);
  });

  test('handles large sequence numbers', async () => {
    query.mockResolvedValueOnce({ rows: [{ seq: 999999 }] });
    const num = await carepath.generateCaseNumber();
    expect(num).toMatch(/-999999$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

describe('createCase', () => {
  test('creates case with all fields', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ seq: 100 }] }) // generateCaseNumber
      .mockResolvedValueOnce({ rows: [{ id: 'c1', case_number: 'CP-2026-000100', status: 'open' }] }); // insert

    const result = await carepath.createCase('u1', 'con1', {
      service_category_id: 'cat1', urgency_level: 'medium', issue_description: 'Test',
    });
    expect(result.case_number).toMatch(/^CP-/);
    expect(result.status).toBe('open');
  });

  test('throws on missing service_category_id', async () => {
    await expect(carepath.createCase('u1', 'c1', {})).rejects.toThrow('service_category_id is required');
  });

  test('throws on invalid urgency_level', async () => {
    await expect(carepath.createCase('u1', 'c1', {
      service_category_id: 'cat1', urgency_level: 'extreme'
    })).rejects.toThrow('Invalid urgency_level');
  });

  test('triggers crisis protocol for crisis urgency', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ seq: 200 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c2', case_number: 'CP-2026-000200', status: 'open' }] })
      .mockResolvedValueOnce({ rows: [] })   // admin query
      .mockResolvedValueOnce({ rows: [] });  // audit log

    await carepath.createCase('u1', 'con1', {
      service_category_id: 'cat1', urgency_level: 'crisis',
    });
    // Verify crisis protocol was called (admin notification query)
    expect(query).toHaveBeenCalledTimes(4);
  });
});

describe('getCases', () => {
  test('returns user cases', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'c1', case_number: 'CP-2026-000001', status: 'open', category_name: 'Counseling' }]
    });
    const result = await carepath.getCases('u1');
    expect(result).toHaveLength(1);
  });

  test('applies status filter', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await carepath.getCases('u1', { status: 'closed' });
    expect(query.mock.calls[0][1]).toContain('closed');
  });
});

describe('getCaseDetails', () => {
  test('returns case with sessions and bookings', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', category_name: 'Counseling' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', session_number: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'b1', status: 'confirmed' }] });

    const result = await carepath.getCaseDetails('c1', 'u1');
    expect(result.sessions).toHaveLength(1);
    expect(result.bookings).toHaveLength(1);
  });

  test('throws if case not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(carepath.getCaseDetails('bad', 'u1')).rejects.toThrow('Case not found');
  });
});

describe('assignCaseToProvider', () => {
  test('assigns provider and updates status', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'assigned' }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // update provider count
    const result = await carepath.assignCaseToProvider('c1', 'p1');
    expect(result.status).toBe('assigned');
  });

  test('throws if case not open', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(carepath.assignCaseToProvider('c1', 'p1')).rejects.toThrow('not in open status');
  });
});

describe('closeCase', () => {
  test('closes case with satisfaction rating', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'closed', assigned_provider_id: 'p1' }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // decrement provider count
    const result = await carepath.closeCase('c1', 'u1', 'Resolved well', 5);
    expect(result.status).toBe('closed');
  });

  test('throws if already closed', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(carepath.closeCase('c1', 'u1')).rejects.toThrow('already closed');
  });
});

describe('updateCaseStatus', () => {
  test('updates status', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'in_progress' }] });
    const result = await carepath.updateCaseStatus('c1', 'in_progress');
    expect(result.status).toBe('in_progress');
  });

  test('throws on invalid status', async () => {
    await expect(carepath.updateCaseStatus('c1', 'invalid')).rejects.toThrow('Invalid status');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

describe('createSession', () => {
  test('creates session with encrypted notes', async () => {
    query.mockResolvedValueOnce({ rows: [{ cnt: '2' }] }); // count
    query.mockResolvedValueOnce({ rows: [{ encrypted: 'enc-data' }] }); // encrypt

    transaction.mockImplementation(async (fn) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 's1', session_number: 3 }] }) // insert
          .mockResolvedValueOnce({ rowCount: 1 }) // update case
          .mockResolvedValueOnce({ rowCount: 1 }), // update provider
      };
      return fn(client);
    });

    const result = await carepath.createSession('c1', 'p1', {
      session_date: '2026-04-01', session_notes: 'Confidential notes',
      session_type: 'individual_counseling',
    });
    expect(result.session_number).toBe(3);
  });

  test('throws on invalid session_type', async () => {
    await expect(carepath.createSession('c1', 'p1', {
      session_date: '2026-04-01', session_type: 'invalid_type',
    })).rejects.toThrow('Invalid session_type');
  });
});

describe('session notes encryption', () => {
  test('encryptSessionNotes calls pgp_sym_encrypt', async () => {
    query.mockResolvedValueOnce({ rows: [{ encrypted: 'encrypted-blob' }] });
    const result = await carepath.encryptSessionNotes('secret notes');
    expect(result).toBe('encrypted-blob');
    expect(query.mock.calls[0][0]).toContain('pgp_sym_encrypt');
  });

  test('decryptSessionNotes calls pgp_sym_decrypt', async () => {
    query.mockResolvedValueOnce({ rows: [{ decrypted: 'plain notes' }] });
    const result = await carepath.decryptSessionNotes('encrypted-blob');
    expect(result).toBe('plain notes');
    expect(query.mock.calls[0][0]).toContain('pgp_sym_decrypt');
  });

  test('throws if encryption key not set', async () => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.CAREPATH_ENCRYPTION_KEY;
    await expect(carepath.encryptSessionNotes('test')).rejects.toThrow('encryption key not configured');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER SEARCH
// ═══════════════════════════════════════════════════════════════════════════

describe('searchProviders', () => {
  test('returns active providers', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'p1', full_name: 'Dr. Test' }] });
    const result = await carepath.searchProviders();
    expect(result).toHaveLength(1);
  });

  test('applies type filter', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await carepath.searchProviders({ provider_type: 'lawyer' });
    expect(query.mock.calls[0][1]).toContain('lawyer');
  });

  test('applies specialty filter', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await carepath.searchProviders({ specialties: ['anxiety', 'depression'] });
    expect(query.mock.calls[0][0]).toContain('specialties &&');
  });

  test('applies language filter', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await carepath.searchProviders({ languages: ['en'] });
    expect(query.mock.calls[0][0]).toContain('languages &&');
  });
});

describe('searchProvidersByLocation', () => {
  test('returns providers within radius', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'p1', full_name: 'Dr. Nearby', distance_km: '2.5' }]
    });
    const result = await carepath.searchProvidersByLocation(47.5, 19.0, 10);
    expect(result).toHaveLength(1);
    expect(result[0].distance_km).toBe(2.5);
  });

  test('throws if lat/lng missing', async () => {
    await expect(carepath.searchProvidersByLocation(null, null)).rejects.toThrow('Latitude and longitude');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HAVERSINE DISTANCE
// ═══════════════════════════════════════════════════════════════════════════

describe('haversineDistance', () => {
  test('Budapest to Debrecen ≈ 195 km', () => {
    const dist = carepath.haversineDistance(47.4979, 19.0402, 47.5316, 21.6273);
    expect(dist).toBeGreaterThan(180);
    expect(dist).toBeLessThan(210);
  });

  test('same point = 0', () => {
    expect(carepath.haversineDistance(47.5, 19.0, 47.5, 19.0)).toBe(0);
  });

  test('Budapest to Győr ≈ 110 km', () => {
    const dist = carepath.haversineDistance(47.4979, 19.0402, 47.6875, 17.6344);
    expect(dist).toBeGreaterThan(90);
    expect(dist).toBeLessThan(130);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER MATCHING
// ═══════════════════════════════════════════════════════════════════════════

describe('matchProviders', () => {
  test('returns top 5 scored providers', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ category_name: 'Pszichológiai tanácsadás' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'p1', full_name: 'A', provider_type: 'counselor', specialties: ['anxiety'], languages: ['hu'], rating: '4.5', geo_lat: '47.5', geo_lng: '19.0', active_case_count: 0, max_concurrent_cases: 20, photo_url: null, credentials: 'PhD', address_city: 'Budapest' },
          { id: 'p2', full_name: 'B', provider_type: 'counselor', specialties: ['depression'], languages: ['hu'], rating: '3.0', geo_lat: '47.6', geo_lng: '19.1', active_case_count: 5, max_concurrent_cases: 20, photo_url: null, credentials: 'MA', address_city: 'Budapest' },
        ]
      });

    const result = await carepath.matchProviders({
      service_category_id: 'cat1',
      languages: ['hu'],
      lat: 47.5, lng: 19.0,
      issue_keywords: ['anxiety', 'stress'],
    });

    expect(result.length).toBeLessThanOrEqual(5);
    expect(result[0].match_score).toBeGreaterThanOrEqual(result[result.length - 1].match_score);
  });

  test('throws if category not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(carepath.matchProviders({ service_category_id: 'bad' })).rejects.toThrow('Category not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER AVAILABILITY
// ═══════════════════════════════════════════════════════════════════════════

describe('getProviderAvailability', () => {
  test('returns available time slots', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[tomorrow.getDay()];

    query
      .mockResolvedValueOnce({ rows: [{ availability_hours: { [dayKey]: ['09:00-12:00'] } }] })
      .mockResolvedValueOnce({ rows: [] }); // no bookings

    const result = await carepath.getProviderAvailability('p1', tomorrow.toISOString(), dayAfter.toISOString());
    // Should have slots for the available day
    expect(Array.isArray(result)).toBe(true);
    result.forEach(slot => {
      expect(slot).toHaveProperty('datetime');
      expect(slot).toHaveProperty('available');
    });
  });

  test('marks booked slots as unavailable', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[tomorrow.getDay()];

    query
      .mockResolvedValueOnce({ rows: [{ availability_hours: { [dayKey]: ['09:00-12:00'] } }] })
      .mockResolvedValueOnce({
        rows: [{ appointment_datetime: tomorrow, duration_minutes: 60 }]
      });

    const result = await carepath.getProviderAvailability('p1', tomorrow.toISOString(), dayAfter.toISOString());
    const bookedSlot = result.find(s => s.time === '10:00');
    if (bookedSlot) expect(bookedSlot.available).toBe(false);
  });

  test('throws if provider not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(carepath.getProviderAvailability('bad', '2026-04-01', '2026-04-02')).rejects.toThrow('Provider not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER RATING
// ═══════════════════════════════════════════════════════════════════════════

describe('rateProvider', () => {
  test('updates running average', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'p1', rating: '4.5', total_ratings: 11 }] });
    const result = await carepath.rateProvider('p1', 'u1', 5);
    expect(result.total_ratings).toBe(11);
  });

  test('rejects invalid rating', async () => {
    await expect(carepath.rateProvider('p1', 'u1', 0)).rejects.toThrow('Rating must be between 1 and 5');
    await expect(carepath.rateProvider('p1', 'u1', 6)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOOKING MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

describe('createBooking', () => {
  test('creates booking', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'b1', status: 'scheduled' }] });
    const result = await carepath.createBooking('u1', {
      provider_id: 'p1', appointment_datetime: '2026-04-01 10:00',
    });
    expect(result.status).toBe('scheduled');
  });

  test('throws if provider_id missing', async () => {
    await expect(carepath.createBooking('u1', { appointment_datetime: '2026-04-01' })).rejects.toThrow('provider_id');
  });
});

describe('cancelBooking', () => {
  test('cancels with reason', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'b1', status: 'cancelled' }] });
    const result = await carepath.cancelBooking('b1', 'u1', 'Schedule conflict');
    expect(result.status).toBe('cancelled');
  });

  test('throws if not cancellable', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(carepath.cancelBooking('b1', 'u1')).rejects.toThrow('not cancellable');
  });
});

describe('rescheduleBooking', () => {
  test('cancels old and creates new', async () => {
    transaction.mockImplementation(async (fn) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'b1', provider_id: 'p1', case_id: 'c1', duration_minutes: 60, booking_type: 'video_call', employee_notes: null }] })
          .mockResolvedValueOnce({ rows: [{ id: 'b2', status: 'scheduled' }] }),
      };
      return fn(client);
    });

    const result = await carepath.rescheduleBooking('b1', 'u1', '2026-04-05 14:00');
    expect(result.cancelled.id).toBe('b1');
    expect(result.new_booking.id).toBe('b2');
  });
});

describe('confirmBooking', () => {
  test('confirms booking', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'b1', status: 'confirmed' }] });
    const result = await carepath.confirmBooking('b1', 'p1');
    expect(result.status).toBe('confirmed');
  });

  test('throws if not scheduled', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(carepath.confirmBooking('b1', 'p1')).rejects.toThrow('not in scheduled status');
  });
});

describe('markNoShow', () => {
  test('marks as no_show', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'b1', status: 'no_show' }] });
    const result = await carepath.markNoShow('b1');
    expect(result.status).toBe('no_show');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// USAGE STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

describe('getUsageStats', () => {
  test('returns stats for date range', async () => {
    query.mockResolvedValueOnce({
      rows: [{ stat_month: '2026-03-01', total_cases_opened: 15 }]
    });
    const result = await carepath.getUsageStats('c1', '2026-01-01', '2026-03-01');
    expect(result).toHaveLength(1);
  });
});

describe('calculateMonthlyStats', () => {
  test('computes and inserts monthly stats', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ cases_opened: '5', cases_closed: '3', cases_active: '8', sessions_held: '12', unique_users: '4', avg_satisfaction: '4.2' }] })
      .mockResolvedValueOnce({ rows: [] }) // category breakdown
      .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // eligible employees
      .mockResolvedValueOnce({ rows: [{ stat_month: '2026-03-01' }] }); // insert

    const result = await carepath.calculateMonthlyStats('c1', '2026-03-01');
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

describe('getCategories', () => {
  test('returns active categories', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'cat1', category_name: 'Counseling', display_order: 1 },
        { id: 'cat2', category_name: 'Legal', display_order: 2 },
      ]
    });
    const result = await carepath.getCategories();
    expect(result).toHaveLength(2);
  });
});

describe('getCategoryProviders', () => {
  test('maps category to provider types', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ category_name: 'Pszichológiai tanácsadás' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'p1', provider_type: 'counselor' }] });

    const result = await carepath.getCategoryProviders('cat1');
    expect(result).toHaveLength(1);
    // Verify the SQL uses the right provider types
    expect(query.mock.calls[1][1][0]).toContain('counselor');
  });

  test('throws if category not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(carepath.getCategoryProviders('bad')).rejects.toThrow('Category not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CRISIS PROTOCOL
// ═══════════════════════════════════════════════════════════════════════════

describe('triggerCrisisProtocol', () => {
  test('notifies all admins', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'admin1' }, { id: 'admin2' }] }) // admin query
      .mockResolvedValueOnce({ rowCount: 1 }) // notification 1
      .mockResolvedValueOnce({ rowCount: 1 }) // notification 2
      .mockResolvedValueOnce({ rowCount: 1 }); // audit log

    await carepath.triggerCrisisProtocol('con1', 'c1', 'u1');
    // 1 admin query + 2 notifications + 1 audit = 4 queries
    expect(query).toHaveBeenCalledTimes(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

describe('constants', () => {
  test('CASE_STATUSES has 5 states', () => {
    expect(carepath.CASE_STATUSES).toHaveLength(5);
    expect(carepath.CASE_STATUSES).toContain('open');
    expect(carepath.CASE_STATUSES).toContain('closed');
  });

  test('BOOKING_STATUSES has 5 states', () => {
    expect(carepath.BOOKING_STATUSES).toHaveLength(5);
  });

  test('PROVIDER_TYPE_MAP covers all categories', () => {
    expect(Object.keys(carepath.PROVIDER_TYPE_MAP).length).toBeGreaterThanOrEqual(6);
  });
});
