/**
 * entity_status_history recorder — Integration Tests (migration 123)
 *
 * Verifies the never-throws status recorder: create-seed rows, update
 * transitions, no-op skipping, FK label resolution, and that bad input is
 * swallowed rather than thrown. Self-cleaning; skips gracefully if the DB or
 * the migration-123 table isn't present (same defensive pattern as the other
 * integration tests).
 */
const crypto = require('crypto');
const { query } = require('../../src/database/connection');
const statusHistory = require('../../src/services/entityStatusHistory.service');

const uuid = () => crypto.randomUUID();

describe('entity_status_history recorder', () => {
  let tableReady = false;
  const createdEntityIds = [];

  // small helper: wait briefly then read rows for an entity (recorder is
  // awaited in tests, but the public API is fire-and-forget elsewhere).
  const rowsFor = async (entityId) => {
    const r = await query(
      'SELECT * FROM entity_status_history WHERE entity_id = $1 ORDER BY changed_at ASC',
      [entityId]
    );
    return r.rows;
  };

  beforeAll(async () => {
    try {
      await query('SELECT 1 FROM entity_status_history LIMIT 1');
      tableReady = true;
    } catch {
      tableReady = false; // table/DB not available — tests below self-skip
    }
  });

  afterAll(async () => {
    if (!tableReady || createdEntityIds.length === 0) return;
    await query('DELETE FROM entity_status_history WHERE entity_id = ANY($1)', [createdEntityIds]);
  });

  it('never throws on missing/invalid input', async () => {
    // No DB write should be attempted; must resolve without throwing.
    await expect(statusHistory.recordStatusChange({})).resolves.toBeUndefined();
    await expect(statusHistory.recordStatusChange({ entityType: 'ticket' })).resolves.toBeUndefined();
    await expect(
      statusHistory.recordStatusChangeById({ entityType: 'ticket' })
    ).resolves.toBeUndefined();
  });

  it('records an initial create-seed row (from=null → to=initial)', async () => {
    if (!tableReady) return;
    const entityId = uuid();
    const changedBy = uuid();
    createdEntityIds.push(entityId);

    await statusHistory.recordStatusChange({
      entityType: 'damage_report',
      entityId,
      fromStatus: null,
      toStatus: 'draft',
      fromLabel: null,
      toLabel: 'draft',
      changedBy,
      source: 'create',
    });

    const rows = await rowsFor(entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0].from_status).toBeNull();
    expect(rows[0].to_status).toBe('draft');
    expect(rows[0].changed_by).toBe(changedBy);
    expect(rows[0].source).toBe('create');
  });

  it('records an update transition with correct from/to', async () => {
    if (!tableReady) return;
    const entityId = uuid();
    createdEntityIds.push(entityId);

    await statusHistory.recordStatusChange({
      entityType: 'damage_report', entityId,
      fromStatus: 'draft', toStatus: 'pending_review',
      fromLabel: 'draft', toLabel: 'pending_review',
      changedBy: uuid(), source: 'update',
    });

    const rows = await rowsFor(entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0].from_status).toBe('draft');
    expect(rows[0].to_status).toBe('pending_review');
  });

  it('skips no-op transitions (same from/to on update) but not create seeds', async () => {
    if (!tableReady) return;
    const entityId = uuid();
    createdEntityIds.push(entityId);

    // no-op update → no row
    await statusHistory.recordStatusChange({
      entityType: 'ticket', entityId,
      fromStatus: 'open', toStatus: 'open', fromLabel: 'Open', toLabel: 'Open',
      source: 'update',
    });
    expect(await rowsFor(entityId)).toHaveLength(0);

    // create seed with from===to is still recorded (initial state matters)
    await statusHistory.recordStatusChange({
      entityType: 'ticket', entityId,
      fromStatus: 'open', toStatus: 'open', fromLabel: 'Open', toLabel: 'Open',
      source: 'create',
    });
    expect(await rowsFor(entityId)).toHaveLength(1);
  });

  it('resolves slug + human label from the ticket_statuses lookup (recordStatusChangeById)', async () => {
    if (!tableReady) return;
    const status = await query('SELECT id, slug, name FROM ticket_statuses LIMIT 1');
    if (status.rows.length === 0) return; // statuses not seeded in this DB — skip
    const { id: statusId, slug, name } = status.rows[0];

    const entityId = uuid();
    createdEntityIds.push(entityId);

    await statusHistory.recordStatusChangeById({
      entityType: 'ticket',
      entityId,
      fromStatusId: null,
      toStatusId: statusId,
      changedBy: uuid(),
      source: 'create',
    });

    const rows = await rowsFor(entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0].to_status).toBe(slug);
    expect(rows[0].to_label).toBe(name);
    expect(rows[0].from_status).toBeNull();
  });
});
