/**
 * entityStatusHistory.service.js — best-effort status-transition recorder.
 *
 * Writes one row to `entity_status_history` (migration 123) every time a
 * ticket / employee / damage_report changes status, including the initial
 * status seeded at create time (from_status = NULL → to_status = initial).
 *
 * This data is the substrate the future "efficiency" agent needs (see the AI
 * agent roadmap in MASTER_TODO.md): how long entities sit in each status, who
 * moves them, where they stall. We start collecting now so the agent has
 * ≥4 weeks of history when it's built.
 *
 * ── Two hard rules ──────────────────────────────────────────────────────────
 *  1. NEVER THROWS. Every public function swallows its own errors (logs and
 *     returns). Recording history must never break — or roll back — the real
 *     business write it accompanies. Callers do not need try/catch.
 *
 *  2. NEVER runs on a caller's transaction client. We always use the shared
 *     pool (`query`), fired AFTER the caller's write has committed. Reason:
 *     in PostgreSQL a single failed statement aborts the WHOLE surrounding
 *     transaction, so running a (possibly-failing) insert on the caller's
 *     client could poison their commit — the opposite of "never affects
 *     existing flows". An independent pool query cannot do that. The only
 *     trade-off — a rare orphan history row if the caller later rolls back —
 *     is benign (the table is additive/append-only).
 */

const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// FK-backed status lookups, so we can resolve a human label + slug from a
// status_id. Damage reports use a raw VARCHAR status (no lookup table) and are
// recorded via recordStatusChange() directly with the value as its own label.
const STATUS_LOOKUPS = {
  ticket: { table: 'ticket_statuses', slugCol: 'slug', labelCol: 'name' },
  employee: { table: 'employee_status_types', slugCol: 'slug', labelCol: 'name' },
};

/**
 * Resolve { status, label } for a FK status id. Best-effort: returns nulls on
 * any miss/error so the caller can still record the transition.
 */
async function resolveStatus(entityType, statusId) {
  const cfg = STATUS_LOOKUPS[entityType];
  if (!cfg || statusId == null) return { status: null, label: null };
  try {
    const r = await query(
      `SELECT ${cfg.slugCol} AS slug, ${cfg.labelCol} AS label FROM ${cfg.table} WHERE id = $1`,
      [statusId]
    );
    return { status: r.rows[0]?.slug ?? null, label: r.rows[0]?.label ?? null };
  } catch (err) {
    logger.error('entityStatusHistory.resolveStatus failed (swallowed):', err.message);
    return { status: null, label: null };
  }
}

/**
 * Record a status transition with already-resolved values.
 * Use for damage reports (raw-string status) or any caller that already holds
 * the slug + label. Never throws.
 *
 * @param {object}  o
 * @param {string}  o.entityType  'ticket' | 'employee' | 'damage_report'
 * @param {string}  o.entityId    UUID of the row whose status changed
 * @param {?string} o.fromStatus  old slug/value, or null on initial seed
 * @param {?string} o.toStatus    new slug/value
 * @param {?string} o.fromLabel   old human label, or null on initial seed
 * @param {?string} o.toLabel     new human label
 * @param {?string} o.changedBy   acting user UUID, or null
 * @param {?string} o.source      'create' | 'update' | 'bulk'
 * @param {?object} o.metadata    extra context (stored as JSONB)
 */
async function recordStatusChange({
  entityType,
  entityId,
  fromStatus = null,
  toStatus = null,
  fromLabel = null,
  toLabel = null,
  changedBy = null,
  source = null,
  metadata = null,
} = {}) {
  try {
    if (!entityType || !entityId) return;

    // Skip no-op transitions (e.g. an "update" that didn't touch status). The
    // initial seed (source='create', fromStatus=null) is never a no-op.
    if (source !== 'create' && fromStatus === toStatus && fromLabel === toLabel) return;

    await query(
      `INSERT INTO entity_status_history
         (entity_type, entity_id, from_status, to_status, from_label, to_label,
          changed_by, source, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entityType,
        entityId,
        fromStatus,
        toStatus,
        fromLabel,
        toLabel,
        changedBy || null,
        source || null,
        metadata ? JSON.stringify(metadata) : '{}',
      ]
    );
  } catch (err) {
    logger.error('entityStatusHistory.recordStatusChange failed (swallowed):', err.message);
  }
}

/**
 * Convenience for FK-status entities (tickets, employees): pass the old/new
 * status_id and we resolve slug + label from the lookup table, then record.
 * Never throws.
 *
 * @param {object}  o
 * @param {string}  o.entityType   'ticket' | 'employee'
 * @param {string}  o.entityId     UUID of the row
 * @param {?string} o.fromStatusId old status_id, or null on initial seed
 * @param {?string} o.toStatusId   new status_id
 * @param {?string} o.changedBy    acting user UUID, or null
 * @param {?string} o.source       'create' | 'update' | 'bulk'
 * @param {?object} o.metadata     extra context
 */
async function recordStatusChangeById({
  entityType,
  entityId,
  fromStatusId = null,
  toStatusId = null,
  changedBy = null,
  source = null,
  metadata = null,
} = {}) {
  try {
    const [from, to] = await Promise.all([
      resolveStatus(entityType, fromStatusId),
      resolveStatus(entityType, toStatusId),
    ]);
    await recordStatusChange({
      entityType,
      entityId,
      fromStatus: from.status,
      toStatus: to.status,
      fromLabel: from.label,
      toLabel: to.label,
      changedBy,
      source,
      metadata,
    });
  } catch (err) {
    logger.error('entityStatusHistory.recordStatusChangeById failed (swallowed):', err.message);
  }
}

module.exports = { recordStatusChange, recordStatusChangeById, resolveStatus };
