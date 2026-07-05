/**
 * Regression: Room Consolidation Suggestion Engine v2 (SANDBOX only).
 *
 * Proves the HARD constraints hold on EVERY suggestion, both on hand-crafted
 * inputs to the PURE planner (workplace binding, lock, stability, cross-moves)
 * and on a full run over the seeded sandbox, then demos a full
 * run → reject → approve(plan) → verify flow, and the stability cooldown end-to-end.
 *
 *   DB_NAME=hr_erp_sandbox node tests/consolidationEngine.script.js
 */
require('dotenv').config();
const { pool } = require('../src/database/connection');
const engine = require('../src/services/consolidationEngine.service');

if (!/sandbox/i.test(process.env.DB_NAME || '')) { console.error('Run against the sandbox: DB_NAME=hr_erp_sandbox'); process.exit(1); }

let failures = 0;
const check = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const q = (s, p) => pool.query(s, p);

const MATRIX = {
  day: { day: true, night: false, rotating: false, flexible: true },
  night: { day: false, night: true, rotating: false, flexible: true },
  rotating: { day: false, night: false, rotating: true, flexible: true },
  flexible: { day: true, night: true, rotating: true, flexible: true },
};
const baseCfg = { shift_compatibility: MATRIX, stability_days: 60, weight_freed_rooms: 10, weight_min_moves: 3, weight_underutilized: 5, weight_drain: 8 };
const NOW = new Date('2026-07-05T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);

// Convenience to run the pure planner on small hand-built inputs.
function plan({ accommodations, rooms, employees, lastMoved = {}, workplaces = {} }) {
  const roomsByAcc = new Map();
  for (const r of rooms) { if (!roomsByAcc.has(r.accommodation_id)) roomsByAcc.set(r.accommodation_id, []); roomsByAcc.get(r.accommodation_id).push(r); }
  const workplaceSets = new Map(Object.entries(workplaces).map(([k, v]) => [k, new Set(v)]));
  const lastMovedAt = new Map(Object.entries(lastMoved));
  return engine.planConsolidation({ accommodations, roomsByAcc, employees, lastMovedAt, workplaceSets, cfg: baseCfg, now: NOW });
}

(async () => {
  // Snapshot every employee's placement so the test is fully idempotent — it
  // applies real moves below, and must leave the sandbox exactly as it found it.
  let snapshot = [];
  try {
    snapshot = (await q(`SELECT id, room_id, room_number, accommodation_id FROM employees`)).rows;

    // ══════════════ UNIT: matrix + validators ══════════════
    check('matrix: day+night NOT compatible', engine.compatible('day', 'night', MATRIX) === false);
    check('matrix: flexible+night compatible', engine.compatible('flexible', 'night', MATRIX) === true);
    check('matrix: rotating only with rotating/flexible', engine.compatible('rotating', 'day', MATRIX) === false && engine.compatible('rotating', 'flexible', MATRIX) === true);
    check('groupValid rejects mixed gender', engine.groupValid([{ gender: 'male', shift: 'day' }, { gender: 'female', shift: 'day' }], MATRIX) === false);
    check('groupValid rejects day+night', engine.groupValid([{ gender: 'male', shift: 'day' }, { gender: 'male', shift: 'night' }], MATRIX) === false);
    check('admits: empty set = unrestricted', engine.admits(new Set(), 'Audi Győr') === true && engine.admits(undefined, 'X') === true);
    check('admits: non-empty set enforces membership', engine.admits(new Set(['Audi Győr']), 'Audi Győr') === true && engine.admits(new Set(['Audi Győr']), 'Bosch Miskolc') === false);

    // ══════════════ PURE PLANNER: WORKPLACE BINDING ══════════════
    // A buffer resident whose ONLY spatial target is a workplace-excluded core.
    const wpAccs = [{ id: 'B', name: 'Buffer', role: 'buffer', locked: false }, { id: 'C', name: 'Core', role: 'core', locked: false }];
    const wpRooms = [{ id: 'b1', accommodation_id: 'B', beds: 1, room_number: 'b1' }, { id: 'c1', accommodation_id: 'C', beds: 2, room_number: 'c1' }];
    const admitted = plan({
      accommodations: wpAccs, rooms: wpRooms,
      employees: [{ id: 'e1', gender: 'male', shift: 'day', workplace: 'Audi Győr', room_id: 'b1', accommodation_id: 'B' }],
      workplaces: { C: ['Audi Győr'] },
    });
    check('workplace ADMITTED → resident drains cross into core', admitted.moves.length === 1 && admitted.moves[0].to_accommodation_id === 'C' && admitted.moves[0].is_cross === true);

    const blocked = plan({
      accommodations: wpAccs, rooms: wpRooms,
      employees: [{ id: 'e1', gender: 'male', shift: 'day', workplace: 'Bosch Miskolc', room_id: 'b1', accommodation_id: 'B' }],
      workplaces: { C: ['Audi Győr'] },
    });
    check('workplace-ONLY blocker → engine SKIPS (no move into excluded core)', blocked.moves.length === 0);

    // ══════════════ PURE PLANNER: LOCK ══════════════
    // Locked site is under-consolidated (2 half rooms) but must NOT be touched.
    const locked = plan({
      accommodations: [{ id: 'L', name: 'Locked', role: 'normal', locked: true }],
      rooms: [{ id: 'l1', accommodation_id: 'L', beds: 2, room_number: 'l1' }, { id: 'l2', accommodation_id: 'L', beds: 2, room_number: 'l2' }],
      employees: [
        { id: 'x1', gender: 'male', shift: 'day', workplace: 'X', room_id: 'l1', accommodation_id: 'L' },
        { id: 'x2', gender: 'male', shift: 'day', workplace: 'X', room_id: 'l2', accommodation_id: 'L' },
      ],
    });
    check('locked site: zero moves (no in/out), despite being consolidatable', locked.moves.length === 0);

    // Locked site is not a valid DRAIN TARGET either.
    const lockedTarget = plan({
      accommodations: [{ id: 'B', name: 'Buf', role: 'buffer', locked: false }, { id: 'L', name: 'Locked', role: 'core', locked: true }],
      rooms: [{ id: 'b1', accommodation_id: 'B', beds: 1, room_number: 'b1' }, { id: 'l1', accommodation_id: 'L', beds: 4, room_number: 'l1' }],
      employees: [{ id: 'e1', gender: 'male', shift: 'day', workplace: 'X', room_id: 'b1', accommodation_id: 'B' }],
    });
    check('locked site is never a drain TARGET', lockedTarget.moves.length === 0);

    // ══════════════ PURE PLANNER: STABILITY COOLDOWN ══════════════
    const stabAccs = [{ id: 'B', name: 'Buf', role: 'buffer', locked: false }, { id: 'C', name: 'Core', role: 'core', locked: false }];
    const stabRooms = [{ id: 'b1', accommodation_id: 'B', beds: 1, room_number: 'b1' }, { id: 'c1', accommodation_id: 'C', beds: 2, room_number: 'c1' }];
    const stabEmp = [{ id: 'e1', gender: 'male', shift: 'day', workplace: 'X', room_id: 'b1', accommodation_id: 'B' }];
    const recent = plan({ accommodations: stabAccs, rooms: stabRooms, employees: stabEmp, lastMoved: { e1: daysAgo(10) } });
    check('stability: employee moved 10 days ago is FROZEN (not re-suggested)', recent.moves.length === 0);
    const stale = plan({ accommodations: stabAccs, rooms: stabRooms, employees: stabEmp, lastMoved: { e1: daysAgo(90) } });
    check('stability: employee moved 90 days ago is movable again', stale.moves.length === 1);

    // ══════════════ FULL RUN over the seeded sandbox ══════════════
    const run = await engine.generateRun(null);
    check('engine produced a run', !!run.run_id);
    check('engine proposed ≥1 move', run.total_moves >= 1);
    check('engine frees ≥1 room', run.freed_rooms >= 1);
    console.log(`      → run ${run.run_id}: ${run.total_moves} moves, frees ${run.freed_rooms} rooms / ${run.freed_beds} beds across ${run.summary.by_plan.length} plans`);

    const suggestions = await engine.getSuggestions(run.run_id);
    check('suggestions persisted in agent_suggestions', suggestions.length === run.total_moves);
    check('at least one CROSS-accommodation move (buffer/phase_out drained)', suggestions.some((s) => s.payload.is_cross === true));

    // Load ground-truth state for the constraint proof.
    const emps = (await q(
      `SELECT e.id, e.gender, e.shift_schedule AS shift, e.workplace, e.room_id, e.accommodation_id
         FROM employees e JOIN employee_status_types est ON est.id=e.status_id AND est.slug='active'
        WHERE e.end_date IS NULL AND e.room_id IS NOT NULL`)).rows;
    const rooms = (await q(`SELECT id, accommodation_id, beds FROM accommodation_rooms WHERE is_active=TRUE`)).rows;
    const accs = (await q(`SELECT id, consolidation_role AS role, consolidation_locked AS locked FROM accommodations`)).rows;
    const wp = (await q(`SELECT accommodation_id, workplace FROM accommodation_workplaces`)).rows;
    const roomAcc = new Map(rooms.map((r) => [r.id, r.accommodation_id]));
    const roomBeds = new Map(rooms.map((r) => [r.id, r.beds]));
    const lockedAcc = new Set(accs.filter((a) => a.locked).map((a) => a.id));
    const wpSets = new Map();
    for (const w of wp) { if (!wpSets.has(w.accommodation_id)) wpSets.set(w.accommodation_id, new Set()); wpSets.get(w.accommodation_id).add(w.workplace); }
    const state = new Map(emps.map((e) => [e.id, { ...e }]));

    // ── PER-SUGGESTION static proofs (workplace binding + lock) ──
    let wpBad = 0, lockBad = 0, crossMisflag = 0;
    for (const s of suggestions) {
      const e = state.get(s.entity_id);
      const p = s.payload;
      if (!engine.admits(wpSets.get(p.to_accommodation_id), e.workplace)) wpBad++;          // HARD: workplace binding
      if (lockedAcc.has(p.from_accommodation_id) || lockedAcc.has(p.to_accommodation_id)) lockBad++; // HARD: lock
      const actuallyCross = p.from_accommodation_id !== p.to_accommodation_id;
      if (actuallyCross !== !!p.is_cross) crossMisflag++;
    }
    check('EVERY suggestion satisfies workplace binding (target admits workplace)', wpBad === 0);
    check('NO suggestion touches a locked accommodation (in or out)', lockBad === 0);
    check('is_cross flag matches from/to accommodation on every suggestion', crossMisflag === 0);

    // ── apply ALL suggestions in-memory, then validate every COMPOSED room ──
    // The engine's guarantee is "no suggestion CREATES a violation", so the proof
    // validates the destination rooms (the rooms moves place people INTO). Source
    // rooms only lose occupants; pre-existing conflicts in rooms the engine never
    // composed are out of scope (documented, same as v1).
    const toRooms = new Set(suggestions.map((s) => s.payload.to_room_id));
    for (const s of suggestions) {
      const e = state.get(s.entity_id);
      e.room_id = s.payload.to_room_id;
      e.accommodation_id = s.payload.to_accommodation_id;
    }
    const byRoom = new Map();
    for (const e of state.values()) {
      if (!toRooms.has(e.room_id)) continue;
      if (!byRoom.has(e.room_id)) byRoom.set(e.room_id, []);
      byRoom.get(e.room_id).push(e);
    }
    let genderBad = 0, shiftBad = 0, capBad = 0, wpRoomBad = 0;
    for (const [rid, members] of byRoom) {
      if (members.length > roomBeds.get(rid)) capBad++;
      const g = members[0].gender;
      if (members.some((x) => x.gender !== g)) genderBad++;
      if (!engine.groupValid(members, MATRIX)) shiftBad++;
      const acc = roomAcc.get(rid);
      if (members.some((x) => !engine.admits(wpSets.get(acc), x.workplace))) wpRoomBad++;
    }
    check('NO mixed-gender room composed by any suggestion (after applying ALL)', genderBad === 0);
    check('NO day/night (shift) conflict in any composed room (after applying ALL)', shiftBad === 0);
    check('NO composed room over bed capacity (after applying ALL)', capBad === 0);
    check('EVERY resident of a composed room is workplace-admitted (after applying ALL)', wpRoomBad === 0);
    check('engine composed ≥1 destination room', toRooms.size >= 1);

    // Locked accommodation genuinely had a consolidatable arrangement and was left alone.
    const lockedId = accs.find((a) => a.locked)?.id;
    const lockedMoves = suggestions.filter((s) => s.payload.from_accommodation_id === lockedId || s.payload.to_accommodation_id === lockedId);
    check('locked "Szálló 03" received ZERO move suggestions', lockedMoves.length === 0);

    // ── reject one suggestion (before applying) ──
    const rj = suggestions[0];
    const rres = await engine.rejectSuggestion(rj.id, null, 'nem szükséges');
    check('reject returned ok', rres.ok === true);
    const rst = (await q(`SELECT status, payload->>'reject_reason' AS reason FROM agent_suggestions WHERE id=$1`, [rj.id])).rows[0];
    check('rejected + reason archived', rst.status === 'rejected' && rst.reason === 'nem szükséges');

    // ── FULL FLOW: approve (atomic apply) a whole PLAN other than the rejected one ──
    const targetPlan = suggestions.find((s) => s.payload.plan_key !== rj.payload.plan_key)?.payload.plan_key;
    const planMoves = suggestions.filter((s) => s.payload.plan_key === targetPlan);
    const sampleEmp = planMoves[0].entity_id;
    const before = (await q(`SELECT room_id, accommodation_id FROM employees WHERE id=$1`, [sampleEmp])).rows[0];
    const appr = await engine.applyGroup(run.run_id, targetPlan, null);
    check('applyGroup (approve plan) returned ok', appr.ok === true);
    check('applyGroup applied all that plan\'s pending moves', appr.applied === planMoves.length);
    const after = (await q(`SELECT room_id, accommodation_id FROM employees WHERE id=$1`, [sampleEmp])).rows[0];
    check('room_id change APPLIED', after.room_id === planMoves[0].payload.to_room_id && after.room_id !== before.room_id);
    const sampleCross = planMoves.find((s) => s.payload.is_cross);
    if (sampleCross) {
      const acc = (await q(`SELECT accommodation_id FROM employees WHERE id=$1`, [sampleCross.entity_id])).rows[0].accommodation_id;
      check('cross-move APPLIED accommodation_id change', acc === sampleCross.payload.to_accommodation_id);
      const accHist = (await q(
        `SELECT * FROM entity_status_history WHERE entity_id=$1 AND source='consolidation' AND metadata->>'kind'='accommodation' ORDER BY changed_at DESC LIMIT 1`,
        [sampleCross.entity_id])).rows[0];
      check('cross-move logged an ACCOMMODATION change in entity_status_history', !!accHist && accHist.to_status === sampleCross.payload.to_accommodation_id);
    } else {
      check('cross-move APPLIED accommodation_id change (n/a — plan had no cross-move)', true);
      check('cross-move logged an ACCOMMODATION change (n/a — plan had no cross-move)', true);
    }
    const st = (await q(`SELECT status, applied_at FROM agent_suggestions WHERE id=$1`, [planMoves[0].id])).rows[0];
    check('suggestions marked applied', st.status === 'applied' && !!st.applied_at);
    const roomHist = (await q(
      `SELECT * FROM entity_status_history WHERE entity_id=$1 AND source='consolidation' AND metadata->>'kind'='room' ORDER BY changed_at DESC LIMIT 1`,
      [sampleEmp])).rows[0];
    check('room move logged in entity_status_history', !!roomHist && roomHist.to_status === planMoves[0].payload.to_room_id);

    // ── committed DB: every room the applied plan COMPOSED is valid ──
    const planToRooms = [...new Set(planMoves.map((s) => s.payload.to_room_id))];
    const post = (await q(
      `SELECT e.room_id, e.gender, e.shift_schedule AS shift, e.workplace, e.accommodation_id, r.beds
         FROM employees e JOIN accommodation_rooms r ON r.id=e.room_id
        WHERE e.room_id=ANY($1) AND e.end_date IS NULL`, [planToRooms])).rows;
    const postByRoom = new Map();
    for (const e of post) { if (!postByRoom.has(e.room_id)) postByRoom.set(e.room_id, []); postByRoom.get(e.room_id).push(e); }
    let postBad = 0;
    for (const [, mem] of postByRoom) if (mem.length > mem[0].beds || !engine.groupValid(mem, MATRIX)) postBad++;
    check('committed DB: every room the applied plan composed is valid', postBad === 0);

    // ── re-applying the same plan is refused (nothing pending) ──
    const again = await engine.applyGroup(run.run_id, targetPlan, null);
    check('re-apply refused (nothing pending)', again.ok === false);

    // ── STABILITY end-to-end: the just-moved employees are frozen on the next run ──
    const movedIds = new Set(planMoves.map((s) => s.entity_id));
    const run2 = await engine.generateRun(null);
    const sugg2 = await engine.getSuggestions(run2.run_id);
    const reSuggested = sugg2.filter((s) => movedIds.has(s.entity_id) && s.payload.run_id === run2.run_id);
    check('stability (e2e): none of the just-moved employees are re-suggested within 60 days', reSuggested.length === 0);
  } finally {
    // Restore the sandbox to its pre-test state (idempotent + non-destructive).
    for (const e of snapshot) {
      await q(`UPDATE employees SET room_id=$2, room_number=$3, accommodation_id=$4 WHERE id=$1`,
        [e.id, e.room_id, e.room_number, e.accommodation_id]).catch(() => {});
    }
    await q(`DELETE FROM agent_suggestions WHERE agent_name='room_consolidation'`).catch(() => {});
    await q(`DELETE FROM consolidation_runs`).catch(() => {});
    await q(`DELETE FROM entity_status_history WHERE source='consolidation'`).catch(() => {});
    await pool.end();
  }
  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
