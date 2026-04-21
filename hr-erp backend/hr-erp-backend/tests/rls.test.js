/**
 * Row-Level Security (RLS) Tests
 * Tests the setDatabaseUser middleware and RLS integration.
 */

jest.mock('../src/database/connection', () => ({
  pool: {
    connect: jest.fn(),
  },
  query: jest.fn(),
}));

const db = require('../src/database/connection');
const { setDatabaseUser, setAuditUser } = require('../src/middleware/setDatabaseUser');

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// setDatabaseUser MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════

describe('setDatabaseUser', () => {
  const mockClient = () => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  });

  const mockRes = () => {
    const res = {};
    res.on = jest.fn().mockReturnValue(res);
    return res;
  };

  test('skips when no user', async () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await setDatabaseUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  test('sets session vars for authenticated user', async () => {
    const client = mockClient();
    db.pool.connect.mockResolvedValue(client);

    const req = {
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        contractorId: '22222222-2222-2222-2222-222222222222',
        roles: ['admin'],
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await setDatabaseUser(req, res, next);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('app.current_user_id')
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('app.current_contractor_id')
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('app.current_role')
    );
    expect(next).toHaveBeenCalled();
    expect(req.dbClient).toBe(client);
  });

  test('sets superadmin role correctly', async () => {
    const client = mockClient();
    db.pool.connect.mockResolvedValue(client);

    const req = {
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        contractorId: '22222222-2222-2222-2222-222222222222',
        roles: ['superadmin', 'admin'],
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await setDatabaseUser(req, res, next);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('superadmin')
    );
  });

  test('sets data_controller role when present', async () => {
    const client = mockClient();
    db.pool.connect.mockResolvedValue(client);

    const req = {
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        contractorId: '22222222-2222-2222-2222-222222222222',
        roles: ['data_controller', 'admin'],
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await setDatabaseUser(req, res, next);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('data_controller')
    );
  });

  test('handles missing contractorId', async () => {
    const client = mockClient();
    db.pool.connect.mockResolvedValue(client);

    const req = {
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        roles: ['user'],
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await setDatabaseUser(req, res, next);

    expect(next).toHaveBeenCalled();
    // Should set user_id and role but not contractor_id
    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls.some(c => c.includes('current_user_id'))).toBe(true);
    expect(calls.some(c => c.includes('current_contractor_id'))).toBe(false);
  });

  test('continues on database error', async () => {
    db.pool.connect.mockRejectedValue(new Error('Connection failed'));

    const req = {
      user: { id: 'user-1', roles: ['user'] },
    };
    const res = mockRes();
    const next = jest.fn();

    await setDatabaseUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('registers response cleanup handlers', async () => {
    const client = mockClient();
    db.pool.connect.mockResolvedValue(client);

    const res = mockRes();
    const req = {
      user: { id: 'u1', contractorId: 'c1', roles: ['user'] },
    };
    const next = jest.fn();

    await setDatabaseUser(req, res, next);

    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// setAuditUser MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════

describe('setAuditUser', () => {
  test('skips when no user', async () => {
    const req = {};
    const res = {};
    const next = jest.fn();

    await setAuditUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('sets audit user_id', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    db.pool.connect.mockResolvedValue(client);

    const req = { user: { id: '11111111-1111-1111-1111-111111111111' } };
    const res = {};
    const next = jest.fn();

    await setAuditUser(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('app.current_user_id')
    );
    expect(client.release).toHaveBeenCalled();
  });

  test('continues on error', async () => {
    db.pool.connect.mockRejectedValue(new Error('Connection failed'));

    const req = { user: { id: 'u1' } };
    const res = {};
    const next = jest.fn();

    await setAuditUser(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// RLS POLICY LOGIC
// ═══════════════════════════════════════════════════════════════════════

describe('RLS Policy Logic', () => {
  test('superadmin bypasses contractor isolation', async () => {
    const client = mockClient();
    db.pool.connect.mockResolvedValue(client);

    const req = {
      user: {
        id: '33333333-3333-3333-3333-333333333333',
        contractorId: '44444444-4444-4444-4444-444444444444',
        roles: ['superadmin'],
      },
    };
    const res = { on: jest.fn().mockReturnThis() };
    const next = jest.fn();

    await setDatabaseUser(req, res, next);

    const roleCalls = client.query.mock.calls.filter(c =>
      c[0].includes('current_role')
    );
    expect(roleCalls.length).toBe(1);
    expect(roleCalls[0][0]).toContain('superadmin');
  });

  test('regular user gets contractor-scoped role', async () => {
    const client = mockClient();
    db.pool.connect.mockResolvedValue(client);

    const req = {
      user: {
        id: '55555555-5555-5555-5555-555555555555',
        contractorId: '66666666-6666-6666-6666-666666666666',
        roles: ['user'],
      },
    };
    const res = { on: jest.fn().mockReturnThis() };
    const next = jest.fn();

    await setDatabaseUser(req, res, next);

    const contractorCalls = client.query.mock.calls.filter(c =>
      c[0].includes('current_contractor_id')
    );
    expect(contractorCalls.length).toBe(1);
    expect(contractorCalls[0][0]).toContain('66666666-6666-6666-6666-666666666666');
  });

  function mockClient() {
    return {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
  }
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('Module Exports', () => {
  test('exports setDatabaseUser and setAuditUser', () => {
    expect(typeof setDatabaseUser).toBe('function');
    expect(typeof setAuditUser).toBe('function');
  });
});
