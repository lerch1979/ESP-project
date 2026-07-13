/**
 * Regression: Room Consolidation Suggestion Engine (SANDBOX only).
 *
 * THREE-shift model (mig 137): delelott | delutan | ejszaka | valtott, SAME SHIFT
 * ONLY may share a room; an EMPTY shift is incompatible with everyone → those
 * employees are flagged for data entry and NEVER moved. Proves:
 *   1. the compatibility matrix + group validator (incl. empty = incompatible),
 *   2. deterministic scenarios: same-shift consolidates, cross-shift is blocked,
 *      empty-shift is flagged-not-moved,
 *   3. HARD constraints hold on ALL suggestions from a full seeded run,
 *   4. a full run → reject → approve → verify flow.
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

(async () => {
  try {
    // ── unit: the compatibility matrix + group validator (SAME SHIFT ONLY) ──
    const cfg = await engine.getConfig();
    const m = cfg.shift_compatibility;
    check('matrix: delelott+ejszaka NOT compatible (cross-shift)', engine.compatible('delelott', 'ejszaka', m) === false);
    check('matrix: same shift compatible (ejszaka+ejszaka)', engine.compatible('ejszaka', 'ejszaka', m) === true);
    check('matrix: valtott only with valtott', engine.compatible('valtott', 'delelott', m) === false && engine.compatible('valtott', 'valtott', m) === true);
    check('matrix: every cross-shift pair is incompatible',
      ['delelott', 'delutan', 'ejszaka', 'valtott'].every((a, i, arr) => arr.every((b) => (a === b) === engine.compatible(a, b, m))));
    check('shiftBucket: known slug passes, empty/unknown → null', engine.shiftBucket('delelott') === 'delelott' && engine.shiftBucket(null) === null && engine.shiftBucket('') === null && engine.shiftBucket('day') === null);
    check('groupValid rejects mixed gender', engine.groupValid([{ gender: 'male', shift: 'delelott' }, { gender: 'female', shift: 'delelott' }], m) === false);
    check('groupValid rejects cross-shift (delelott+ejszaka)', engine.groupValid([{ gender: 'male', shift: 'delelott' }, { gender: 'male', shift: 'ejszaka' }], m) === false);
    check('groupValid allows same-shift same-gender (ejszaka+ejszaka)', engine.groupValid([{ gender: 'male', shift: 'ejszaka' }, { gender: 'male', shift: 'ejszaka' }], m) === true);
    check('groupValid: EMPTY shift is never placed with anyone', engine.groupValid([{ gender: 'male', shift: 'ejszaka' }, { gender: 'male', shift: null }], m) === false);
    check('groupValid: two EMPTY shifts still incompatible', engine.groupValid([{ gender: 'male', shift: null }, { gender: 'male', shift: null }], m) === false);

    // ── deterministic scenarios on consolidateAccommodation (no random seed) ──
    // A) same-shift: two half-full same-shift rooms merge → 1 freed.
    const twoRooms = [{ id: 'r1', beds: 2 }, { id: 'r2', beds: 2 }];
    const same = engine.consolidateAccommodation(twoRooms, [
      { id: 'a', gender: 'male', shift: 'delelott', room_id: 'r1' },
      { id: 'b', gender: 'male', shift: 'delelott', room_id: 'r2' },
    ], m);
    check('A) same-shift consolidates → 1 room freed, 1 move', same.valid && same.freedRooms.length === 1 && same.moves.length === 1);

    // B) cross-shift: different shifts in 2 rooms — must NOT merge (0 freed, 0 moves).
    const cross = engine.consolidateAccommodation(twoRooms, [
      { id: 'a', gender: 'male', shift: 'delelott', room_id: 'r1' },
      { id: 'b', gender: 'male', shift: 'ejszaka', room_id: 'r2' },
    ], m);
    check('B) cross-shift is BLOCKED → 0 rooms freed, 0 moves', cross.valid && cross.freedRooms.length === 0 && cross.moves.length === 0);

    // C) empty-shift: flagged + never moved + its room never freed, while known-shift
    //    residents still consolidate around it.
    const threeRooms = [{ id: 'r1', beds: 2 }, { id: 'r2', beds: 2 }, { id: 'r3', beds: 2 }];
    const withEmpty = engine.consolidateAccommodation(threeRooms, [
      { id: 'a', gender: 'male', shift: 'delelott', room_id: 'r1' },
      { id: 'b', gender: 'male', shift: 'delelott', room_id: 'r2' },
      { id: 'x', gender: 'male', shift: null, room_id: 'r3' }, // empty shift, alone in r3
    ], m);
    check('C) empty-shift employee is FLAGGED', (withEmpty.flaggedUnknownShift || []).includes('x'));
    check('C) empty-shift employee is NEVER moved', !withEmpty.moves.some((mv) => mv.employee_id === 'x'));
    check('C) known-shift residents still consolidate (1 freed), empty room kept', withEmpty.valid && withEmpty.freedRooms.length === 1 && !withEmpty.freedRooms.includes('r3'));

    // ── run the engine on the full seeded sandbox ──
    const run = await engine.generateRun(null);
    check('engine produced a run', !!run.run_id);
    check('engine proposed ≥1 move', run.total_moves >= 1);
    check('engine frees ≥1 room', run.freed_rooms >= 1);
    check('empty-shift employees were flagged for data entry', run.summary.flagged_unknown_shift_count >= 1);
    console.log(`      → run ${run.run_id}: ${run.total_moves} moves, frees ${run.freed_rooms} rooms / ${run.freed_beds} beds; ${run.summary.flagged_unknown_shift_count} empty-shift flagged`);

    const suggestions = await engine.getSuggestions(run.run_id);
    check('suggestions persisted in agent_suggestions', suggestions.length === run.total_moves);

    // No suggestion may target a flagged (empty-shift) employee.
    const flaggedIds = new Set((run.summary.flagged_unknown_shift || []).map((f) => f.employee_id));
    check('NO empty-shift employee appears in any move', suggestions.every((s) => !flaggedIds.has(s.entity_id)));

    // ── HARD CONSTRAINT PROOF: simulate applying ALL suggestions, then assert every
    //    touched room is single-gender, within capacity, same-accommodation, and has
    //    ONE shift among its KNOWN-shift residents (empty-shift are pinned + flagged). ──
    const emps = (await q(
      `SELECT e.id, e.gender, e.shift_schedule AS shift, e.room_id, e.accommodation_id
         FROM employees e JOIN employee_status_types est ON est.id=e.status_id AND est.slug='active'
        WHERE e.end_date IS NULL AND e.room_id IS NOT NULL`)).rows;
    const rooms = (await q(`SELECT id, accommodation_id, beds FROM accommodation_rooms WHERE is_active=TRUE`)).rows;
    const roomAcc = new Map(rooms.map((r) => [r.id, r.accommodation_id]));
    const roomBeds = new Map(rooms.map((r) => [r.id, r.beds]));
    const state = new Map(emps.map((e) => [e.id, { ...e }]));
    const touchedAcc = new Set(suggestions.map((s) => s.payload.accommodation_id));

    let sameAccomViolation = 0;
    for (const s of suggestions) {
      const p = s.payload;
      const e = state.get(s.entity_id);
      if (roomAcc.get(p.to_room_id) !== e.accommodation_id) sameAccomViolation++;
      e.room_id = p.to_room_id;
    }
    check('every move stays within the same accommodation', sameAccomViolation === 0);

    const byRoom = new Map();
    for (const e of state.values()) {
      if (!touchedAcc.has(e.accommodation_id)) continue;
      if (!byRoom.has(e.room_id)) byRoom.set(e.room_id, []);
      byRoom.get(e.room_id).push(e);
    }
    let genderBad = 0, shiftBad = 0, capBad = 0;
    for (const [rid, members] of byRoom) {
      if (members.length > roomBeds.get(rid)) capBad++;
      if (members.some((x) => x.gender !== members[0].gender)) genderBad++;
      const known = members.filter((x) => engine.shiftBucket(x.shift) !== null);
      if (!engine.groupValid(known, m)) shiftBad++; // no two KNOWN shifts share a room
    }
    check('NO mixed-gender room in any touched site after applying ALL suggestions', genderBad === 0);
    check('NO cross-shift room (among known shifts) after applying ALL suggestions', shiftBad === 0);
    check('NO room over bed capacity after applying ALL suggestions', capBad === 0);

    // ── reject one suggestion (before applying) ──
    const rj = suggestions.find((s) => s.status === 'pending');
    const rres = await engine.rejectSuggestion(rj.id, null, 'nem szükséges');
    check('reject returned ok', rres.ok === true);
    const rst = (await q(`SELECT status, payload->>'reject_reason' AS reason FROM agent_suggestions WHERE id=$1`, [rj.id])).rows[0];
    check('rejected + reason archived', rst.status === 'rejected' && rst.reason === 'nem szükséges');

    // ── FULL FLOW: approve (atomic apply) a whole accommodation's plan ──
    const targetAcc = suggestions.find((s) => s.payload.accommodation_id !== rj.payload.accommodation_id).payload.accommodation_id;
    const planMoves = suggestions.filter((s) => s.payload.accommodation_id === targetAcc);
    const sampleEmp = planMoves[0].entity_id;
    const before = (await q(`SELECT room_id FROM employees WHERE id=$1`, [sampleEmp])).rows[0].room_id;
    const appr = await engine.applyGroup(run.run_id, targetAcc, null);
    check('applyGroup (approve accommodation plan) returned ok', appr.ok === true);
    check('applyGroup applied all that site\'s pending moves', appr.applied === planMoves.length);
    const after = (await q(`SELECT room_id FROM employees WHERE id=$1`, [sampleEmp])).rows[0].room_id;
    check('room_id change APPLIED', after === planMoves[0].payload.to_room_id && after !== before);
    const st = (await q(`SELECT status, applied_at FROM agent_suggestions WHERE id=$1`, [planMoves[0].id])).rows[0];
    check('suggestions marked applied', st.status === 'applied' && !!st.applied_at);
    const hist = (await q(
      `SELECT * FROM entity_status_history WHERE entity_id=$1 AND source='consolidation' ORDER BY changed_at DESC LIMIT 1`,
      [sampleEmp])).rows[0];
    check('move logged in entity_status_history', !!hist && hist.to_status === planMoves[0].payload.to_room_id);

    // ── the applied site is now fully valid in the committed DB ──
    const post = (await q(
      `SELECT e.room_id, e.gender, e.shift_schedule AS shift, r.beds
         FROM employees e JOIN accommodation_rooms r ON r.id=e.room_id
        WHERE e.accommodation_id=$1 AND e.end_date IS NULL`, [targetAcc])).rows;
    const postByRoom = new Map();
    for (const e of post) { if (!postByRoom.has(e.room_id)) postByRoom.set(e.room_id, []); postByRoom.get(e.room_id).push(e); }
    let postBad = 0;
    for (const [, mem] of postByRoom) {
      const known = mem.filter((x) => engine.shiftBucket(x.shift) !== null);
      if (mem.length > mem[0].beds || mem.some((x) => x.gender !== mem[0].gender) || !engine.groupValid(known, m)) postBad++;
    }
    check('committed DB: applied site has ZERO invalid rooms', postBad === 0);

    // ── re-applying the same site is refused (nothing pending) ──
    const again = await engine.applyGroup(run.run_id, targetAcc, null);
    check('re-apply refused (nothing pending)', again.ok === false);
  } finally {
    await q(`DELETE FROM agent_suggestions WHERE agent_name='room_consolidation'`).catch(() => {});
    await q(`DELETE FROM consolidation_runs`).catch(() => {});
    await pool.end();
  }
  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
