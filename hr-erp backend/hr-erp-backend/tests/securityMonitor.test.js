/**
 * Security Monitor Service Tests
 */

jest.mock('../src/database/connection', () => ({
  query: jest.fn(),
}));

const db = require('../src/database/connection');
const {
  EVENT_TYPES,
  SEVERITY,
  logEvent,
  logFailedLogin,
  logSuccessfulLogin,
  logAccountLocked,
  logPiiAccess,
  getSecuritySummary,
  getCriticalEvents,
  getSuspiciousIPs,
} = require('../src/services/securityMonitor.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

describe('Constants', () => {
  test('EVENT_TYPES has all required types', () => {
    expect(EVENT_TYPES.LOGIN_FAILED).toBe('login_failed');
    expect(EVENT_TYPES.LOGIN_SUCCESS).toBe('login_success');
    expect(EVENT_TYPES.ACCOUNT_LOCKED).toBe('account_locked');
    expect(EVENT_TYPES.PASSWORD_CHANGED).toBe('password_changed');
    expect(EVENT_TYPES.PII_ACCESSED).toBe('pii_accessed');
    expect(EVENT_TYPES.SUSPICIOUS_ACTIVITY).toBe('suspicious_activity');
    expect(EVENT_TYPES.RATE_LIMIT_HIT).toBe('rate_limit_hit');
  });

  test('SEVERITY has all levels', () => {
    expect(SEVERITY.INFO).toBe('info');
    expect(SEVERITY.WARNING).toBe('warning');
    expect(SEVERITY.CRITICAL).toBe('critical');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EVENT LOGGING
// ═══════════════════════════════════════════════════════════════════════

describe('logEvent', () => {
  test('inserts event into security_events', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await logEvent('login_failed', 'warning', { userId: 'u1', ip: '1.2.3.4' });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO security_events'),
      expect.any(Array)
    );
  });

  test('does not throw on DB error', async () => {
    db.query.mockRejectedValue(new Error('DB down'));
    await expect(logEvent('test', 'info', {})).resolves.not.toThrow();
  });
});

describe('logFailedLogin', () => {
  test('logs failed login and checks for brute force', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // INSERT event
      .mockResolvedValueOnce({ rows: [{ cnt: '2' }] }); // brute force check

    await logFailedLogin('test@test.com', '1.2.3.4', 'Mozilla', 'wrong_password');
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('logs suspicious activity on 5+ failures from same IP', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // INSERT first event
      .mockResolvedValueOnce({ rows: [{ cnt: '6' }] }) // brute force check
      .mockResolvedValueOnce({ rows: [] }); // INSERT suspicious event

    await logFailedLogin('test@test.com', '1.2.3.4', 'Mozilla', 'wrong_password');
    expect(db.query).toHaveBeenCalledTimes(3);
  });
});

describe('logSuccessfulLogin', () => {
  test('logs successful login', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await logSuccessfulLogin('user-1', '1.2.3.4', 'Chrome');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO security_events'),
      expect.arrayContaining(['login_success', 'info'])
    );
  });
});

describe('logAccountLocked', () => {
  test('logs account lockout with critical severity', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await logAccountLocked('user-1', '1.2.3.4', 10);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO security_events'),
      expect.arrayContaining(['account_locked', 'critical'])
    );
  });
});

describe('logPiiAccess', () => {
  test('logs PII access', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await logPiiAccess('user-1', 'emp-1', ['ssn', 'bank_account'], '1.2.3.4');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO security_events'),
      expect.arrayContaining(['pii_accessed', 'info'])
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('getSecuritySummary', () => {
  test('returns summary data', async () => {
    db.query.mockResolvedValue({
      rows: [
        { event_type: 'login_failed', severity: 'warning', count: 15, unique_ips: 3, unique_users: 5 },
        { event_type: 'login_success', severity: 'info', count: 100, unique_ips: 20, unique_users: 30 },
      ],
    });
    const result = await getSecuritySummary(7);
    expect(result).toHaveLength(2);
    expect(result[0].event_type).toBe('login_failed');
  });

  test('returns empty array on error', async () => {
    db.query.mockRejectedValue(new Error('DB error'));
    const result = await getSecuritySummary();
    expect(result).toEqual([]);
  });
});

describe('getCriticalEvents', () => {
  test('returns critical events', async () => {
    db.query.mockResolvedValue({
      rows: [{ id: '1', event_type: 'account_locked', severity: 'critical' }],
    });
    const result = await getCriticalEvents(10);
    expect(result).toHaveLength(1);
  });

  test('returns empty array on error', async () => {
    db.query.mockRejectedValue(new Error('DB error'));
    const result = await getCriticalEvents();
    expect(result).toEqual([]);
  });
});

describe('getSuspiciousIPs', () => {
  test('returns suspicious IPs', async () => {
    db.query.mockResolvedValue({
      rows: [{ ip_address: '1.2.3.4', attempts: 10 }],
    });
    const result = await getSuspiciousIPs();
    expect(result).toHaveLength(1);
    expect(result[0].ip_address).toBe('1.2.3.4');
  });

  test('returns empty array on error', async () => {
    db.query.mockRejectedValue(new Error('DB error'));
    const result = await getSuspiciousIPs();
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('Module Exports', () => {
  test('exports all expected functions', () => {
    expect(typeof logEvent).toBe('function');
    expect(typeof logFailedLogin).toBe('function');
    expect(typeof logSuccessfulLogin).toBe('function');
    expect(typeof logAccountLocked).toBe('function');
    expect(typeof logPiiAccess).toBe('function');
    expect(typeof getSecuritySummary).toBe('function');
    expect(typeof getCriticalEvents).toBe('function');
    expect(typeof getSuspiciousIPs).toBe('function');
  });
});
