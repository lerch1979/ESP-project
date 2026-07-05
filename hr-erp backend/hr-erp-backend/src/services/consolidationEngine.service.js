/**
 * Room Consolidation Suggestion Engine — v2 (accommodation-level strategy layer).
 *
 * Proposes moving ACTIVE employees to free up whole rooms (bed-utilization
 * billing). The engine NEVER moves anyone — it writes proposals to
 * agent_suggestions (mig 123) for human approval; approve applies the moves
 * ATOMICALLY per plan (+ entity_status_history), reject archives with a reason.
 *
 * HARD constraints — a suggestion may NEVER violate these (validated on every
 * placement by construction; an accommodation that can't be solved cleanly is
 * left untouched, never emitting an unsafe suggestion):
 *   • no mixed-gender rooms
 *   • shift compatibility (configurable matrix; default: day/night never share,
 *     rotating its own group, flexible ↔ anything)
 *   • bed capacity per room
 *   • WORKPLACE BINDING (v2): a move may only TARGET an accommodation whose
 *     workplace list contains the employee's workplace (empty list = unrestricted)
 *   • LOCK (v2): a locked accommodation is never touched — no moves in or out
 *   • STABILITY (v2): an employee moved by an applied suggestion within the last
 *     `stability_days` (default 60) is frozen — never re-suggested
 *
 * STRATEGY (v2) — accommodation ROLES drive drain/fill order:
 *   • buffer   — drain FIRST when beds free up elsewhere
 *   • phase_out— drain (closure candidate)
 *   • core     — fill FIRST (keep at 100%)
 *   • normal   — default
 * Cross-accommodation moves are allowed (v1 was same-accommodation only), always
 * subject to every hard constraint above. Weights/matrix/stability live in
 * consolidation_config, read FRESH each run (expiry-monitor pattern).
 *
 * The planner (planConsolidation) is a PURE in-memory function — exported and
 * unit-tested directly on synthetic inputs, independent of the DB.
 */
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const statusHistory = require('./entityStatusHistory.service');

const AGENT = 'room_consolidation';
const DRAIN_ROLES = ['buffer', 'phase_out']; // drain order: buffer first, then phase_out
const FILL_ROLES = ['core', 'normal'];       // fill order: core first, then normal

// A null/unknown shift is treated as 'flexible' (compatible with any) — documented.
const shiftBucket = (s) => (s === 'day' || s === 'night' || s === 'rotating' ? s : 'flexible');
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

// Workplace binding: an EMPTY (or missing) list means the accommodation is
// unrestricted; otherwise the employee's workplace must be in the list.
const admits = (wpSet, workplace) => !wpSet || wpSet.size === 0 || wpSet.has(workplace);

const DEFAULT_MATRIX = {
  day: { day: true, night: false, rotating: false, flexible: true },
  night: { day: false, night: true, rotating: false, flexible: true },
  rotating: { day: false, night: false, rotating: true, flexible: true },
  flexible: { day: true, night: true, rotating: true, flexible: true },
};

async function getConfig() {
  const r = await query(`SELECT * FROM consolidation_config ORDER BY created_at ASC LIMIT 1`);
  return r.rows[0] || {
    is_enabled: true, weight_freed_rooms: 10, weight_min_moves: 3, weight_underutilized: 5,
    weight_drain: 8, stability_days: 60, shift_compatibility: DEFAULT_MATRIX,
  };
}

/**
 * PURE PLANNER. Given the full population in memory, compute a set of moves that
 * frees rooms while honoring every hard constraint by construction.
 *
 * @param accommodations [{ id, name, role, locked }]
 * @param roomsByAcc     Map<accId, [{ id, beds, room_number }]>
 * @param employees      [{ id, gender, shift, workplace, room_id, accommodation_id }] (active, room_id set)
 * @param lastMovedAt    Map<empId, Date|null>   — from entity_status_history (consolidation source)
 * @param workplaceSets  Map<accId, Set<string>> — accommodation ↔ workplace binding
 * @param cfg            { shift_compatibility, stability_days, weight_* }
 * @param now            Date — reference time (injected for testability)
 * @returns { moves, freedRooms, plans, byPlan }
 */
function planConsolidation({ accommodations, roomsByAcc, employees, lastMovedAt, workplaceSets, cfg, now }) {
  const matrix = cfg.shift_compatibility || DEFAULT_MATRIX;
  const stabilityMs = (Number(cfg.stability_days) || 60) * 86400000;
  const ref = now || new Date();

  const accById = new Map(accommodations.map((a) => [a.id, a]));
  const bedsOf = new Map();
  const roomAcc = new Map();
  const roomNumber = new Map();
  for (const [accId, rooms] of roomsByAcc) {
    for (const r of rooms) { bedsOf.set(r.id, r.beds); roomAcc.set(r.id, accId); roomNumber.set(r.id, r.room_number); }
  }

  // ── classify: frozen (locked accommodation OR recently moved) vs movable ──
  const frozen = new Set();
  for (const e of employees) {
    const acc = accById.get(e.accommodation_id);
    const lm = lastMovedAt.get(e.id);
    const recent = lm && (ref.getTime() - new Date(lm).getTime()) < stabilityMs;
    if ((acc && acc.locked) || recent) frozen.add(e.id);
  }

  // ── model: room -> occupant list; employee -> assigned room ──
  const assignment = new Map();
  const occ = new Map();
  const ensure = (rid) => { if (!occ.has(rid)) occ.set(rid, []); return occ.get(rid); };
  const place = (rid, e) => { assignment.set(e.id, rid); ensure(rid).push(e); };
  const unplace = (e) => {
    const rid = assignment.get(e.id);
    const l = occ.get(rid); if (l) l.splice(l.indexOf(e), 1);
    assignment.delete(e.id);
  };
  const remaining = (rid) => bedsOf.get(rid) - (occ.get(rid)?.length || 0);
  // Can e join room rid given its CURRENT model occupants (+ optional simulated extras)?
  const canJoin = (rid, e, extra) => {
    const base = occ.get(rid) || [];
    const list = extra && extra.get(rid) ? base.concat(extra.get(rid)) : base;
    if (list.length >= bedsOf.get(rid)) return false;
    if (list.some((o) => o.gender !== e.gender)) return false;
    const eb = shiftBucket(e.shift);
    return list.every((o) => compatible(shiftBucket(o.shift), eb, matrix));
  };

  // Seed frozen occupants into their current rooms (they never move).
  for (const e of employees) if (frozen.has(e.id)) place(e.room_id, e);

  // ── PASS A: within-accommodation consolidation (pack movable around frozen) ──
  for (const acc of accommodations) {
    if (acc.locked) continue;
    const rooms = [...(roomsByAcc.get(acc.id) || [])].sort((a, b) => b.beds - a.beds);
    const movable = employees.filter((e) => e.accommodation_id === acc.id && !frozen.has(e.id));
    if (movable.length === 0) continue;
    // cluster by (gender, shift bucket) so same-cohort people share rooms
    const sorted = [...movable].sort((a, b) =>
      a.gender < b.gender ? -1 : a.gender > b.gender ? 1
        : shiftBucket(a.shift) < shiftBucket(b.shift) ? -1 : 1);

    const tempPlaced = [];
    let aborted = false;
    for (const e of sorted) {
      const occupied = rooms.filter((r) => (occ.get(r.id)?.length || 0) > 0 && canJoin(r.id, e));
      let target = null;
      if (occupied.length) {
        // best-fit: tightest remaining capacity → consolidate into fewest rooms
        target = occupied.reduce((best, r) => (remaining(r.id) < remaining(best.id) ? r : best));
      } else {
        target = rooms.find((r) => (occ.get(r.id)?.length || 0) === 0) || null; // largest empty
      }
      if (!target) { aborted = true; break; }
      place(target.id, e); tempPlaced.push(e);
    }
    if (aborted) {
      // couldn't cleanly re-pack around the pins → leave this site as-is (identity).
      for (const e of tempPlaced) unplace(e);
      for (const e of movable) if (!assignment.has(e.id)) place(e.room_id, e);
    }
  }

  // ── PASS B: cross-accommodation drain of buffer/phase_out into core/normal ──
  const drainSources = accommodations
    .filter((a) => !a.locked && DRAIN_ROLES.includes(a.role))
    .sort((a, b) => DRAIN_ROLES.indexOf(a.role) - DRAIN_ROLES.indexOf(b.role));
  const fillAccs = accommodations
    .filter((a) => !a.locked && FILL_ROLES.includes(a.role))
    .sort((a, b) => FILL_ROLES.indexOf(a.role) - FILL_ROLES.indexOf(b.role));

  // Find a target room for e among fill accommodations (core-first), honoring
  // workplace binding + gender/shift/capacity vs current + tentatively-added occupants.
  const findTarget = (e, simExtra) => {
    for (const acc of fillAccs) {
      if (acc.id === e.accommodation_id) continue;            // draining OUT of the source
      if (!admits(workplaceSets.get(acc.id), e.workplace)) continue; // HARD: workplace binding
      const rooms = roomsByAcc.get(acc.id) || [];
      const load = (rid) => (occ.get(rid)?.length || 0) + (simExtra.get(rid)?.length || 0);
      const occupied = rooms.filter((r) => load(r.id) > 0 && canJoin(r.id, e, simExtra));
      if (occupied.length) {
        return occupied.reduce((best, r) =>
          (bedsOf.get(r.id) - load(r.id) < bedsOf.get(best.id) - load(best.id) ? r : best));
      }
      const empty = rooms.filter((r) => load(r.id) === 0 && bedsOf.get(r.id) > 0)
        .sort((a, b) => bedsOf.get(b.id) - bedsOf.get(a.id));
      if (empty.length) return empty[0];
    }
    return null;
  };

  for (const source of drainSources) {
    const rooms = roomsByAcc.get(source.id) || [];
    for (const room of rooms) {
      const occupants = [...(occ.get(room.id) || [])];
      if (occupants.length === 0) continue;
      if (occupants.some((o) => frozen.has(o.id))) continue; // can't fully empty a room with a frozen resident
      // all-or-nothing: relocate every occupant of this room, or none (keeps it clean)
      const simExtra = new Map();
      const tentative = [];
      let ok = true;
      for (const e of occupants) {
        const t = findTarget(e, simExtra);
        if (!t) { ok = false; break; }
        tentative.push({ e, rid: t.id });
        if (!simExtra.has(t.id)) simExtra.set(t.id, []);
        simExtra.get(t.id).push(e);
      }
      if (ok) for (const { e, rid } of tentative) { unplace(e); place(rid, e); }
    }
  }

  // ── derive net moves (final vs original room) ──
  const moves = [];
  for (const e of employees) {
    const to = assignment.get(e.id);
    if (to !== e.room_id) {
      const fromAcc = e.accommodation_id;
      const toAcc = roomAcc.get(to);
      moves.push({
        employee_id: e.id, from_room_id: e.room_id, to_room_id: to,
        from_room_number: roomNumber.get(e.room_id) ?? null, to_room_number: roomNumber.get(to) ?? null,
        from_accommodation_id: fromAcc, to_accommodation_id: toAcc,
        from_accommodation_name: accById.get(fromAcc)?.name || null,
        to_accommodation_name: accById.get(toAcc)?.name || null,
        is_cross: fromAcc !== toAcc,
      });
    }
  }

  // ── freed rooms: originally occupied, now empty ──
  const originalOccupied = new Set(employees.map((e) => e.room_id));
  const freedRooms = [...originalOccupied].filter((rid) => (occ.get(rid)?.length || 0) === 0);
  const freedRoomSet = new Set(freedRooms);

  // ── plans: accommodations connected by cross-moves (union-find) ──
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  for (const m of moves) for (const a of [m.from_accommodation_id, m.to_accommodation_id]) if (!parent.has(a)) parent.set(a, a);
  for (const m of moves) union(m.from_accommodation_id, m.to_accommodation_id);
  for (const m of moves) m.plan_key = find(m.from_accommodation_id);

  // ── per-plan summary + score ──
  const wFreed = Number(cfg.weight_freed_rooms ?? 10);
  const wMoves = Number(cfg.weight_min_moves ?? 3);
  const wUtil = Number(cfg.weight_underutilized ?? 5);
  const wDrain = Number(cfg.weight_drain ?? 8);
  const byPlanMap = new Map();
  for (const m of moves) {
    if (!byPlanMap.has(m.plan_key)) byPlanMap.set(m.plan_key, { accIds: new Set(), moves: 0, cross: 0 });
    const p = byPlanMap.get(m.plan_key);
    p.accIds.add(m.from_accommodation_id); p.accIds.add(m.to_accommodation_id);
    p.moves++; if (m.is_cross) p.cross++;
  }
  const occupantsOf = new Map(); // accId -> original occupant count
  const bedsByAcc = new Map();
  for (const e of employees) occupantsOf.set(e.accommodation_id, (occupantsOf.get(e.accommodation_id) || 0) + 1);
  for (const [accId, rooms] of roomsByAcc) bedsByAcc.set(accId, rooms.reduce((s, r) => s + r.beds, 0));

  const byPlan = [];
  for (const [planKey, p] of byPlanMap) {
    const accIds = [...p.accIds];
    const freedInPlan = freedRooms.filter((rid) => accIds.includes(roomAcc.get(rid)));
    const freedBeds = freedInPlan.reduce((s, rid) => s + (bedsOf.get(rid) || 0), 0);
    const totBeds = accIds.reduce((s, a) => s + (bedsByAcc.get(a) || 0), 0);
    const totOcc = accIds.reduce((s, a) => s + (occupantsOf.get(a) || 0), 0);
    const util = totBeds ? totOcc / totBeds : 0;
    const drainCount = accIds.filter((a) => DRAIN_ROLES.includes(accById.get(a)?.role)).length;
    const score = wFreed * freedInPlan.length + wUtil * (1 - util) - wMoves * (p.moves / 10) + wDrain * drainCount;
    byPlan.push({
      plan_key: planKey,
      accommodations: accIds.map((a) => ({ id: a, name: accById.get(a)?.name, role: accById.get(a)?.role, locked: !!accById.get(a)?.locked })),
      accommodation_names: accIds.map((a) => accById.get(a)?.name),
      freed_rooms: freedInPlan.length,
      freed_beds: freedBeds,
      moves: p.moves,
      cross_moves: p.cross,
      utilization_before: Number(util.toFixed(3)),
      score: Number(score.toFixed(2)),
    });
  }
  byPlan.sort((a, b) => b.score - a.score);

  return { moves, freedRooms, freedRoomSet, byPlan, frozen };
}

/**
 * Run the engine: load state → plan → persist a consolidation_runs row + one
 * agent_suggestions row per proposed move. Read-only w.r.t. employees.
 */
async function generateRun(triggeredBy = null) {
  const cfg = await getConfig();
  if (cfg.is_enabled === false) return { skipped: true, reason: 'disabled' };

  const accRows = (await query(
    `SELECT id, name, consolidation_role AS role, consolidation_locked AS locked FROM accommodations WHERE is_active = TRUE`)).rows;
  const roomRows = (await query(
    `SELECT id, accommodation_id, room_number, beds FROM accommodation_rooms WHERE is_active = TRUE`)).rows;
  const empRows = (await query(`
    SELECT e.id, e.gender, e.shift_schedule AS shift, e.workplace, e.room_id, e.accommodation_id
      FROM employees e
      JOIN employee_status_types est ON est.id = e.status_id AND est.slug = 'active'
     WHERE e.end_date IS NULL AND e.room_id IS NOT NULL`)).rows;
  const wpRows = (await query(`SELECT accommodation_id, workplace FROM accommodation_workplaces`)).rows;
  const lmRows = (await query(
    `SELECT entity_id, MAX(changed_at) AS last FROM entity_status_history
      WHERE entity_type='employee' AND source='consolidation' GROUP BY entity_id`)).rows;

  const roomsByAcc = new Map();
  for (const r of roomRows) { if (!roomsByAcc.has(r.accommodation_id)) roomsByAcc.set(r.accommodation_id, []); roomsByAcc.get(r.accommodation_id).push(r); }
  const workplaceSets = new Map();
  for (const w of wpRows) { if (!workplaceSets.has(w.accommodation_id)) workplaceSets.set(w.accommodation_id, new Set()); workplaceSets.get(w.accommodation_id).add(w.workplace); }
  const lastMovedAt = new Map(lmRows.map((r) => [r.entity_id, r.last]));

  const plan = planConsolidation({
    accommodations: accRows, roomsByAcc, employees: empRows,
    lastMovedAt, workplaceSets, cfg, now: new Date(),
  });

  const totalFreedRooms = plan.freedRooms.length;
  const totalFreedBeds = plan.freedRooms.reduce((s, rid) => {
    for (const rooms of roomsByAcc.values()) { const r = rooms.find((x) => x.id === rid); if (r) return s + r.beds; }
    return s;
  }, 0);
  const summary = { by_plan: plan.byPlan, generated_at: new Date().toISOString() };

  const runId = await transaction(async (client) => {
    const run = await client.query(
      `INSERT INTO consolidation_runs (triggered_by, status, total_moves, freed_rooms, freed_beds, summary)
       VALUES ($1,'generated',$2,$3,$4,$5) RETURNING id`,
      [triggeredBy, plan.moves.length, totalFreedRooms, totalFreedBeds, JSON.stringify(summary)]
    );
    const rid = run.rows[0].id;
    for (const m of plan.moves) {
      const rationale = m.is_cross
        ? `Konszolidáció: átköltöztetés ${m.from_accommodation_name} → ${m.to_accommodation_name} (${m.to_room_number} szoba).`
        : `Konszolidáció: ${m.to_accommodation_name} — átköltöztetés a ${m.to_room_number} szobába.`;
      await client.query(
        `INSERT INTO agent_suggestions (agent_name, entity_type, entity_id, suggestion_type, payload, rationale, status)
         VALUES ($1,'employee',$2,'room_move',$3,$4,'pending')`,
        [AGENT, m.employee_id,
         JSON.stringify({
           run_id: rid, plan_key: m.plan_key,
           from_room_id: m.from_room_id, to_room_id: m.to_room_id,
           from_room_number: m.from_room_number, to_room_number: m.to_room_number,
           from_accommodation_id: m.from_accommodation_id, to_accommodation_id: m.to_accommodation_id,
           from_accommodation_name: m.from_accommodation_name, to_accommodation_name: m.to_accommodation_name,
           is_cross: m.is_cross,
         }),
         rationale]
      );
    }
    return rid;
  });

  return { run_id: runId, total_moves: plan.moves.length, freed_rooms: totalFreedRooms, freed_beds: totalFreedBeds, summary };
}

/**
 * Final-state guarantee inside applyGroup: validate the CURRENT committed
 * composition of exactly the rooms a plan COMPOSED (its destination rooms).
 *
 * We validate to_rooms only — the rooms the moves place people INTO. Source
 * rooms only lose occupants (never become invalid), and pre-existing conflicts
 * in rooms the plan never touched are out of scope (the engine's guarantee is
 * "no suggestion CREATES a violation", not "fixes every legacy conflict"). This
 * also correctly rejects a plan if the world changed under it (e.g. someone was
 * moved into a destination room since the run was generated).
 */
async function assertRoomsValid(client, roomIds, cfg) {
  if (roomIds.length === 0) return;
  const matrix = cfg.shift_compatibility || DEFAULT_MATRIX;
  const rows = (await client.query(
    `SELECT e.room_id, e.gender, e.shift_schedule AS shift, e.workplace, e.accommodation_id,
            r.beds, r.room_number, a.name AS accommodation_name
       FROM employees e
       JOIN accommodation_rooms r ON r.id = e.room_id
       JOIN accommodations a ON a.id = e.accommodation_id
      WHERE e.room_id = ANY($1) AND e.end_date IS NULL`, [roomIds])).rows;
  const accIds = [...new Set(rows.map((r) => r.accommodation_id))];
  const wpRows = accIds.length ? (await client.query(
    `SELECT accommodation_id, workplace FROM accommodation_workplaces WHERE accommodation_id = ANY($1)`, [accIds])).rows : [];
  const wpSets = new Map();
  for (const w of wpRows) { if (!wpSets.has(w.accommodation_id)) wpSets.set(w.accommodation_id, new Set()); wpSets.get(w.accommodation_id).add(w.workplace); }

  const byRoom = new Map();
  for (const r of rows) {
    if (!admits(wpSets.get(r.accommodation_id), r.workplace)) {
      throw new Error(`A(z) "${r.accommodation_name}" szálláshely nem fogadhatja a(z) "${r.workplace}" munkahelyű dolgozót (munkahely-kötés).`);
    }
    if (!byRoom.has(r.room_id)) byRoom.set(r.room_id, []);
    byRoom.get(r.room_id).push(r);
  }
  for (const [, members] of byRoom) {
    const r0 = members[0];
    if (members.length > r0.beds) throw new Error(`A(z) "${r0.accommodation_name}" ${r0.room_number} szoba túltöltött (${members.length}/${r0.beds}).`);
    if (!groupValid(members, matrix)) throw new Error(`A(z) "${r0.accommodation_name}" ${r0.room_number} szobában nem/műszak ütközés keletkezne.`);
  }
}

/**
 * Apply a group of pending move suggestions ATOMICALLY. Moves are INTERDEPENDENT
 * (a room frees only once all its residents move; a target becomes valid only
 * once incompatible residents leave; a cross-move links two sites) — so we apply
 * the whole plan in one transaction and validate the FINAL committed state,
 * rolling back if any room would be invalid.
 *
 * @param planKey  optional — apply only this plan's moves (else the whole run)
 */
async function applyGroup(runId, planKey = null, reviewedBy = null) {
  const cfg = await getConfig();
  const filter = planKey ? ` AND payload->>'plan_key' = $3` : '';
  const params = planKey ? [AGENT, runId, planKey] : [AGENT, runId];
  const pending = (await query(
    `SELECT * FROM agent_suggestions
      WHERE agent_name = $1 AND payload->>'run_id' = $2 AND status = 'pending'${filter}`, params)).rows;
  if (pending.length === 0) return { ok: false, error: 'nothing_pending' };

  // accommodations touched (source AND target) — for the caller's summary.
  const accIds = [...new Set(pending.flatMap((s) => [s.payload.from_accommodation_id, s.payload.to_accommodation_id]).filter(Boolean))];
  // the rooms the plan COMPOSES (destinations) — validated as the final-state guarantee.
  const toRoomIds = [...new Set(pending.map((s) => s.payload.to_room_id).filter(Boolean))];
  let applied;
  try {
    applied = await transaction(async (client) => {
      for (const s of pending) {
        const p = s.payload;
        await client.query(
          `UPDATE employees SET room_id = $1, room_number = $2, accommodation_id = $3, updated_at = NOW()
            WHERE id = $4 AND end_date IS NULL`,
          [p.to_room_id, p.to_room_number || null, p.to_accommodation_id, s.entity_id]);
        await client.query(
          `UPDATE agent_suggestions SET status='applied', reviewed_by=$2, reviewed_at=NOW(), applied_at=NOW() WHERE id=$1`,
          [s.id, reviewedBy]);
      }
      // Final-state guarantee: every destination room is valid post-apply.
      await assertRoomsValid(client, toRoomIds, cfg);
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
  // Records a room change always, plus a SEPARATE accommodation change for cross-moves.
  // Awaited so the audit trail is durable before we return (recorder swallows errors).
  const writes = [];
  for (const s of applied) {
    const p = s.payload;
    writes.push(statusHistory.recordStatusChange({
      entityType: 'employee', entityId: s.entity_id,
      fromStatus: p.from_room_id, toStatus: p.to_room_id,
      fromLabel: `Szoba ${p.from_room_number || '?'}`, toLabel: `Szoba ${p.to_room_number || '?'}`,
      changedBy: reviewedBy, source: 'consolidation',
      metadata: { kind: 'room', run_id: p.run_id, plan_key: p.plan_key, suggestion_id: s.id, accommodation_id: p.to_accommodation_id },
    }));
    if (p.is_cross) {
      writes.push(statusHistory.recordStatusChange({
        entityType: 'employee', entityId: s.entity_id,
        fromStatus: p.from_accommodation_id, toStatus: p.to_accommodation_id,
        fromLabel: p.from_accommodation_name || '?', toLabel: p.to_accommodation_name || '?',
        changedBy: reviewedBy, source: 'consolidation',
        metadata: { kind: 'accommodation', run_id: p.run_id, plan_key: p.plan_key, suggestion_id: s.id },
      }));
    }
  }
  await Promise.allSettled(writes);
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
    `SELECT s.*, CONCAT(e.last_name, ' ', e.first_name) AS employee_name, e.gender, e.shift_schedule AS shift, e.workplace
       FROM agent_suggestions s
       LEFT JOIN employees e ON e.id = s.entity_id
      WHERE s.agent_name = $1 AND s.payload->>'run_id' = $2
      ORDER BY s.payload->>'plan_key', (s.payload->>'is_cross')::boolean DESC, s.created_at`,
    [AGENT, runId]
  );
  return r.rows;
}

async function getRun(runId) {
  const r = await query(`SELECT * FROM consolidation_runs WHERE id = $1`, [runId]);
  return r.rows[0] || null;
}

// Distinct workplaces present on employees — for the accommodation workplace-binding editor.
async function listWorkplaces() {
  const r = await query(`SELECT DISTINCT workplace FROM employees WHERE workplace IS NOT NULL AND workplace <> '' ORDER BY workplace`);
  return r.rows.map((x) => x.workplace);
}

module.exports = {
  generateRun, applyGroup, rejectSuggestion, listRuns, getRun, getSuggestions, getConfig, listWorkplaces,
  // exported for tests
  planConsolidation, groupValid, shiftBucket, compatible, admits,
};
