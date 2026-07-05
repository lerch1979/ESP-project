/**
 * Room-hygiene house-rule fine (házirend) — OUR process, independent toggle.
 *
 * Rule: if a room's hygiene is rated FAILING on N consecutive COMPLETED
 * inspections (default N=2), a fine applies (default 10,000 Ft/resident, fine
 * type HOUSE_RULES). Config (enabled / N / fail threshold / amount) lives in
 * `hygiene_fine_config`, admin-editable, read FRESH each run — same pattern as
 * the expiry monitor. DEFAULT OFF.
 *
 * INDEPENDENT of the mothballed salary-deduction executor
 * (DEDUCTION_EXECUTION_ENABLED): this only creates the debt record via the
 * normal fine flow (`createFine` → a `compensations` row + `compensation_residents`
 * + the existing in-app resident notification). It NEVER writes
 * `compensation_payments` and NEVER schedules/executes a deduction. The fine is
 * then payable via the existing cash path or forwarded to the client. Any
 * "payment plan" stays information-only (consistent with the mothball decision).
 *
 * Idempotent: a fine is keyed to (latest inspection, room) — re-runs never
 * duplicate; a NEW failing inspection that completes another N-window is a new
 * (repeat) violation → a new fine.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const fineService = require('./fine.service');

const DEFAULTS = { enabled: false, consecutive_fails: 2, fail_hygiene_max: 15, fine_amount: 10000, fine_type_code: 'HOUSE_RULES' };

async function getConfig() {
  try {
    const r = await query(`SELECT * FROM hygiene_fine_config ORDER BY created_at ASC LIMIT 1`);
    return r.rows[0] || { ...DEFAULTS };
  } catch (e) {
    // table not yet migrated → behave as disabled (safe on a lagging deploy)
    logger.warn('[hygieneFine.getConfig] falling back to defaults (disabled):', e.message);
    return { ...DEFAULTS };
  }
}

async function updateConfig(patch = {}, userId = null) {
  const { enabled, consecutive_fails, fail_hygiene_max, fine_amount, fine_type_code } = patch;
  const r = await query(
    `UPDATE hygiene_fine_config SET
       enabled           = COALESCE($1, enabled),
       consecutive_fails = COALESCE($2, consecutive_fails),
       fail_hygiene_max  = COALESCE($3, fail_hygiene_max),
       fine_amount       = COALESCE($4, fine_amount),
       fine_type_code    = COALESCE($5, fine_type_code),
       updated_by = $6, updated_at = NOW()
     WHERE id = (SELECT id FROM hygiene_fine_config ORDER BY created_at ASC LIMIT 1)
     RETURNING *`,
    [enabled ?? null, consecutive_fails ?? null, fail_hygiene_max ?? null,
     fine_amount ?? null, fine_type_code ?? null, userId]
  );
  return r.rows[0];
}

// Build the createFine `residents` array from a room_inspection residents_snapshot
// (shape: [{ employee_id, user_id, name, email, ... }]); fall back to the room's
// current employees if the snapshot is missing/empty.
async function resolveResidents(roomId, snapshot) {
  const fromSnap = Array.isArray(snapshot) ? snapshot : [];
  const mapped = fromSnap
    .filter((r) => r && r.name && String(r.name).trim())
    .map((r) => ({ name: String(r.name).trim(), resident_id: r.user_id || null, email: r.email || null }));
  if (mapped.length > 0) return mapped;

  const rows = (await query(
    `SELECT e.user_id, e.first_name || ' ' || e.last_name AS name,
            COALESCE(NULLIF(e.personal_email,''), u.email) AS email
       FROM employees e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.room_id = $1 AND e.end_date IS NULL`, [roomId])).rows;
  return rows.filter((r) => r.name && r.name.trim())
    .map((r) => ({ name: r.name.trim(), resident_id: r.user_id || null, email: r.email || null }));
}

/**
 * Scan for rooms whose latest N COMPLETED inspections all failed hygiene, and
 * create one house-rule fine per such room (idempotent). Returns counts.
 */
async function runHygieneFines({ userId = null } = {}) {
  const cfg = await getConfig();
  if (!cfg.enabled) return { skipped: true, reason: 'disabled' };

  const N = Number(cfg.consecutive_fails) || 2;
  const threshold = Number(cfg.fail_hygiene_max);
  const ftRow = (await query(`SELECT id FROM fine_types WHERE code = $1 AND is_active = true LIMIT 1`, [cfg.fine_type_code])).rows[0];
  if (!ftRow) { logger.warn(`[hygieneFine] fine type ${cfg.fine_type_code} not found/active — skipping`); return { skipped: true, reason: 'fine_type_missing' }; }
  const fineTypeId = ftRow.id;

  // Rooms whose latest N completed inspections ALL have hygiene_score <= threshold.
  const candidates = (await query(
    `WITH ranked AS (
       SELECT ri.id AS room_inspection_id, ri.room_id, ri.hygiene_score, ri.residents_snapshot,
              i.id AS inspection_id, i.completed_at,
              ROW_NUMBER() OVER (PARTITION BY ri.room_id ORDER BY i.completed_at DESC, i.id DESC) AS rn
         FROM room_inspections ri
         JOIN inspections i ON i.id = ri.inspection_id
        WHERE i.status = 'completed' AND i.completed_at IS NOT NULL AND ri.hygiene_score IS NOT NULL
     ),
     windowed AS (SELECT * FROM ranked WHERE rn <= $1)
     SELECT room_id,
            COUNT(*) AS n,
            COUNT(*) FILTER (WHERE hygiene_score <= $2) AS n_fail,
            (ARRAY_AGG(inspection_id      ORDER BY rn))[1] AS latest_inspection_id,
            (ARRAY_AGG(room_inspection_id ORDER BY rn))[1] AS latest_room_inspection_id,
            (ARRAY_AGG(residents_snapshot ORDER BY rn))[1] AS latest_snapshot
       FROM windowed
      GROUP BY room_id
     HAVING COUNT(*) = $1 AND COUNT(*) FILTER (WHERE hygiene_score <= $2) = $1`,
    [N, threshold])).rows;

  const result = { created: 0, skipped_existing: 0, skipped_no_residents: 0, candidates: candidates.length, errors: 0 };

  for (const c of candidates) {
    try {
      // Idempotency: a house-rule fine already tied to (latest inspection, room)?
      const dup = (await query(
        `SELECT 1 FROM compensations
          WHERE type='fine' AND fine_type_id=$1 AND inspection_id=$2 AND room_id=$3 LIMIT 1`,
        [fineTypeId, c.latest_inspection_id, c.room_id])).rows[0];
      if (dup) { result.skipped_existing++; continue; }

      const residents = await resolveResidents(c.room_id, c.latest_snapshot);
      if (residents.length === 0) { result.skipped_no_residents++; continue; }

      await fineService.createFine(c.latest_inspection_id, fineTypeId, residents, {
        userId,
        roomInspectionId: c.latest_room_inspection_id,
        amountOverride: cfg.fine_amount,
        notes: `Automatikus házirend-bírság: ${N} egymást követő higiéniai bukás (hygiene_score ≤ ${threshold}).`,
      });
      result.created++;
    } catch (e) {
      logger.error(`[hygieneFine:${c.room_id}] ${e.message}`);
      result.errors++;
    }
  }
  logger.info(`[hygieneFine] ${JSON.stringify(result)}`);
  return { skipped: false, ...result };
}

module.exports = { getConfig, updateConfig, runHygieneFines, resolveResidents };
