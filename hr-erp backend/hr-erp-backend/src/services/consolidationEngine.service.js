/**
 * Room Consolidation Suggestion Engine v1.
 *
 * Proposes moving ACTIVE employees between rooms WITHIN their accommodation to
 * free up whole rooms (bed-utilization billing). The engine NEVER moves anyone —
 * it writes proposals to agent_suggestions (mig 123 scaffolding) for human
 * approval; approve applies the room_id change (+ entity_status_history), reject
 * archives with a reason.
 *
 * HARD constraints — a suggestion may NEVER violate these (validated on every
 * emitted assignment; an accommodation that can't be solved cleanly is skipped):
 *   • no mixed-gender rooms
 *   • shift compatibility — SAME SHIFT ONLY (configurable identity matrix): every
 *     cross-shift pairing is incompatible. An EMPTY/unknown shift is incompatible
 *     with everyone (incl. other empties) → those employees are NEVER auto-placed;
 *     they are pinned in place and flagged for data entry (see `flagged` in the run).
 *   • bed capacity per room
 *   • v1 moves stay within the same accommodation
 *
 * Prioritization weights + the shift matrix live in consolidation_config, read
 * FRESH each run (expiry-monitor pattern). Defaults work without tuning.
 */
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const statusHistory = require('./entityStatusHistory.service');

const AGENT = 'room_consolidation';
const KNOWN_SHIFTS = ['delelott', 'delutan', 'ejszaka', 'valtott'];
// The stored shift slug if it's a known shift, else null ("unknown"). A null slug
// has NO matrix key, so `compatible()` returns false for it against every shift —
// including another unknown — i.e. an empty shift is incompatible with everyone.
const shiftBucket = (s) => (KNOWN_SHIFTS.includes(s) ? s : null);

async function getConfig() {
  const r = await query(`SELECT * FROM consolidation_config ORDER BY created_at ASC LIMIT 1`);
  return r.rows[0] || {
    is_enabled: true, weight_freed_rooms: 10, weight_min_moves: 3, weight_underutilized: 5,
    // SAME SHIFT ONLY (identity) — mirrors mig 132 / mig 137 default.
    shift_compatibility: {
      delelott: { delelott: true, delutan: false, ejszaka: false, valtott: false },
      delutan: { delelott: false, delutan: true, ejszaka: false, valtott: false },
      ejszaka: { delelott: false, delutan: false, ejszaka: true, valtott: false },
      valtott: { delelott: false, delutan: false, ejszaka: false, valtott: true },
    },
  };
}

// Do two shift buckets share a room? (matrix, symmetric by construction)
const compatible = (a, b, matrix) => !!(matrix?.[a]?.[b]);

// A set of employees may share a room iff same gender AND pairwise shift-compatible.
function groupValid(members, matrix) {
  if (members.length === 0) return true;
  const g = members[0].gender;
  if (members.some((m) => m.gender !== g)) return false;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (!compatible(shiftBucket(members[i].shift), shiftBucket(members[j].shift), matrix)) return false;
    }
  }
  return true;
}

/**
 * Consolidate ONE accommodation. Returns { valid, moves, freedRooms, freedBeds,
 * utilizationBefore } or { valid:false } if it can't be solved cleanly (then the
 * caller skips it — never emits an unsafe suggestion).
 */
function consolidateAccommodation(rooms, employees, matrix) {
  if (employees.length === 0) return { valid: false, flaggedUnknownShift: [] };
  const bedsOf = new Map(rooms.map((r) => [r.id, r.beds]));

  // EMPTY/unknown-shift employees are NEVER auto-placed. They pin to their current
  // room, that room is LOCKED (neither a move source nor a target), and they are
  // flagged for data entry. Anyone sharing a locked room is pinned too — we won't
  // co-locate a known-shift resident with an unknown one, and we can't safely move
  // the unknown. Consolidation runs ONLY over known-shift residents in free rooms.
  const flagged = employees.filter((e) => shiftBucket(e.shift) === null);
  const lockedRoomIds = new Set(flagged.map((e) => e.room_id).filter(Boolean));
  const movable = employees.filter(
    (e) => shiftBucket(e.shift) !== null && !lockedRoomIds.has(e.room_id)
  );
  const availableRooms = rooms.filter((r) => !lockedRoomIds.has(r.id));

  // Cohorts: (gender × shift). SAME SHIFT ONLY — each cohort is one gender + one
  // shift and gets its own room(s). There is NO "compatible with anything" bucket,
  // so two different shifts can never be greedily merged into a room.
  const byKey = new Map();
  for (const e of movable) {
    const key = `${e.gender}|${shiftBucket(e.shift)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }
  const cohorts = [...byKey.values()];

  // Greedy: largest cohort → largest rooms. Fewest rooms per cohort → frees the rest.
  cohorts.sort((a, b) => b.length - a.length);
  const roomsSorted = [...availableRooms].sort((a, b) => b.beds - a.beds);
  let ri = 0;
  const assignment = new Map(); // employeeId -> roomId
  for (const cohort of cohorts) {
    const need = cohort.length;
    const allocated = [];
    let cap = 0;
    while (cap < need && ri < roomsSorted.length) { allocated.push(roomsSorted[ri]); cap += roomsSorted[ri].beds; ri++; }
    if (cap < need) return { valid: false, flaggedUnknownShift: flagged.map((e) => e.id) }; // couldn't fit — skip

    // Assign members to the cohort's rooms, KEEPING people in place where possible.
    const fill = new Map(allocated.map((r) => [r.id, 0]));
    const cohortRoomIds = new Set(allocated.map((r) => r.id));
    const unplaced = [];
    for (const m of cohort) {
      if (cohortRoomIds.has(m.room_id) && fill.get(m.room_id) < bedsOf.get(m.room_id)) {
        assignment.set(m.id, m.room_id); fill.set(m.room_id, fill.get(m.room_id) + 1);
      } else unplaced.push(m);
    }
    for (const m of unplaced) {
      const r = allocated.find((rr) => fill.get(rr.id) < bedsOf.get(rr.id));
      assignment.set(m.id, r.id); fill.set(r.id, fill.get(r.id) + 1);
    }
  }

  // Pinned residents (unknown-shift + their locked-room roommates) keep their room.
  for (const e of employees) if (!assignment.has(e.id)) assignment.set(e.id, e.room_id);

  // Validate the FULL result — hard-constraint guarantee before we emit anything.
  const byRoom = new Map();
  for (const e of employees) {
    const rid = assignment.get(e.id);
    if (!byRoom.has(rid)) byRoom.set(rid, []);
    byRoom.get(rid).push(e);
  }
  for (const [rid, members] of byRoom) {
    if (members.length > bedsOf.get(rid)) return { valid: false, flaggedUnknownShift: flagged.map((e) => e.id) }; // capacity
    if (lockedRoomIds.has(rid)) {
      // Pinned room — never touched. Only guarantee we didn't create mixed-gender.
      if (members.some((m) => m.gender !== members[0].gender)) return { valid: false, flaggedUnknownShift: flagged.map((e) => e.id) };
      continue;
    }
    if (!groupValid(members, matrix)) return { valid: false, flaggedUnknownShift: flagged.map((e) => e.id) }; // gender + same-shift
  }

  const prevOccupied = new Set(employees.map((e) => e.room_id).filter(Boolean));
  const usedRooms = new Set(byRoom.keys());
  const freed = [...prevOccupied].filter((rid) => !usedRooms.has(rid));
  const freedBeds = freed.reduce((s, rid) => s + (bedsOf.get(rid) || 0), 0);

  const moves = employees
    .filter((e) => assignment.get(e.id) !== e.room_id)
    .map((e) => ({ employee_id: e.id, from_room_id: e.room_id, to_room_id: assignment.get(e.id) }));

  const totalBeds = rooms.reduce((s, r) => s + r.beds, 0);
  const utilizationBefore = totalBeds ? employees.length / totalBeds : 0;

  return { valid: true, moves, freedRooms: freed, freedBeds, utilizationBefore,
           flaggedUnknownShift: flagged.map((e) => e.id) };
}

/**
 * Run the engine: generate a consolidation_runs row + one agent_suggestions
 * row per proposed move. Read-only w.r.t. employees — nobody is moved.
 */
async function generateRun(triggeredBy = null) {
  const cfg = await getConfig();
  if (cfg.is_enabled === false) return { skipped: true, reason: 'disabled' };
  const matrix = cfg.shift_compatibility;

  // Active employees WITH a room, + their room's beds + accommodation.
  const emp = await query(`
    SELECT e.id, e.gender, e.shift_schedule AS shift, e.room_id, e.accommodation_id,
           a.name AS accommodation_name
      FROM employees e
      JOIN employee_status_types est ON est.id = e.status_id AND est.slug = 'active'
      JOIN accommodations a ON a.id = e.accommodation_id
     WHERE e.end_date IS NULL AND e.room_id IS NOT NULL`);
  const rooms = await query(`SELECT id, accommodation_id, room_number, beds FROM accommodation_rooms WHERE is_active = TRUE`);

  const roomsByAcc = new Map();
  for (const r of rooms.rows) {
    if (!roomsByAcc.has(r.accommodation_id)) roomsByAcc.set(r.accommodation_id, []);
    roomsByAcc.get(r.accommodation_id).push(r);
  }
  const empByAcc = new Map();
  for (const e of emp.rows) {
    if (!empByAcc.has(e.accommodation_id)) empByAcc.set(e.accommodation_id, []);
    empByAcc.get(e.accommodation_id).push(e);
  }
  const roomNumber = new Map(rooms.rows.map((r) => [r.id, r.room_number]));

  const perAcc = [];
  const allMoves = [];
  const flaggedUnknownShift = []; // employees with an EMPTY shift — never moved, need data entry
  for (const [accId, emps] of empByAcc) {
    // Flag empty-shift employees regardless of whether this accommodation yields a
    // proposal — they must be surfaced for data entry, not silently skipped.
    for (const e of emps.filter((x) => shiftBucket(x.shift) === null)) {
      flaggedUnknownShift.push({ employee_id: e.id, accommodation_id: accId, accommodation_name: emps[0].accommodation_name });
    }
    const accRooms = roomsByAcc.get(accId) || [];
    const res = consolidateAccommodation(accRooms, emps, matrix);
    if (!res.valid || res.moves.length === 0 || res.freedRooms.length === 0) continue;
    const score =
      Number(cfg.weight_freed_rooms) * res.freedRooms.length +
      Number(cfg.weight_underutilized) * (1 - res.utilizationBefore) -
      Number(cfg.weight_min_moves) * (res.moves.length / 10);
    perAcc.push({
      accommodation_id: accId,
      accommodation_name: emps[0].accommodation_name,
      freed_rooms: res.freedRooms.length,
      freed_beds: res.freedBeds,
      moves: res.moves.length,
      flagged_unknown_shift: (res.flaggedUnknownShift || []).length,
      utilization_before: Number(res.utilizationBefore.toFixed(3)),
      score: Number(score.toFixed(2)),
    });
    for (const m of res.moves) allMoves.push({ ...m, accommodation_id: accId, accommodation_name: emps[0].accommodation_name });
  }
  perAcc.sort((a, b) => b.score - a.score);

  const totalFreedRooms = perAcc.reduce((s, a) => s + a.freed_rooms, 0);
  const totalFreedBeds = perAcc.reduce((s, a) => s + a.freed_beds, 0);
  const summary = {
    by_accommodation: perAcc,
    flagged_unknown_shift: flaggedUnknownShift,
    flagged_unknown_shift_count: flaggedUnknownShift.length,
    generated_at: new Date().toISOString(),
  };
  if (flaggedUnknownShift.length) {
    logger.info(`[consolidation] ${flaggedUnknownShift.length} employee(s) have an empty shift → not auto-placed, flagged for data entry`);
  }

  const runId = await transaction(async (client) => {
    const run = await client.query(
      `INSERT INTO consolidation_runs (triggered_by, status, total_moves, freed_rooms, freed_beds, summary)
       VALUES ($1,'generated',$2,$3,$4,$5) RETURNING id`,
      [triggeredBy, allMoves.length, totalFreedRooms, totalFreedBeds, JSON.stringify(summary)]
    );
    const rid = run.rows[0].id;
    for (const m of allMoves) {
      await client.query(
        `INSERT INTO agent_suggestions (agent_name, entity_type, entity_id, suggestion_type, payload, rationale, status)
         VALUES ($1,'employee',$2,'room_move',$3,$4,'pending')`,
        [AGENT, m.employee_id,
         JSON.stringify({ run_id: rid, from_room_id: m.from_room_id, to_room_id: m.to_room_id,
                          to_room_number: roomNumber.get(m.to_room_id), from_room_number: roomNumber.get(m.from_room_id),
                          accommodation_id: m.accommodation_id, accommodation_name: m.accommodation_name }),
         `Konszolidáció: ${m.accommodation_name} — átköltöztetés a ${roomNumber.get(m.to_room_id)} szobába.`]
      );
    }
    return rid;
  });

  return { run_id: runId, total_moves: allMoves.length, freed_rooms: totalFreedRooms, freed_beds: totalFreedBeds, summary };
}

// Re-validate a single move against CURRENT state (nothing changed underneath it).
// Validate the CURRENT committed state of a set of accommodations — every active
// occupant grouping must be single-gender, shift-compatible, within capacity.
async function assertAccommodationsValid(client, accIds, matrix) {
  if (accIds.length === 0) return;
  const rows = (await client.query(
    `SELECT e.room_id, e.gender, e.shift_schedule AS shift, r.beds, r.room_number, a.name AS accommodation_name
       FROM employees e
       JOIN accommodation_rooms r ON r.id = e.room_id
       JOIN accommodations a ON a.id = e.accommodation_id
      WHERE e.accommodation_id = ANY($1) AND e.end_date IS NULL AND e.room_id IS NOT NULL`, [accIds])).rows;
  const byRoom = new Map();
  for (const r of rows) { if (!byRoom.has(r.room_id)) byRoom.set(r.room_id, []); byRoom.get(r.room_id).push(r); }
  for (const [, members] of byRoom) {
    const r0 = members[0];
    if (members.length > r0.beds) throw new Error(`A(z) "${r0.accommodation_name}" ${r0.room_number} szoba túltöltött (${members.length}/${r0.beds}).`);
    if (members.some((m) => m.gender !== r0.gender)) throw new Error(`A(z) "${r0.accommodation_name}" ${r0.room_number} szobában nemek keverednének.`);
    // Shift is validated among KNOWN-shift residents only: an empty-shift resident
    // is pinned + flagged for data entry, not an engine-created conflict.
    const known = members.filter((m) => shiftBucket(m.shift) !== null);
    if (!groupValid(known, matrix)) throw new Error(`A(z) "${r0.accommodation_name}" ${r0.room_number} szobában műszak-ütközés keletkezne.`);
  }
}

/**
 * Apply a group of pending move suggestions ATOMICALLY. Consolidation moves are
 * INTERDEPENDENT (a room is freed only once all its residents move; a target room
 * becomes valid only once incompatible residents leave) — so a single move can't
 * be applied in isolation without risking a transient invalid state. We apply the
 * whole group in one transaction and validate the FINAL committed state, rolling
 * back if any room would be invalid.
 *
 * @param runId  the run
 * @param accId  optional — apply only this accommodation's moves (else the whole run)
 */
async function applyGroup(runId, accId = null, reviewedBy = null) {
  const cfg = await getConfig();
  const filter = accId ? ` AND payload->>'accommodation_id' = $3` : '';
  const params = accId ? [AGENT, runId, accId] : [AGENT, runId];
  const pending = (await query(
    `SELECT * FROM agent_suggestions
      WHERE agent_name = $1 AND payload->>'run_id' = $2 AND status = 'pending'${filter}`, params)).rows;
  if (pending.length === 0) return { ok: false, error: 'nothing_pending' };

  const accIds = [...new Set(pending.map((s) => s.payload.accommodation_id))];
  let applied;
  try {
    applied = await transaction(async (client) => {
      for (const s of pending) {
        const p = s.payload;
        await client.query(
          `UPDATE employees SET room_id = $1, room_number = $2, updated_at = NOW() WHERE id = $3 AND end_date IS NULL`,
          [p.to_room_id, p.to_room_number || null, s.entity_id]);
        await client.query(
          `UPDATE agent_suggestions SET status='applied', reviewed_by=$2, reviewed_at=NOW(), applied_at=NOW() WHERE id=$1`,
          [s.id, reviewedBy]);
      }
      // Final-state guarantee: if a partial approval left a room invalid, roll back.
      await assertAccommodationsValid(client, accIds, cfg.shift_compatibility);
      const remaining = (await client.query(
        `SELECT COUNT(*)::int c FROM agent_suggestions WHERE agent_name=$1 AND payload->>'run_id'=$2 AND status='pending'`,
        [AGENT, runId])).rows[0].c;
      await client.query(`UPDATE consolidation_runs SET status=$2 WHERE id=$1`, [runId, remaining > 0 ? 'partially_applied' : 'applied']);
      return pending;
    });
  } catch (e) {
    return { ok: false, error: 'invalid', reason: e.message };
  }

  // Log each applied move in the shared history substrate (best-effort, post-commit).
  for (const s of applied) {
    const p = s.payload;
    statusHistory.recordStatusChange({
      entityType: 'employee', entityId: s.entity_id,
      fromStatus: p.from_room_id, toStatus: p.to_room_id,
      fromLabel: `Szoba ${p.from_room_number || '?'}`, toLabel: `Szoba ${p.to_room_number || '?'}`,
      changedBy: reviewedBy, source: 'consolidation',
      metadata: { run_id: p.run_id, suggestion_id: s.id, accommodation_id: p.accommodation_id },
    });
  }
  return { ok: true, applied: applied.length, accommodations: accIds.length };
}

async function rejectSuggestion(id, reviewedBy = null, reason = null) {
  const r = await query(
    `UPDATE agent_suggestions SET status='rejected', reviewed_by=$2, reviewed_at=NOW(),
            payload = jsonb_set(payload, '{reject_reason}', to_jsonb($3::text))
      WHERE id=$1 AND agent_name=$4 AND status='pending' RETURNING id`,
    [id, reviewedBy, reason || 'elutasítva', AGENT]
  );
  return { ok: r.rows.length > 0 };
}

async function listRuns(limit = 20) {
  const r = await query(`SELECT * FROM consolidation_runs ORDER BY created_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

async function getSuggestions(runId) {
  const r = await query(
    `SELECT s.*, CONCAT(e.last_name, ' ', e.first_name) AS employee_name, e.gender, e.shift_schedule AS shift
       FROM agent_suggestions s
       LEFT JOIN employees e ON e.id = s.entity_id
      WHERE s.agent_name = $1 AND s.payload->>'run_id' = $2
      ORDER BY s.payload->>'accommodation_name', s.created_at`,
    [AGENT, runId]
  );
  return r.rows;
}

async function getRun(runId) {
  const r = await query(`SELECT * FROM consolidation_runs WHERE id = $1`, [runId]);
  return r.rows[0] || null;
}

module.exports = {
  generateRun, applyGroup, rejectSuggestion, listRuns, getRun, getSuggestions, getConfig,
  // exported for tests
  consolidateAccommodation, groupValid, shiftBucket, compatible,
};
