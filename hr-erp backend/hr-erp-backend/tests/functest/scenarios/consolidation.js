/**
 * CONSOLIDATION — hard constraints proven INDEPENDENTLY, plus the approve/reject lifecycle.
 *
 * CONS-06 is the important one: it does not trust the engine's own validator. It replays
 * every suggestion of a full run into a simulated post-state, then re-derives gender,
 * shift, workplace, capacity and same-accommodation from raw employee/room rows. If the
 * engine ever emits an unsafe move, this catches it even if `groupValid` is the thing
 * that broke.
 *
 * The run covers the WHOLE sandbox — the base seed's 310 employees with their deliberately
 * mixed-gender / cross-shift / empty-shift rooms, plus this fixture's three exact sites.
 *
 * Three requested constraints do not exist in engine v1 and are reported as KNOWN-GAP:
 * a do-not-move LOCK, a 60-day move-stability window, and an approve→ticket→confirm
 * lifecycle (apply writes room_id directly). See docs/FUNCTEST_PLAN.md.
 */
module.exports = {
  area: 'CONSOLIDATION',
  title: 'hard constraints (independently re-verified) · approve / reject / partial completion',

  async setup(ctx) {
    const engine = require('../../../src/services/consolidationEngine.service');
    const cfg = await engine.getConfig();
    const run = await engine.generateRun(null);
    const suggestions = await engine.getSuggestions(run.run_id);
    return { engine, cfg, matrix: cfg.shift_compatibility, run, suggestions, applied: null };
  },

  cases: [
    {
      id: 'CONS-01',
      name: 'shift matrix is IDENTITY — every cross-shift pairing incompatible, empty shift compatible with nobody',
      expected: { same_shift_ok: true, cross_shift_blocked: true, empty_vs_known: false, empty_vs_empty: false },
      run: async (ctx, st) => {
        const S = ['delelott', 'delutan', 'ejszaka', 'valtott'];
        const { compatible, shiftBucket } = st.engine;
        return {
          same_shift_ok: S.every((s) => compatible(s, s, st.matrix) === true),
          cross_shift_blocked: S.every((a) => S.every((b) => (a === b) === compatible(a, b, st.matrix))),
          empty_vs_known: compatible(shiftBucket(null), 'delelott', st.matrix),
          empty_vs_empty: compatible(shiftBucket(null), shiftBucket(''), st.matrix),
        };
      },
    },
    {
      id: 'CONS-02',
      name: 'groupValid rejects mixed gender / cross-shift / mixed workplace, allows an identical cohort',
      expected: { mixed_gender: false, cross_shift: false, mixed_workplace: false, identical: true },
      run: async (ctx, st) => {
        const g = (m) => st.engine.groupValid(m, st.matrix);
        const base = { gender: 'male', shift: 'delelott', workplace: 'FT Audi' };
        return {
          mixed_gender: g([base, { ...base, gender: 'female' }]),
          cross_shift: g([base, { ...base, shift: 'ejszaka' }]),
          mixed_workplace: g([base, { ...base, workplace: 'FT Mercedes' }]),
          identical: g([base, { ...base }]),
        };
      },
    },
    {
      id: 'CONS-03',
      name: 'solvable site — 4 identical residents in 4 two-bed rooms → 2 rooms freed, 2 moves',
      expected: { freed_rooms: 2, moves: 2, freed_beds: 4 },
      hint: 'greedy: largest cohort → largest rooms, residents kept in place where possible',
      run: async (ctx, st) => {
        const a = st.run.summary.by_accommodation.find((x) => x.accommodation_id === ctx.ids.acc.consSolve);
        return a ? { freed_rooms: a.freed_rooms, moves: a.moves, freed_beds: a.freed_beds } : { missing: true };
      },
    },
    {
      id: 'CONS-04',
      name: 'cross-shift site is BLOCKED — no proposal at all for it',
      expected: { proposed: false, suggestions_for_site: 0 },
      run: async (ctx, st) => ({
        proposed: !!st.run.summary.by_accommodation.find((x) => x.accommodation_id === ctx.ids.acc.consBlock),
        suggestions_for_site: st.suggestions.filter((s) => s.payload.accommodation_id === ctx.ids.acc.consBlock).length,
      }),
    },
    {
      id: 'CONS-05',
      name: 'incomplete data — the shift-less resident is FLAGGED, never moved; the rest still consolidate',
      expected: { flagged: true, moved: false, freed_rooms: 1 },
      run: async (ctx, st) => {
        const id = ctx.ids.emp.consFlagIncomplete;
        const a = st.run.summary.by_accommodation.find((x) => x.accommodation_id === ctx.ids.acc.consFlag);
        return {
          flagged: st.run.summary.flagged_incomplete.some((f) => f.employee_id === id),
          moved: st.suggestions.some((s) => s.entity_id === id),
          freed_rooms: a ? a.freed_rooms : 0,
        };
      },
    },
    {
      id: 'CONS-06',
      name: 'INDEPENDENT re-verification of EVERY suggestion in a full run → zero constraint violations',
      expected: { gender_violations: 0, shift_violations: 0, workplace_violations: 0, capacity_violations: 0, cross_accommodation: 0 },
      hint: 'replays all suggestions into a simulated post-state and re-derives constraints from raw rows',
      sql: [
        "-- what the engine proposed, and where each person would land:",
        "SELECT s.entity_id, s.payload->>'from_room_id' AS from_room, s.payload->>'to_room_id' AS to_room",
        "  FROM agent_suggestions s WHERE s.agent_name='room_consolidation';",
      ],
      run: async (ctx, st) => {
        // Raw current state — read directly, NOT via the engine.
        const emps = (await ctx.query(
          `SELECT e.id, e.gender, e.shift_schedule AS shift, e.workplace, e.room_id, e.accommodation_id
             FROM employees e
             JOIN employee_status_types est ON est.id = e.status_id AND est.slug='active'
            WHERE e.end_date IS NULL AND e.room_id IS NOT NULL`)).rows;
        const rooms = (await ctx.query(`SELECT id, accommodation_id, beds FROM accommodation_rooms WHERE is_active = TRUE`)).rows;
        const roomAcc = new Map(rooms.map((r) => [r.id, r.accommodation_id]));
        const roomBeds = new Map(rooms.map((r) => [r.id, Number(r.beds)]));
        const state = new Map(emps.map((e) => [e.id, { ...e }]));

        // Apply every proposal to the simulated state.
        let crossAcc = 0;
        for (const s of st.suggestions) {
          const e = state.get(s.entity_id);
          if (!e) continue;
          if (roomAcc.get(s.payload.to_room_id) !== e.accommodation_id) crossAcc++;
          e.room_id = s.payload.to_room_id;
        }

        // Re-derive every hard constraint from scratch on the touched sites.
        const touched = new Set(st.suggestions.map((s) => s.payload.accommodation_id));
        const byRoom = new Map();
        for (const e of state.values()) {
          if (!touched.has(e.accommodation_id)) continue;
          if (!byRoom.has(e.room_id)) byRoom.set(e.room_id, []);
          byRoom.get(e.room_id).push(e);
        }
        const KNOWN = ['delelott', 'delutan', 'ejszaka', 'valtott'];
        let gender = 0, shift = 0, workplace = 0, capacity = 0;
        for (const [rid, members] of byRoom) {
          if (members.length > (roomBeds.get(rid) ?? 0)) capacity++;
          if (new Set(members.map((m) => m.gender)).size > 1) gender++;
          // placeable = complete data; incomplete residents are pinned + flagged, not a conflict
          const placeable = members.filter((m) => KNOWN.includes(m.shift) && !!m.workplace);
          if (new Set(placeable.map((m) => m.shift)).size > 1) shift++;
          if (new Set(placeable.map((m) => m.workplace)).size > 1) workplace++;
        }
        return {
          gender_violations: gender, shift_violations: shift, workplace_violations: workplace,
          capacity_violations: capacity, cross_accommodation: crossAcc,
          _checked: { suggestions: st.suggestions.length, rooms: byRoom.size, sites: touched.size },
        };
      },
    },
    {
      id: 'CONS-07',
      name: 'no incomplete-data employee appears in ANY suggestion of the full run',
      expected: { flagged_in_moves: 0, flagged_total_gt0: true },
      run: async (ctx, st) => {
        const flagged = new Set(st.run.summary.flagged_incomplete.map((f) => f.employee_id));
        return {
          flagged_in_moves: st.suggestions.filter((s) => flagged.has(s.entity_id)).length,
          flagged_total_gt0: flagged.size > 0,
        };
      },
    },
    {
      id: 'CONS-08',
      name: 'approve one site → room_id applied, suggestions marked applied, move logged in history',
      expected: { ok: true, applied: 2, room_changed: true, status: 'applied', history_logged: true },
      run: async (ctx, st) => {
        const acc = ctx.ids.acc.consSolve;
        const plan = st.suggestions.filter((s) => s.payload.accommodation_id === acc);
        if (plan.length === 0) return { ok: false, error: 'no plan for the solvable site' };
        const sample = plan[0];
        const before = (await ctx.query(`SELECT room_id FROM employees WHERE id=$1`, [sample.entity_id])).rows[0].room_id;
        const res = await st.engine.applyGroup(st.run.run_id, acc, null);
        st.applied = { acc, plan };
        const after = (await ctx.query(`SELECT room_id FROM employees WHERE id=$1`, [sample.entity_id])).rows[0].room_id;
        const sug = (await ctx.query(`SELECT status FROM agent_suggestions WHERE id=$1`, [sample.id])).rows[0];
        // history is written best-effort post-commit
        await new Promise((r) => setTimeout(r, 150));
        const hist = (await ctx.query(
          `SELECT to_status FROM entity_status_history WHERE entity_id=$1 AND source='consolidation' ORDER BY changed_at DESC LIMIT 1`,
          [sample.entity_id])).rows[0];
        return {
          ok: res.ok, applied: res.applied,
          room_changed: after === sample.payload.to_room_id && after !== before,
          status: sug.status,
          history_logged: !!hist && hist.to_status === sample.payload.to_room_id,
        };
      },
    },
    {
      id: 'CONS-09',
      name: 'PARTIAL completion — approving one site leaves the run partially_applied, other sites pending',
      expected: { run_status: 'partially_applied', other_sites_still_pending: true },
      run: async (ctx, st) => {
        const run = (await ctx.query(`SELECT status FROM consolidation_runs WHERE id=$1`, [st.run.run_id])).rows[0];
        const pending = (await ctx.query(
          `SELECT COUNT(*)::int c FROM agent_suggestions
            WHERE agent_name='room_consolidation' AND payload->>'run_id'=$1 AND status='pending'`, [st.run.run_id])).rows[0].c;
        return { run_status: run.status, other_sites_still_pending: pending > 0 };
      },
    },
    {
      id: 'CONS-10',
      name: 'reject archives with a reason and never applies the move',
      expected: { ok: true, status: 'rejected', reason: 'functest: nem szükséges', room_unchanged: true },
      run: async (ctx, st) => {
        const target = st.suggestions.find((s) => s.payload.accommodation_id !== st.applied?.acc && s.status === 'pending');
        if (!target) return { ok: false, error: 'no other pending suggestion' };
        const before = (await ctx.query(`SELECT room_id FROM employees WHERE id=$1`, [target.entity_id])).rows[0].room_id;
        const res = await st.engine.rejectSuggestion(target.id, null, 'functest: nem szükséges');
        const row = (await ctx.query(`SELECT status, payload->>'reject_reason' AS reason FROM agent_suggestions WHERE id=$1`, [target.id])).rows[0];
        const after = (await ctx.query(`SELECT room_id FROM employees WHERE id=$1`, [target.entity_id])).rows[0].room_id;
        return { ok: res.ok, status: row.status, reason: row.reason, room_unchanged: before === after };
      },
    },
    {
      id: 'CONS-11',
      name: 'committed DB after apply — the approved site has ZERO invalid rooms',
      expected: { invalid_rooms: 0, rooms_now_occupied: 2 },
      run: async (ctx, st) => {
        const rows = (await ctx.query(
          `SELECT e.room_id, e.gender, e.shift_schedule AS shift, e.workplace, r.beds
             FROM employees e JOIN accommodation_rooms r ON r.id = e.room_id
            WHERE e.accommodation_id=$1 AND e.end_date IS NULL`, [ctx.ids.acc.consSolve])).rows;
        const byRoom = new Map();
        for (const e of rows) { if (!byRoom.has(e.room_id)) byRoom.set(e.room_id, []); byRoom.get(e.room_id).push(e); }
        let bad = 0;
        for (const [, m] of byRoom) {
          if (m.length > Number(m[0].beds)) bad++;
          else if (new Set(m.map((x) => x.gender)).size > 1) bad++;
          else if (new Set(m.map((x) => x.shift)).size > 1) bad++;
          else if (new Set(m.map((x) => x.workplace)).size > 1) bad++;
        }
        return { invalid_rooms: bad, rooms_now_occupied: byRoom.size };
      },
    },
    {
      id: 'CONS-12',
      name: 're-applying the same site is refused (nothing pending)',
      expected: { ok: false, error: 'nothing_pending' },
      run: async (ctx, st) => {
        const res = await st.engine.applyGroup(st.run.run_id, ctx.ids.acc.consSolve, null);
        return { ok: res.ok, error: res.error };
      },
    },

    /* ── constraints that engine v1 does not implement ── */
    {
      id: 'CONS-13',
      name: 'LOCK constraint — a locked resident must never be proposed for a move',
      gap: 'NOT BUILT — engine v1 has no do-not-move flag on employees or agent_suggestions (migs 133–135 are sandbox-only, not in this repo)',
      expected: { lock_field_exists: true },
      hint: 'to close: add employees.consolidation_locked (or a pin table), exclude in consolidateAccommodation() the same way flagged-incomplete residents are pinned',
      run: async (ctx) => {
        const r = await ctx.query(
          `SELECT COUNT(*)::int c FROM information_schema.columns
            WHERE table_name='employees' AND column_name IN ('consolidation_locked','is_locked','do_not_move','move_locked')`);
        return { lock_field_exists: r.rows[0].c > 0 };
      },
    },
    {
      id: 'CONS-14',
      name: '60-DAY STABILITY — a resident moved recently must not be moved again inside the window',
      gap: 'NOT BUILT — consolidation_config has no stability window and the engine never reads move recency',
      expected: { stability_window_days: 60, engine_reads_move_history: true },
      hint: 'to close: add consolidation_config.stability_days, and exclude employees with an entity_status_history consolidation move inside the window',
      run: async (ctx, st) => {
        const cols = (await ctx.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name='consolidation_config'`)).rows.map((r) => r.column_name);
        const stability = cols.find((c) => /stab|recen|cooldown|window/i.test(c));
        return {
          stability_window_days: stability ? Number(st.cfg[stability]) : null,
          engine_reads_move_history: false, // consolidationEngine.service.js never queries entity_status_history on read
        };
      },
    },
    {
      id: 'CONS-15',
      name: 'approve → TICKET → confirm → room change (staged lifecycle)',
      gap: 'NOT BUILT — applyGroup writes employees.room_id directly in one transaction; no ticket, no confirmation step',
      expected: { approve_creates_ticket: true, room_change_awaits_confirmation: true },
      hint: 'today the only staging is agent_suggestions.status pending→applied; partial completion exists at RUN level (CONS-09)',
      run: async (ctx, st) => {
        const tickets = (await ctx.query(
          `SELECT COUNT(*)::int c FROM tickets WHERE created_at > NOW() - INTERVAL '5 minutes' AND (title ILIKE '%konszolid%' OR title ILIKE '%szoba%')`)).rows[0].c;
        // CONS-08 already proved the room_id changed the instant approve ran.
        return { approve_creates_ticket: tickets > 0, room_change_awaits_confirmation: false };
      },
    },
  ],
};
