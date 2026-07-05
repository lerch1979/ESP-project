/**
 * Sandbox seed — fully SYNTHETIC dataset for building/testing features
 * (room-consolidation engine v1 + v2) without touching production or any real
 * personal data.
 *
 * Idempotent + re-runnable: clears all data-level rows (keeps reference data:
 * roles/statuses/categories/permissions), then regenerates.
 *
 * SAFETY: refuses to run unless DB_NAME looks like a sandbox (or FORCE_SEED=1).
 *
 *   DB_NAME=hr_erp_sandbox node src/database/seed_sandbox.js
 *
 * All names/emails/phones below are generated + clearly synthetic
 * (emails @sandbox.local, phones +36 30 000 xxxx). No real individuals.
 *
 * v2 role coverage (deterministic cast, so the strategy layer is testable):
 *   • CORE      "Szálló 15" — near-full, workplace-bound to 'Audi Győr'; has 2
 *               free beds so the buffer's Audi workers can drain INTO it.
 *   • BUFFER    "Szálló 01" — drainable: 2 'Audi Győr' day males (→ core) + 1
 *               'Bosch Miskolc' day male whose workplace the CORE excludes.
 *   • PHASE_OUT "Szálló 02" — 'Mercedes Kecskemét' day males, drain into normals.
 *   • LOCKED    "Szálló 03" — under-consolidated on purpose; engine must NOT touch it.
 *   • normals   "Szálló 04..14" — random fill (mixed-gender / mixed-shift edge
 *               cases for the within-accommodation constraint proofs).
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../database/connection');

const DB = process.env.DB_NAME || 'hr_erp_db';
if (!/sandbox/i.test(DB) && process.env.FORCE_SEED !== '1') {
  console.error(`\n✋ Refusing to seed: DB_NAME="${DB}" is not a sandbox.\n   Run with DB_NAME=hr_erp_sandbox (or FORCE_SEED=1 to override).\n`);
  process.exit(1);
}

// ── deterministic PRNG (reproducible datasets) ──
let _s = 1234567;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pad = (n, w = 4) => String(n).padStart(w, '0');

// ── synthetic name pools (generic, not identifying any real person) ──
const SUR = ['Kovács','Szabó','Horváth','Nagy','Tóth','Varga','Kiss','Molnár','Németh','Farkas','Balogh','Papp','Takács','Juhász','Lakatos','Mészáros','Oláh','Simon','Rácz','Fekete'];
const MALE = ['Bence','Máté','Levente','Dominik','Ádám','Balázs','Gábor','Zoltán','Tamás','András','Péter','László','Dániel','Márk','Norbert'];
const FEMALE = ['Anna','Zsófia','Petra','Réka','Eszter','Kata','Nóra','Dóra','Vivien','Boglárka','Fanni','Lilla','Emma','Hanna'];
const WORKPLACES = ['Audi Győr','Mercedes Kecskemét','Bosch Miskolc','Samsung Göd','BMW Debrecen','Continental Veszprém','Lego Nyíregyháza','Flex Zalaegerszeg','Michelin Nyíregyháza','Stellantis Szentgotthárd'];
const SHIFTS = ['day','night','rotating','flexible'];
const CITIES = ['Győr','Kecskemét','Miskolc','Debrecen','Veszprém','Szeged','Pécs','Budapest'];

async function main() {
  const c = await pool.connect();
  let empSeq = 0; // global employee-number counter

  try {
    await c.query('BEGIN');

    // Reference data the fresh migrations don't seed.
    await c.query(`INSERT INTO roles (name, slug, description)
      VALUES ('Szállásolt Munkavállaló','accommodated_employee','Sandbox resident role')
      ON CONFLICT (slug) DO NOTHING`);

    // ── clear prior sandbox data (FK-safe order) ──
    for (const t of [
      'ticket_messages','ticket_attachments','ticket_comments','ticket_history','tickets',
      'accommodation_expenses','employee_accommodation_history','employees',
      'accommodation_workplaces','accommodation_rooms','accommodation_contractors','accommodations',
      'user_roles',
    ]) { await c.query(`DELETE FROM ${t}`); }
    await c.query(`DELETE FROM users`);
    await c.query(`DELETE FROM contractors`);

    // ── contractors (client companies) ──
    const contractorId = (await c.query(
      `INSERT INTO contractors (name, slug, email, phone, address, is_active)
       VALUES ('Sandbox Kft.','sandbox-kft','info@sandbox.local','+36 30 000 0000','1111 Budapest, Teszt u. 1.',true) RETURNING id`
    )).rows[0].id;

    // ── reference ids ──
    const activeStatus = (await c.query(`SELECT id FROM employee_status_types WHERE slug='active'`)).rows[0].id;
    const roleId = async (slug) => (await c.query(`SELECT id FROM roles WHERE slug=$1`, [slug])).rows[0].id;
    const newStatus = (await c.query(`SELECT id FROM ticket_statuses WHERE slug='new' LIMIT 1`)).rows[0]?.id
      || (await c.query(`SELECT id FROM ticket_statuses LIMIT 1`)).rows[0].id;
    const benignCategory = (await c.query(`SELECT id FROM ticket_categories WHERE slug NOT IN ('harassment','escalation') LIMIT 1`)).rows[0]?.id;

    // ── helpers ──
    // type 'dormitory' (Munkásszálló) — a VALID_TYPES value so admin edit-save works
    // (the old 'worker_hostel' string was not in the controller's allow-list → 400).
    const mkAccommodation = async (name, { role = 'normal', locked = false } = {}) => (await c.query(
      `INSERT INTO accommodations (name, address, type, current_contractor_id, status, monthly_rent,
                                   consolidation_role, consolidation_locked)
       VALUES ($1,$2,'dormitory',$3,'occupied',$4,$5,$6) RETURNING id`,
      [name, `${int(1000,9999)} ${pick(CITIES)}, Munkás u.`, contractorId, int(180000, 420000), role, locked]
    )).rows[0].id;

    const mkRoom = async (accId, num, beds) => (await c.query(
      `INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, is_active)
       VALUES ($1,$2,0,$3,'standard',true) RETURNING id`,
      [accId, String(num), beds]
    )).rows[0].id;

    const mkEmployee = async ({ accId, roomId, gender, shift, workplace }) => {
      empSeq++;
      const first = pick(gender === 'male' ? MALE : FEMALE);
      const last = pick(SUR);
      await c.query(
        `INSERT INTO employees
          (contractor_id, accommodation_id, room_id, employee_number, status_id,
           first_name, last_name, gender, birth_date, mothers_name, workplace, shift_schedule,
           personal_email, personal_phone, nationality, start_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'HU',CURRENT_DATE - ($15||' days')::interval)`,
        [contractorId, accId, roomId, `SBX-${pad(empSeq)}`, activeStatus,
         first, last, gender, `19${int(70,99)}-${pad(int(1,12),2)}-${pad(int(1,28),2)}`, `${pick(SUR)} ${pick(FEMALE)}`,
         workplace, shift, `sbx-emp-${pad(empSeq)}@sandbox.local`, `+36 30 000 ${pad(empSeq)}`, int(30, 3000)]
      );
    };

    const addWorkplaces = async (accId, list) => {
      for (const w of list) await c.query(
        `INSERT INTO accommodation_workplaces (accommodation_id, workplace) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [accId, w]);
    };

    // ══════════════════════════════════════════════════════════════════════
    // v2 ROLE-TAGGED accommodations — deterministic cast (guarantees the
    // strategy scenario regardless of the random fill below).
    // ══════════════════════════════════════════════════════════════════════

    // CORE — "Szálló 15": near-full, bound to 'Audi Győr', 2 free beds for drain.
    const coreId = await mkAccommodation('Szálló 15 — Győr', { role: 'core' });
    await addWorkplaces(coreId, ['Audi Győr']);
    const coreRooms = [await mkRoom(coreId, 1501, 4), await mkRoom(coreId, 1502, 4), await mkRoom(coreId, 1503, 4), await mkRoom(coreId, 1504, 2)];
    for (const rid of coreRooms.slice(0, 3)) for (let i = 0; i < 4; i++) await mkEmployee({ accId: coreId, roomId: rid, gender: 'male', shift: 'day', workplace: 'Audi Győr' }); // 12/12 in first 3 rooms; room 1504 empty (2 free)

    // BUFFER — "Szálló 01": drainable. 2 Audi day males (→ core), 1 Bosch day male
    // (core excludes 'Bosch Miskolc' → workplace is that resident's only blocker at the core).
    const bufferId = await mkAccommodation('Szálló 01 — Győr', { role: 'buffer' });
    const bufRooms = [await mkRoom(bufferId, 101, 2), await mkRoom(bufferId, 102, 2)];
    await mkEmployee({ accId: bufferId, roomId: bufRooms[0], gender: 'male', shift: 'day', workplace: 'Audi Győr' });
    await mkEmployee({ accId: bufferId, roomId: bufRooms[0], gender: 'male', shift: 'day', workplace: 'Audi Győr' });
    await mkEmployee({ accId: bufferId, roomId: bufRooms[1], gender: 'male', shift: 'day', workplace: 'Bosch Miskolc' });

    // PHASE_OUT — "Szálló 02": Mercedes day males, drain into unrestricted normals.
    const phaseOutId = await mkAccommodation('Szálló 02 — Kecskemét', { role: 'phase_out' });
    const poRooms = [await mkRoom(phaseOutId, 201, 2), await mkRoom(phaseOutId, 202, 2)];
    await mkEmployee({ accId: phaseOutId, roomId: poRooms[0], gender: 'male', shift: 'day', workplace: 'Mercedes Kecskemét' });
    await mkEmployee({ accId: phaseOutId, roomId: poRooms[0], gender: 'male', shift: 'day', workplace: 'Mercedes Kecskemét' });
    await mkEmployee({ accId: phaseOutId, roomId: poRooms[1], gender: 'male', shift: 'day', workplace: 'Mercedes Kecskemét' });

    // LOCKED — "Szálló 03": under-consolidated (2 half-empty rooms that COULD merge)
    // — the engine must leave it completely untouched.
    const lockedId = await mkAccommodation('Szálló 03 — Miskolc', { role: 'normal', locked: true });
    const lkRooms = [await mkRoom(lockedId, 301, 4), await mkRoom(lockedId, 302, 4)];
    await mkEmployee({ accId: lockedId, roomId: lkRooms[0], gender: 'male', shift: 'day', workplace: 'Bosch Miskolc' });
    await mkEmployee({ accId: lockedId, roomId: lkRooms[1], gender: 'male', shift: 'day', workplace: 'Bosch Miskolc' });

    // ══════════════════════════════════════════════════════════════════════
    // NORMAL accommodations — random fill (edge cases for within-consolidation).
    // ══════════════════════════════════════════════════════════════════════
    const NUM_NORMAL = 11;
    const normals = [];
    for (let a = 4; a <= 3 + NUM_NORMAL; a++) {
      const accId = await mkAccommodation(`Szálló ${pad(a, 2)} — ${pick(CITIES)}`, { role: 'normal' });
      await c.query(
        `INSERT INTO accommodation_contractors (accommodation_id, contractor_id, check_in) VALUES ($1,$2,CURRENT_DATE)`,
        [accId, contractorId]);
      const numRooms = int(3, 8);
      const rooms = [];
      for (let r = 1; r <= numRooms; r++) {
        const beds = pick([2, 2, 3, 4, 4, 6]);
        rooms.push({ id: await mkRoom(accId, 100 * (1 + (r % 3)) + r, beds), beds, occupants: 0 });
      }
      const fill = a <= 5 ? 0.3 : 0.6 + rnd() * 0.2; // Szálló 04–05 under-utilized
      normals.push({ id: accId, rooms, fill });
    }
    // contractor links for the special accommodations too
    for (const accId of [coreId, bufferId, phaseOutId, lockedId]) {
      await c.query(
        `INSERT INTO accommodation_contractors (accommodation_id, contractor_id, check_in) VALUES ($1,$2,CURRENT_DATE)`,
        [accId, contractorId]);
    }

    // ── fill normals up to ~300 total employees (mixed gender/shift edge cases) ──
    const TARGET_TOTAL = 300;
    let assigned = 0, unassigned = 0;
    while (empSeq < TARGET_TOTAL) {
      const isMale = rnd() < 0.7;
      const gender = isMale ? 'male' : 'female';
      const shift = pick(SHIFTS);
      const acc = pick(normals);
      const wantAssign = rnd() < 0.7;
      let roomId = null;
      if (wantAssign) {
        const room = acc.rooms.find((r) => r.occupants < r.beds); // deliberately NO gender/shift filter → seeds edge cases
        if (room) { roomId = room.id; room.occupants++; assigned++; } else unassigned++;
      } else unassigned++;
      await mkEmployee({ accId: acc.id, roomId, gender, shift, workplace: pick(WORKPLACES) });
    }

    // Fetch edge-case counts actually generated (across normals).
    const mixG = (await c.query(
      `SELECT COUNT(*)::int c FROM (SELECT room_id FROM employees WHERE room_id IS NOT NULL GROUP BY room_id HAVING COUNT(DISTINCT gender) > 1) x`)).rows[0].c;
    const mixS = (await c.query(
      `SELECT COUNT(*)::int c FROM (SELECT room_id FROM employees WHERE room_id IS NOT NULL GROUP BY room_id
         HAVING COUNT(DISTINCT CASE WHEN shift_schedule IN ('day','night') THEN shift_schedule END) > 1) x`)).rows[0].c;

    // ── a few tickets + expenses so dashboards aren't empty ──
    for (let t = 1; t <= 12; t++) {
      await c.query(
        `INSERT INTO tickets (contractor_id, ticket_number, title, description, status_id, category_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6, NOW() - ($7||' days')::interval)`,
        [contractorId, `#${t}`, `Sandbox hibajegy ${t}: ${pick(['csöpögő csap','fűtés','wifi','zár','világítás'])}`,
         'Szintetikus teszt hibajegy.', newStatus, benignCategory, int(0, 30)]);
    }
    for (let x = 1; x <= 20; x++) {
      await c.query(
        `INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount, currency, vendor_name, created_at)
         VALUES ($1, to_char(CURRENT_DATE, 'YYYY-MM'), $2, $3, 'HUF', $4, NOW())`,
        [pick(normals).id, pick(['rezsi','karbantartas','takaritas','egyeb']), int(20000, 250000), `Beszállító ${x} (sandbox)`]);
    }

    // ── test logins (known passwords) ──
    const mkUser = async (email, first, last, slug) => {
      const hash = await bcrypt.hash('sandbox123', 10);
      const uid = (await c.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, contractor_id, is_active)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING id`, [email, hash, first, last, contractorId]
      )).rows[0].id;
      await c.query(`INSERT INTO user_roles (user_id, role_id, contractor_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [uid, await roleId(slug), contractorId]);
      return uid;
    };
    await mkUser('superadmin@sandbox.local', 'Sandbox', 'Superadmin', 'superadmin');
    await mkUser('admin@sandbox.local', 'Sandbox', 'Admin', 'admin');
    const res1 = await mkUser('resident1@sandbox.local', 'Lakó', 'Egy', 'accommodated_employee');
    const res2 = await mkUser('resident2@sandbox.local', 'Lakó', 'Kettő', 'accommodated_employee');
    await c.query(`UPDATE employees SET user_id=$1 WHERE id=(SELECT id FROM employees WHERE user_id IS NULL LIMIT 1)`, [res1]);
    await c.query(`UPDATE employees SET user_id=$1 WHERE id=(SELECT id FROM employees WHERE user_id IS NULL LIMIT 1)`, [res2]);

    await c.query('COMMIT');

    // ── summary ──
    const q = async (s) => (await pool.query(s)).rows[0].c;
    console.log('\n✅ Sandbox seeded (all synthetic):');
    console.log(`   contractors:   ${await q('SELECT COUNT(*)::int c FROM contractors')}`);
    console.log(`   accommodations:${await q('SELECT COUNT(*)::int c FROM accommodations')}  rooms:${await q('SELECT COUNT(*)::int c FROM accommodation_rooms')}  beds:${await q('SELECT COALESCE(SUM(beds),0)::int c FROM accommodation_rooms')}`);
    console.log(`   roles:         core=${await q("SELECT COUNT(*)::int c FROM accommodations WHERE consolidation_role='core'")}  buffer=${await q("SELECT COUNT(*)::int c FROM accommodations WHERE consolidation_role='buffer'")}  phase_out=${await q("SELECT COUNT(*)::int c FROM accommodations WHERE consolidation_role='phase_out'")}  locked=${await q('SELECT COUNT(*)::int c FROM accommodations WHERE consolidation_locked')}`);
    console.log(`   workplace-binds:${await q('SELECT COUNT(*)::int c FROM accommodation_workplaces')}`);
    console.log(`   employees:     ${await q('SELECT COUNT(*)::int c FROM employees')}  assigned:${await q('SELECT COUNT(*)::int c FROM employees WHERE room_id IS NOT NULL')}  unassigned:${await q('SELECT COUNT(*)::int c FROM employees WHERE room_id IS NULL')}`);
    console.log(`   edge cases:    mixed-gender rooms=${mixG}  mixed day/night rooms=${mixS}`);
    console.log(`   tickets:${await q('SELECT COUNT(*)::int c FROM tickets')}  expenses:${await q('SELECT COUNT(*)::int c FROM accommodation_expenses')}`);
    console.log('   logins (pw "sandbox123"): superadmin@ / admin@ / resident1@ / resident2@ sandbox.local\n');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Seed failed:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}
main();
