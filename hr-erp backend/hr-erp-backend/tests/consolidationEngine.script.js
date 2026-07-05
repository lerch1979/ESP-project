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

    // ══════════════ v3 LIFECYCLE: approve → confirm | cancel ══════════════
    // Approval creates a MOVE TICKET and changes NO room assignments; rooms change
    // only when the physical move is CONFIRMED done. Reviewer/assignee/contractor:
    const admin = (await q(`SELECT id, contractor_id FROM users WHERE email='admin@sandbox.local' LIMIT 1`)).rows[0];
    const approveOpts = { assigneeUserId: admin.id, reviewedBy: admin.id, contractorId: admin.contractor_id };

    // pick distinct plans for the lifecycle tests. P (partial) must free ≥1 room and
    // have ≥2 moves so a SAFE skip exists — a mover out of a to-be-emptied room, whom
    // leaving in place cannot overflow a destination (interdependent within-plans have
    // no safe single skip, and the engine correctly rejects those as invalid).
    const movesOf = (k) => suggestions.filter((s) => s.payload.plan_key === k);
    const pSum = (run.summary.by_plan || [])
      .filter((pp) => pp.freed_rooms >= 1 && pp.moves >= 2)
      .sort((a, b) => b.freed_rooms - a.freed_rooms)[0];
    const P = pSum ? { k: pSum.plan_key, moves: movesOf(pSum.plan_key) } : null;
    const otherKeys = [...new Set(suggestions.map((s) => s.payload.plan_key))].filter((k) => !P || k !== P.k);
    const M = { k: otherKeys[0], moves: movesOf(otherKeys[0]) };
    const C = { k: otherKeys[1], moves: movesOf(otherKeys[1]) };
    const R = { k: otherKeys[2], moves: movesOf(otherKeys[2]) };
    check('run produced a room-freeing ≥2-move plan + ≥3 others (for the lifecycle tests)', !!P && otherKeys.length >= 3);

    // ── reject one PENDING suggestion of plan R (before any approval) ──
    const rjSug = R.moves[0];
    const rres = await engine.rejectSuggestion(rjSug.id, admin.id, 'nem szükséges');
    check('reject returned ok', rres.ok === true);
    const rst = (await q(`SELECT status, payload->>'reject_reason' AS reason FROM agent_suggestions WHERE id=$1`, [rjSug.id])).rows[0];
    check('rejected + reason archived', rst.status === 'rejected' && rst.reason === 'nem szükséges');

    // ── APPROVE plan M → creates a move ticket, ZERO room changes ──
    const mMoves = M.moves;
    const mEmp = mMoves[0].entity_id;
    const mEmpFromRoom = mMoves[0].payload.from_room_id;
    const roomsBeforeM = (await q(`SELECT id, room_id FROM employees WHERE id = ANY($1)`, [mMoves.map((s) => s.entity_id)])).rows;
    const histBefore = (await q(`SELECT COUNT(*)::int c FROM entity_status_history WHERE entity_id=$1 AND source='consolidation'`, [mEmp])).rows[0].c;
    const ap = await engine.approvePlan(run.run_id, M.k, { ...approveOpts, dueDate: '2026-07-20' });
    check('approvePlan returned ok + ticket', ap.ok === true && !!ap.ticket_id && !!ap.ticket_number);
    const tk = (await q(
      `SELECT t.assigned_to, t.due_date, tc.slug AS cat, ts.slug AS st
         FROM tickets t JOIN ticket_categories tc ON tc.id=t.category_id JOIN ticket_statuses ts ON ts.id=t.status_id
        WHERE t.id=$1`, [ap.ticket_id])).rows[0];
    check('move ticket: category "moving", assignee set, due set, status "new"',
      tk.cat === 'moving' && tk.assigned_to === admin.id && !!tk.due_date && tk.st === 'new');
    const mApproved = (await q(`SELECT COUNT(*)::int c FROM agent_suggestions WHERE payload->>'plan_key'=$1 AND status='approved'`, [M.k])).rows[0].c;
    check('approve set the plan\'s suggestions to "approved"', mApproved === mMoves.length);
    const roomsAfterApprove = (await q(`SELECT id, room_id FROM employees WHERE id = ANY($1)`, [mMoves.map((s) => s.entity_id)])).rows;
    const bMap = new Map(roomsBeforeM.map((r) => [r.id, r.room_id]));
    check('APPROVAL made ZERO room changes', roomsAfterApprove.every((r) => r.room_id === bMap.get(r.id)));
    const planRowM = (await q(`SELECT * FROM consolidation_plans WHERE run_id=$1 AND plan_key=$2`, [run.run_id, M.k])).rows[0];
    check('consolidation_plans row: approved_pending_move + move_count', planRowM.status === 'approved_pending_move' && planRowM.move_count === mMoves.length);
    const histAfterApprove = (await q(`SELECT COUNT(*)::int c FROM entity_status_history WHERE entity_id=$1 AND source='consolidation'`, [mEmp])).rows[0].c;
    check('approval does NOT start the stability clock (no history written yet)', histAfterApprove === histBefore);

    // ── CONFIRM with a stale plan → conflict surfaced, nothing applied ──
    await q(`UPDATE employees SET room_id=NULL WHERE id=$1`, [mEmp]); // simulate "the dolgozó left / lost their room"
    const confConflict = await engine.confirmMove(run.run_id, M.k, { decisions: [], reviewedBy: admin.id });
    check('confirm re-validates → surfaces CONFLICT (does not fail silently)',
      confConflict.ok === false && confConflict.error === 'conflict' && confConflict.conflicts.some((c) => c.employee_id === mEmp));
    const stillApproved = (await q(`SELECT COUNT(*)::int c FROM agent_suggestions WHERE payload->>'plan_key'=$1 AND status='approved'`, [M.k])).rows[0].c;
    check('conflict left EVERYTHING unapplied', stillApproved === mMoves.length);
    await q(`UPDATE employees SET room_id=$2 WHERE id=$1`, [mEmp, mEmpFromRoom]); // restore

    // ── CONFIRM all-done → moves applied NOW, ticket closed, stability starts ──
    const confM = await engine.confirmMove(run.run_id, M.k, { decisions: [], reviewedBy: admin.id });
    check('confirm(all done) ok', confM.ok === true && confM.applied === mMoves.length && confM.skipped === 0 && confM.status === 'moved');
    const mEmpAfter = (await q(`SELECT room_id FROM employees WHERE id=$1`, [mEmp])).rows[0].room_id;
    check('CONFIRM applied the room change (not before)', mEmpAfter === mMoves[0].payload.to_room_id);
    const mAllApplied = (await q(`SELECT COUNT(*)::int c FROM agent_suggestions WHERE payload->>'plan_key'=$1 AND status='applied'`, [M.k])).rows[0].c;
    check('all plan-M suggestions are "applied"', mAllApplied === mMoves.length);
    const planRowM2 = (await q(`SELECT status, applied_count, confirmed_at FROM consolidation_plans WHERE run_id=$1 AND plan_key=$2`, [run.run_id, M.k])).rows[0];
    check('plan status → "moved" + confirmed_at set', planRowM2.status === 'moved' && planRowM2.applied_count === mMoves.length && !!planRowM2.confirmed_at);
    const mTicketSt = (await q(`SELECT ts.slug FROM tickets t JOIN ticket_statuses ts ON ts.id=t.status_id WHERE t.id=$1`, [ap.ticket_id])).rows[0].slug;
    check('move ticket closed as "completed"', mTicketSt === 'completed');
    const histAfterConfirm = (await q(`SELECT COUNT(*)::int c FROM entity_status_history WHERE entity_id=$1 AND source='consolidation' AND metadata->>'kind'='room'`, [mEmp])).rows[0].c;
    check('CONFIRM starts the stability clock (room history written now)', histAfterConfirm >= 1);
    // committed DB: every room plan M composed is valid
    const mToRooms = [...new Set(mMoves.map((s) => s.payload.to_room_id))];
    const postM = (await q(`SELECT e.room_id, e.gender, e.shift_schedule AS shift, r.beds FROM employees e JOIN accommodation_rooms r ON r.id=e.room_id WHERE e.room_id=ANY($1) AND e.end_date IS NULL`, [mToRooms])).rows;
    const postMByRoom = new Map();
    for (const e of postM) { if (!postMByRoom.has(e.room_id)) postMByRoom.set(e.room_id, []); postMByRoom.get(e.room_id).push(e); }
    let postMBad = 0; for (const [, mem] of postMByRoom) if (mem.length > mem[0].beds || !engine.groupValid(mem, MATRIX)) postMBad++;
    check('committed DB: every room plan M composed is valid', postMBad === 0);

    // ── PARTIAL: approve plan P, confirm with ONE move unchecked ──
    const pMoves = P.moves;
    // safe skip: a mover OUT of a room nobody moves INTO (a to-be-freed room) — leaving
    // them there cannot overflow a destination. Such a move exists because P frees a room.
    const pToRooms = new Set(pMoves.map((s) => s.payload.to_room_id));
    const skip = pMoves.find((s) => !pToRooms.has(s.payload.from_room_id));
    check('partial test: a safely-skippable move exists (out of a to-be-freed room)', !!skip);
    const keep = pMoves.find((s) => s.id !== skip.id);
    const skipFromRoom = skip.payload.from_room_id;
    const apP = await engine.approvePlan(run.run_id, P.k, { ...approveOpts, dueDate: '2026-07-21' });
    check('approvePlan (P) ok', apP.ok === true);
    const confP = await engine.confirmMove(run.run_id, P.k, { decisions: [{ suggestion_id: skip.id, done: false, reason: 'a dolgozó szabadságon' }], reviewedBy: admin.id });
    check('partial confirm ok → partially_moved', confP.ok === true && confP.applied === pMoves.length - 1 && confP.skipped === 1 && confP.status === 'partially_moved');
    const skRow = (await q(`SELECT status, payload->>'skip_reason' AS r FROM agent_suggestions WHERE id=$1`, [skip.id])).rows[0];
    check('skipped move: status "skipped" + reason logged', skRow.status === 'skipped' && skRow.r === 'a dolgozó szabadságon');
    const skEmpRoom = (await q(`SELECT room_id FROM employees WHERE id=$1`, [skip.entity_id])).rows[0].room_id;
    check('skipped move applied NO room change', skEmpRoom === skipFromRoom);
    const keepEmpRoom = (await q(`SELECT room_id FROM employees WHERE id=$1`, [keep.entity_id])).rows[0].room_id;
    check('a checked move in the same plan WAS applied', keepEmpRoom === keep.payload.to_room_id);
    const planRowP = (await q(`SELECT status, skipped_count FROM consolidation_plans WHERE run_id=$1 AND plan_key=$2`, [run.run_id, P.k])).rows[0];
    check('plan P status → "partially_moved" (skipped_count=1)', planRowP.status === 'partially_moved' && planRowP.skipped_count === 1);

    // ── CANCEL: approve plan C, cancel it → ticket closed, ZERO changes ──
    const cMoves = C.moves;
    const cEmp = cMoves[0].entity_id;
    const cFromRoom = cMoves[0].payload.from_room_id;
    const apC = await engine.approvePlan(run.run_id, C.k, approveOpts);
    check('approvePlan (C) ok', apC.ok === true);
    const canC = await engine.cancelPlan(run.run_id, C.k, admin.id);
    check('cancelPlan ok', canC.ok === true);
    const cSug = (await q(`SELECT COUNT(*)::int c FROM agent_suggestions WHERE payload->>'plan_key'=$1 AND status='cancelled'`, [C.k])).rows[0].c;
    check('cancel set suggestions → "cancelled"', cSug === cMoves.length);
    const cEmpRoom = (await q(`SELECT room_id FROM employees WHERE id=$1`, [cEmp])).rows[0].room_id;
    check('CANCEL applied NO room change', cEmpRoom === cFromRoom);
    const cTicketSt = (await q(`SELECT ts.slug FROM tickets t JOIN ticket_statuses ts ON ts.id=t.status_id WHERE t.id=$1`, [apC.ticket_id])).rows[0].slug;
    check('cancelled plan\'s ticket closed as "closed_unsuccessful"', cTicketSt === 'closed_unsuccessful');
    const planRowC = (await q(`SELECT status FROM consolidation_plans WHERE run_id=$1 AND plan_key=$2`, [run.run_id, C.k])).rows[0];
    check('plan C status → "cancelled"', planRowC.status === 'cancelled');

    // ── re-confirming an already-moved plan is refused ──
    const reConf = await engine.confirmMove(run.run_id, M.k, { decisions: [], reviewedBy: admin.id });
    check('re-confirm refused (plan not pending-move)', reConf.ok === false);

    // ── STABILITY end-to-end: the just-MOVED (confirmed) employees are frozen next run ──
    const movedIds = new Set(mMoves.map((s) => s.entity_id));
    const run2 = await engine.generateRun(null);
    const sugg2 = await engine.getSuggestions(run2.run_id);
    const reSuggested = sugg2.filter((s) => movedIds.has(s.entity_id));
    check('stability (e2e): confirmed-moved employees not re-suggested within 60 days', reSuggested.length === 0);
  } finally {
    // Restore the sandbox to its pre-test state (idempotent + non-destructive).
    for (const e of snapshot) {
      await q(`UPDATE employees SET room_id=$2, room_number=$3, accommodation_id=$4 WHERE id=$1`,
        [e.id, e.room_id, e.room_number, e.accommodation_id]).catch(() => {});
    }
    await q(`DELETE FROM consolidation_plans`).catch(() => {});
    await q(`DELETE FROM ticket_history WHERE ticket_id IN (SELECT id FROM tickets WHERE title LIKE 'Konszolidációs%')`).catch(() => {});
    await q(`DELETE FROM tickets WHERE title LIKE 'Konszolidációs%'`).catch(() => {});
    await q(`DELETE FROM agent_suggestions WHERE agent_name='room_consolidation'`).catch(() => {});
    await q(`DELETE FROM consolidation_runs`).catch(() => {});
    await q(`DELETE FROM entity_status_history WHERE source='consolidation'`).catch(() => {});
    await pool.end();
  }
  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
