/**
 * Regression: Room Consolidation Suggestion Engine v1 (SANDBOX only).
 *
 * The sandbox was seeded with edge cases on purpose (mixed-gender rooms,
 * day/night conflicts, over-capacity, under-utilized sites). This proves the
 * HARD constraints hold on ALL suggestions, then demos a full
 * run → approve → verify flow.
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
    // ── unit: the compatibility matrix + group validator ──
    const cfg = await engine.getConfig();
    const m = cfg.shift_compatibility;
    check('matrix: day+night NOT compatible', engine.compatible('day', 'night', m) === false);
    check('matrix: flexible+night compatible', engine.compatible('flexible', 'night', m) === true);
    check('matrix: rotating only with rotating/flexible', engine.compatible('rotating', 'day', m) === false && engine.compatible('rotating', 'flexible', m) === true);
    check('groupValid rejects mixed gender', engine.groupValid([{ gender: 'male', shift: 'day' }, { gender: 'female', shift: 'day' }], m) === false);
    check('groupValid rejects day+night', engine.groupValid([{ gender: 'male', shift: 'day' }, { gender: 'male', shift: 'night' }], m) === false);
    check('groupValid allows day+flexible same gender', engine.groupValid([{ gender: 'male', shift: 'day' }, { gender: 'male', shift: 'flexible' }], m) === true);

    // ── run the engine on the full seeded sandbox ──
    const run = await engine.generateRun(null);
    check('engine produced a run', !!run.run_id);
    check('engine proposed ≥1 move', run.total_moves >= 1);
    check('engine frees ≥1 room', run.freed_rooms >= 1);
    console.log(`      → run ${run.run_id}: ${run.total_moves} moves, frees ${run.freed_rooms} rooms / ${run.freed_beds} beds across ${run.summary.by_accommodation.length} sites`);

    const suggestions = await engine.getSuggestions(run.run_id);
    check('suggestions persisted in agent_suggestions', suggestions.length === run.total_moves);

    // ── HARD CONSTRAINT PROOF: simulate applying ALL suggestions of this run,
    //    then assert every resulting room is single-gender, shift-compatible,
    //    within capacity, and same-accommodation. ──
    // Start from the CURRENT room assignment of every active employee, layer the
    // proposed moves on top (in-memory), and validate the final room composition.
    const emps = (await q(
      `SELECT e.id, e.gender, e.shift_schedule AS shift, e.room_id, e.accommodation_id
         FROM employees e JOIN employee_status_types est ON est.id=e.status_id AND est.slug='active'
        WHERE e.end_date IS NULL AND e.room_id IS NOT NULL`)).rows;
    const rooms = (await q(`SELECT id, accommodation_id, beds FROM accommodation_rooms WHERE is_active=TRUE`)).rows;
    const roomAcc = new Map(rooms.map(r => [r.id, r.accommodation_id]));
    const roomBeds = new Map(rooms.map(r => [r.id, r.beds]));
    const state = new Map(emps.map(e => [e.id, { ...e }]));

    // Accommodations the engine ACTED on. v1 consolidates only sites where it can
    // free a room; a suggestion may never create a violation in the site it touches.
    // (Sites it skips keep their pre-existing seeded state — not something a
    //  suggestion produced, so they're out of scope for this proof.)
    const touchedAcc = new Set(suggestions.map(s => s.payload.accommodation_id));

    let sameAccomViolation = 0;
    for (const s of suggestions) {
      const p = s.payload;
      const e = state.get(s.entity_id);
      if (roomAcc.get(p.to_room_id) !== e.accommodation_id) sameAccomViolation++;
      e.room_id = p.to_room_id;
    }
    check('every move stays within the same accommodation', sameAccomViolation === 0);

    // Validate every room in the TOUCHED accommodations after applying ALL moves.
    const byRoom = new Map();
    for (const e of state.values()) {
      if (!touchedAcc.has(e.accommodation_id)) continue;
      if (!byRoom.has(e.room_id)) byRoom.set(e.room_id, []);
      byRoom.get(e.room_id).push(e);
    }
    let genderBad = 0, shiftBad = 0, capBad = 0;
    for (const [rid, members] of byRoom) {
      if (members.length > roomBeds.get(rid)) capBad++;
      const g = members[0].gender;
      if (members.some(x => x.gender !== g)) genderBad++;
      if (!engine.groupValid(members, m)) shiftBad++; // gender+shift combined
    }
    check('NO mixed-gender room in any touched site after applying ALL suggestions', genderBad === 0);
    check('NO day/night (shift) conflict in any touched site after applying ALL suggestions', shiftBad === 0);
    check('NO room over bed capacity after applying ALL suggestions', capBad === 0);

    // Prove the engine REPAIRS what it touches: touched sites had real conflicts
    // pre-move; zero remain post-move.
    const rawByRoom = new Map();
    for (const e of emps) {
      if (!touchedAcc.has(e.accommodation_id)) continue;
      if (!rawByRoom.has(e.room_id)) rawByRoom.set(e.room_id, []); rawByRoom.get(e.room_id).push(e);
    }
    let seededBadTouched = 0;
    for (const [, members] of rawByRoom) if (!engine.groupValid(members, m)) seededBadTouched++;
    check(`touched sites had real conflicts pre-move (${seededBadTouched}) → 0 after`, seededBadTouched > 0 && genderBad === 0 && shiftBad === 0);

    // ── reject one suggestion (before applying) ──
    const rj = suggestions[0];
    const rres = await engine.rejectSuggestion(rj.id, null, 'nem szükséges');
    check('reject returned ok', rres.ok === true);
    const rst = (await q(`SELECT status, payload->>'reject_reason' AS reason FROM agent_suggestions WHERE id=$1`, [rj.id])).rows[0];
    check('rejected + reason archived', rst.status === 'rejected' && rst.reason === 'nem szükséges');

    // ── FULL FLOW: approve (atomic apply) a whole accommodation's plan → room_id
    //    changes applied together + logged; final state validated. Use a site
    //    OTHER than the rejected one, so the plan is complete. ──
    const targetAcc = suggestions.find(s => s.payload.accommodation_id !== rj.payload.accommodation_id).payload.accommodation_id;
    const planMoves = suggestions.filter(s => s.payload.accommodation_id === targetAcc);
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
    for (const [, mem] of postByRoom) if (mem.length > mem[0].beds || !engine.groupValid(mem, m)) postBad++;
    check('committed DB: applied site has ZERO invalid rooms', postBad === 0);

    // ── re-applying the same site is refused (nothing pending) ──
    const again = await engine.applyGroup(run.run_id, targetAcc, null);
    check('re-apply refused (nothing pending)', again.ok === false);
  } finally {
    // clean up this test's suggestions + runs (leave employees as-is; sandbox is disposable)
    await q(`DELETE FROM agent_suggestions WHERE agent_name='room_consolidation'`).catch(()=>{});
    await q(`DELETE FROM consolidation_runs`).catch(()=>{});
    await pool.end();
  }
  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
