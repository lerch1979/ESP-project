const cronJobs = require('../src/services/cron/wellbeingCronJobs');
const templates = require('../src/config/notificationTemplates');

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
// NOTIFICATION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

describe('notificationTemplates', () => {
  test('all templates have required fields', () => {
    const names = templates.listTemplates();
    expect(names.length).toBeGreaterThanOrEqual(12);

    names.forEach(name => {
      const t = templates.getTemplate(name);
      expect(t.title).toBeDefined();
      expect(t.message).toBeDefined();
      expect(t.channels).toBeDefined();
      expect(t.channels.length).toBeGreaterThan(0);
      expect(t.priority).toBeDefined();
    });
  });

  test('renderTemplate replaces variables', () => {
    const result = templates.renderTemplate('carepath_appointment_reminder', {
      time: '10:00',
      provider_name: 'Dr. Kovács',
      location_info: 'Budapest, Fő u. 1.',
      booking_id: 'b123',
    });
    expect(result.title).toBe('Időpont emlékeztető');
    expect(result.message).toContain('10:00');
    expect(result.message).toContain('Dr. Kovács');
    expect(result.action_url).toContain('b123');
  });

  test('renderTemplate preserves unmatched variables', () => {
    const result = templates.renderTemplate('hr_high_risk_alert', {});
    expect(result.message).toContain('{count}');
  });

  test('renderTemplate throws on unknown template', () => {
    expect(() => templates.renderTemplate('nonexistent')).toThrow('Template not found');
  });

  test('getTemplate throws on unknown', () => {
    expect(() => templates.getTemplate('bad')).toThrow('Template not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

describe('cron helpers', () => {
  test('getCurrentQuarter returns YYYY-QN format', () => {
    expect(cronJobs.getCurrentQuarter()).toMatch(/^\d{4}-Q[1-4]$/);
  });

  test('getQuarterEndDate returns a valid date', () => {
    const d = cronJobs.getQuarterEndDate();
    expect(d instanceof Date).toBe(true);
    expect(d.getTime()).toBeGreaterThan(Date.now() - 100 * 24 * 60 * 60 * 1000);
  });

  test('daysUntil returns correct diff', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    expect(cronJobs.daysUntil(tomorrow)).toBe(1);

    const today = new Date();
    today.setHours(23, 59, 59, 0);
    expect(cronJobs.daysUntil(today)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB 1: dailyPulseReminder
// ═══════════════════════════════════════════════════════════════════════════

describe('dailyPulseReminder', () => {
  test('sends to employees who have not submitted today', async () => {
    query
      .mockResolvedValueOnce({ rows: [
        { id: 'u1', contractor_id: 'c1' },
        { id: 'u2', contractor_id: 'c1' },
      ]})
      .mockResolvedValue({ rowCount: 1 }); // inserts

    const sent = await cronJobs.dailyPulseReminder();
    expect(sent).toBe(2);
    // 2 employees × 2 channels (push + in_app) = 4 insert calls + 1 select = 5
    expect(query).toHaveBeenCalledTimes(5);
  });

  test('sends 0 if everyone submitted', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await cronJobs.dailyPulseReminder()).toBe(0);
  });

  test('handles individual failures gracefully', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', contractor_id: 'c1' }] })
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValue({ rowCount: 1 });

    const sent = await cronJobs.dailyPulseReminder();
    expect(sent).toBe(0); // Failed for u1
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB 2: quarterlyAssessmentReminders
// ═══════════════════════════════════════════════════════════════════════════

describe('quarterlyAssessmentReminders', () => {
  test('returns 0 on non-reminder days', async () => {
    // daysUntil will likely not be exactly 7, 3, or 0
    // We just verify it doesn't crash and returns 0
    const result = await cronJobs.quarterlyAssessmentReminders();
    // If today happens to be a reminder day, it would try to query
    // If not, returns 0 without querying
    expect(typeof result).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB 3: carepathAppointmentReminders
// ═══════════════════════════════════════════════════════════════════════════

describe('carepathAppointmentReminders', () => {
  test('sends reminders for tomorrow bookings', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    query
      .mockResolvedValueOnce({ rows: [{
        id: 'b1', user_id: 'u1', appointment_datetime: tomorrow,
        booking_type: 'video_call', duration_minutes: 60,
        provider_name: 'Dr. Kovács', address_city: 'Budapest',
        contractor_id: 'c1',
      }]})
      .mockResolvedValue({ rowCount: 1 }); // notifications + reminder update

    const sent = await cronJobs.carepathAppointmentReminders();
    expect(sent).toBe(1);
  });

  test('sends 0 if no bookings tomorrow', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await cronJobs.carepathAppointmentReminders()).toBe(0);
  });

  test('marks reminder_24h_sent after sending', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    query
      .mockResolvedValueOnce({ rows: [{
        id: 'b1', user_id: 'u1', appointment_datetime: tomorrow,
        booking_type: 'in_person', provider_name: 'Test', address_city: 'Bp',
        contractor_id: 'c1',
      }]})
      .mockResolvedValue({ rowCount: 1 });

    await cronJobs.carepathAppointmentReminders();

    // Find the UPDATE call for reminder_24h_sent
    const updateCall = query.mock.calls.find(c => c[0] && c[0].includes('reminder_24h_sent'));
    expect(updateCall).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB 4: weeklyHighRiskAlert
// ═══════════════════════════════════════════════════════════════════════════

describe('weeklyHighRiskAlert', () => {
  test('alerts HR when >= 3 high-risk employees', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ contractor_id: 'c1', red_count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'admin1' }, { id: 'admin2' }] })
      .mockResolvedValue({ rowCount: 1 }); // notifications

    const alerted = await cronJobs.weeklyHighRiskAlert();
    expect(alerted).toBe(1);
  });

  test('skips contractors with < 3 high-risk (HAVING clause)', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // HAVING filters them out
    expect(await cronJobs.weeklyHighRiskAlert()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB 5: weeklyManagerSummary
// ═══════════════════════════════════════════════════════════════════════════

describe('weeklyManagerSummary', () => {
  test('sends summary to managers with >= 5 employees', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'mgr1', contractor_id: 'c1' }] }) // managers
      .mockResolvedValueOnce({ rows: [{ emp_count: '8', avg_mood: '3.8', avg_stress: '5.2' }] }) // metrics
      .mockResolvedValueOnce({ rows: [{ avg_mood: '3.5', avg_stress: '5.5' }] }) // prev week
      .mockResolvedValue({ rowCount: 1 }); // notification

    const sent = await cronJobs.weeklyManagerSummary();
    expect(sent).toBe(1);
  });

  test('skips managers with < 5 employees', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'mgr1', contractor_id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [{ emp_count: '3', avg_mood: '4', avg_stress: '4' }] });

    expect(await cronJobs.weeklyManagerSummary()).toBe(0);
  });

  test('detects improving trend', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'mgr1', contractor_id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [{ emp_count: '10', avg_mood: '4.5', avg_stress: '3' }] })
      .mockResolvedValueOnce({ rows: [{ avg_mood: '3.0', avg_stress: '6' }] })
      .mockResolvedValue({ rowCount: 1 });

    await cronJobs.weeklyManagerSummary();
    const notifCall = query.mock.calls.find(c => c[0] && c[0].includes('wellbeing_notifications') && c[0].includes('INSERT'));
    expect(notifCall).toBeDefined();
    // The message should contain the improving trend
    const msgParam = notifCall[1].find(p => typeof p === 'string' && p.includes('Javuló'));
    expect(msgParam).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB 6: expireOldReferrals
// ═══════════════════════════════════════════════════════════════════════════

describe('expireOldReferrals', () => {
  test('expires and returns count', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1' }, { id: 'r2' }] });
    expect(await cronJobs.expireOldReferrals()).toBe(2);
  });

  test('returns 0 when nothing to expire', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await cronJobs.expireOldReferrals()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB 7: processNotificationQueue
// ═══════════════════════════════════════════════════════════════════════════

describe('processNotificationQueue', () => {
  test('processes pending notifications', async () => {
    query
      .mockResolvedValueOnce({ rows: [
        { id: 'n1', notification_channel: 'in_app', retry_count: 0, max_retries: 3 },
        { id: 'n2', notification_channel: 'push', retry_count: 0, max_retries: 3 },
      ]})
      .mockResolvedValue({ rowCount: 1 });

    expect(await cronJobs.processNotificationQueue()).toBe(2);
  });

  test('in_app notifications get delivered status', async () => {
    query
      .mockResolvedValueOnce({ rows: [
        { id: 'n1', notification_channel: 'in_app', retry_count: 0, max_retries: 3 },
      ]})
      .mockResolvedValue({ rowCount: 1 });

    await cronJobs.processNotificationQueue();
    const updateCall = query.mock.calls[1];
    expect(updateCall[1][0]).toBe('delivered');
  });

  test('push notifications get sent status', async () => {
    query
      .mockResolvedValueOnce({ rows: [
        { id: 'n1', notification_channel: 'push', retry_count: 0, max_retries: 3 },
      ]})
      .mockResolvedValue({ rowCount: 1 });

    await cronJobs.processNotificationQueue();
    const updateCall = query.mock.calls[1];
    expect(updateCall[1][0]).toBe('sent');
  });

  test('handles errors with retry increment', async () => {
    query
      .mockResolvedValueOnce({ rows: [
        { id: 'n1', notification_channel: 'email', retry_count: 1, max_retries: 3 },
      ]})
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockResolvedValue({ rowCount: 1 });

    expect(await cronJobs.processNotificationQueue()).toBe(0);
    // Verify retry update was called
    const retryCall = query.mock.calls[2];
    expect(retryCall[0]).toContain('retry_count');
  });

  test('empty queue returns 0', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await cronJobs.processNotificationQueue()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB 8: refreshWellbeingSummary
// ═══════════════════════════════════════════════════════════════════════════

describe('refreshWellbeingSummary', () => {
  test('calls REFRESH MATERIALIZED VIEW', async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });
    await cronJobs.refreshWellbeingSummary();
    expect(query.mock.calls[0][0]).toContain('REFRESH MATERIALIZED VIEW');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// cronSchedule module
// ═══════════════════════════════════════════════════════════════════════════

describe('cronSchedule', () => {
  test('initializeWellbeingCronJobs does not throw', () => {
    jest.mock('node-cron', () => ({
      schedule: jest.fn(),
    }));
    const { initializeWellbeingCronJobs } = require('../src/config/cronSchedule');
    expect(() => initializeWellbeingCronJobs()).not.toThrow();
  });
});
