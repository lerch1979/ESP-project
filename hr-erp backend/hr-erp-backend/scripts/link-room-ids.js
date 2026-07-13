#!/usr/bin/env node
/**
 * One-shot ROOM LINKER (GAP_AUDIT 2026-07 — "room_number TEXT filled, room_id FK empty").
 *
 * Per accommodation, matches employees.room_number (free text) to a real
 * accommodation_rooms row (same accommodation, same room_number), then sets
 * employees.room_id. Rooms referenced by an employee but not yet present are
 * CREATED with beds=0 — FLAGGED for data entry (the beds column is NOT NULL, so 0
 * is the "unknown, please fill" sentinel; consolidation skips a room with beds=0).
 *
 * DRY-RUN (default) — reports only, no writes:   node link-room-ids.js
 * EXECUTE (writes, single transaction):          node link-room-ids.js --execute
 *
 * Self-contained (own pg Pool from env) so it runs unchanged inside the prod
 * backend container (docker cp + `docker compose exec -w /app backend node ...`).
 */
const { Pool } = require('pg');

const EXECUTE = process.argv.includes('--execute');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'hr_erp_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const keyOf = (accId, rn) => `${accId}|${rn}`;

(async () => {
  const client = await pool.connect();
  try {
    const rooms = (await client.query(`SELECT id, accommodation_id, TRIM(room_number) AS rn FROM accommodation_rooms`)).rows;
    const existing = new Map(rooms.map((r) => [keyOf(r.accommodation_id, r.rn), r.id]));
    const accNames = new Map((await client.query(`SELECT id, name FROM accommodations`)).rows.map((a) => [a.id, a.name]));

    const emps = (await client.query(`
      SELECT id, accommodation_id, TRIM(room_number) AS rn, room_id
        FROM employees
       WHERE end_date IS NULL AND room_number IS NOT NULL AND TRIM(room_number) <> ''`)).rows;

    const perAcc = new Map();
    const roomsToCreate = new Map(); // key -> { accId, rn }
    const empLinks = [];             // { empId, key }
    let noAccommodation = 0, alreadyLinked = 0;

    const row = (accId) => {
      if (!perAcc.has(accId)) perAcc.set(accId, { name: accNames.get(accId) || '(nincs szálláshely)', total: 0, existing: 0, newRoom: 0 });
      return perAcc.get(accId);
    };

    for (const e of emps) {
      if (e.room_id) { alreadyLinked++; continue; }
      if (!e.accommodation_id) { noAccommodation++; continue; }
      const r = row(e.accommodation_id); r.total++;
      const key = keyOf(e.accommodation_id, e.rn);
      if (existing.has(key)) { r.existing++; empLinks.push({ empId: e.id, key }); }
      else {
        if (!roomsToCreate.has(key)) roomsToCreate.set(key, { accId: e.accommodation_id, rn: e.rn });
        r.newRoom++; empLinks.push({ empId: e.id, key });
      }
    }

    // ── report ──
    console.log(`\n=== ROOM LINKER — ${EXECUTE ? 'EXECUTE (writing)' : 'DRY-RUN (no writes)'} — DB=${process.env.DB_NAME} ===\n`);
    const pad = (s, n) => String(s).padEnd(n).slice(0, n);
    console.log(pad('accommodation', 40) + pad('emps', 6) + pad('→existing', 11) + pad('→new room', 11));
    console.log('-'.repeat(68));
    const accs = [...perAcc.entries()].sort((a, b) => b[1].total - a[1].total);
    for (const [, v] of accs) console.log(pad(v.name, 40) + pad(v.total, 6) + pad(v.existing, 11) + pad(v.newRoom, 11));
    console.log('-'.repeat(68));
    const tot = [...perAcc.values()].reduce((a, v) => ({ total: a.total + v.total, existing: a.existing + v.existing, newRoom: a.newRoom + v.newRoom }), { total: 0, existing: 0, newRoom: 0 });
    console.log(pad('TOTAL', 40) + pad(tot.total, 6) + pad(tot.existing, 11) + pad(tot.newRoom, 11));
    console.log(`\nemployees to link:            ${empLinks.length}`);
    console.log(`  → to an EXISTING room:      ${tot.existing}`);
    console.log(`  → to a NEW room (beds=0):   ${tot.newRoom}   (across ${roomsToCreate.size} new rooms — NEED BED COUNTS)`);
    console.log(`already linked (skipped):     ${alreadyLinked}`);
    console.log(`NO accommodation (cannot link): ${noAccommodation}`);
    if (roomsToCreate.size) {
      console.log(`\nnew rooms that would be created (accommodation → room_number, beds=0):`);
      for (const { accId, rn } of [...roomsToCreate.values()].slice(0, 50)) console.log(`  ${accNames.get(accId) || accId} → "${rn}"`);
      if (roomsToCreate.size > 50) console.log(`  … +${roomsToCreate.size - 50} more`);
    }

    if (!EXECUTE) { console.log(`\n(DRY-RUN — nothing written. Re-run with --execute to apply.)\n`); return; }

    // ── execute (single transaction) ──
    await client.query('BEGIN');
    const keyToId = new Map(existing);
    let created = 0;
    for (const { accId, rn } of roomsToCreate.values()) {
      const res = await client.query(
        `INSERT INTO accommodation_rooms (accommodation_id, room_number, beds, room_type, is_active)
         VALUES ($1, $2, 0, 'standard', true)
         ON CONFLICT (accommodation_id, room_number) DO UPDATE SET room_number = EXCLUDED.room_number
         RETURNING id`,
        [accId, rn]
      );
      keyToId.set(keyOf(accId, rn), res.rows[0].id);
      created++;
    }
    let linked = 0;
    for (const { empId, key } of empLinks) {
      const roomId = keyToId.get(key);
      if (!roomId) continue;
      await client.query(`UPDATE employees SET room_id = $1, updated_at = NOW() WHERE id = $2 AND room_id IS NULL`, [roomId, empId]);
      linked++;
    }
    await client.query('COMMIT');
    console.log(`\n✅ APPLIED: created ${created} rooms (beds=0, flagged), linked ${linked} employees to room_id.\n`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('LINKER FAILED (rolled back):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
