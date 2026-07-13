/**
 * Sandbox seed — fully SYNTHETIC dataset for building/testing features
 * (starting with the room-consolidation engine) without touching production
 * or any real personal data.
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
const SHIFTS = ['delelott','delutan','ejszaka','valtott']; // three-shift model (mig 137)
const CITIES = ['Győr','Kecskemét','Miskolc','Debrecen','Veszprém','Szeged','Pécs','Budapest'];

async function main() {
  const c = await pool.connect();
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
      'accommodation_rooms','accommodation_contractors','accommodations',
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
    const cc = (await c.query(`SELECT id FROM cost_centers LIMIT 1`)).rows[0]?.id;
    // A non-critical category so the alert_critical_ticket trigger returns early
    // (it fires only for harassment/escalation; a NULL category slips past its
    // NULL-valued NOT IN guard and would insert a wellbeing referral with no user).
    const benignCategory = (await c.query(`SELECT id FROM ticket_categories WHERE slug NOT IN ('harassment','escalation') LIMIT 1`)).rows[0]?.id;

    // ── ~15 accommodations, each with rooms + beds (varied utilization) ──
    // Layout gives ≥2 under-utilized sites (few occupants), 1 nearly-full site.
    const NUM_ACC = 15;
    const accommodations = [];
    for (let a = 1; a <= NUM_ACC; a++) {
      const name = `Szálló ${pad(a, 2)} — ${pick(CITIES)}`;
      const numRooms = int(3, 8);
      const accId = (await c.query(
        `INSERT INTO accommodations (name, address, type, current_contractor_id, status, monthly_rent)
         VALUES ($1,$2,'worker_hostel',$3,'occupied',$4) RETURNING id`,
        [name, `${int(1000,9999)} ${pick(CITIES)}, Munkás u. ${a}.`, contractorId, int(180000, 420000)]
      )).rows[0].id;
      await c.query(
        `INSERT INTO accommodation_contractors (accommodation_id, contractor_id, check_in)
         VALUES ($1,$2,CURRENT_DATE)`, [accId, contractorId]
      );
      const rooms = [];
      for (let r = 1; r <= numRooms; r++) {
        const beds = pick([2, 2, 3, 4, 4, 6]);
        const roomId = (await c.query(
          `INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, is_active)
           VALUES ($1,$2,$3,$4,'standard',true) RETURNING id`,
          [accId, `${100 * (1 + (r % 3)) + r}`, (r % 3), beds]
        )).rows[0].id;
        rooms.push({ id: roomId, beds, occupants: 0 });
      }
      // utilization profile: a=1,2 under-utilized (target ~30%); a=15 nearly full (~95%)
      const fill = a <= 2 ? 0.3 : a === NUM_ACC ? 0.95 : 0.6 + rnd() * 0.2;
      accommodations.push({ id: accId, name, rooms, fill });
    }

    // ── ~300 synthetic employees ──
    const NUM_EMP = 300;
    let assigned = 0, unassigned = 0;
    let mixedGenderSeeded = 0, mixedShiftSeeded = 0;
    for (let e = 1; e <= NUM_EMP; e++) {
      const isMale = rnd() < 0.7; // worker-hostel skew
      const gender = isMale ? 'male' : 'female';
      const first = pick(isMale ? MALE : FEMALE);
      const last = pick(SUR);
      const mother = `${pick(SUR)} ${pick(FEMALE)}`;
      // ~12% deliberately have NO shift set → the engine must FLAG (never move) them.
      const shift = rnd() < 0.12 ? null : pick(SHIFTS);
      const acc = pick(accommodations);
      const empNo = `SBX-${pad(e)}`;
      // ~70% assigned to a room, ~30% unassigned (room_id null) — the fill target.
      let roomId = null, roomNumber = null, accId = acc.id;
      const wantAssign = rnd() < 0.7;
      if (wantAssign) {
        // pick a room in the accommodation with a free bed
        const room = acc.rooms.find(r => r.occupants < r.beds);
        if (room) {
          // Edge cases: deliberately create some mixed-gender + mixed-shift rooms
          // (the engine must NOT consolidate across these) by not filtering on them here.
          roomId = room.id; roomNumber = null; room.occupants++; assigned++;
        } else { unassigned++; }
      } else { unassigned++; }

      await c.query(
        `INSERT INTO employees
          (contractor_id, accommodation_id, room_id, employee_number, status_id,
           first_name, last_name, gender, birth_date, mothers_name, workplace, shift_schedule,
           personal_email, personal_phone, nationality, start_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'HU',CURRENT_DATE - ($15||' days')::interval)`,
        [contractorId, accId, roomId, empNo, activeStatus,
         first, last, gender, `19${int(70,99)}-${pad(int(1,12),2)}-${pad(int(1,28),2)}`, mother,
         pick(WORKPLACES), shift,
         `sbx-emp-${pad(e)}@sandbox.local`, `+36 30 000 ${pad(e)}`, int(30, 3000)]
      );
    }

    // ── deterministic CONSOLIDATION DEMO: 2 accommodations, each a clean same-shift
    //    opportunity (4 same-gender same-shift residents spread 1-per-room across 4
    //    half-full rooms → pack into 2, free 2) PLUS one empty-shift resident in a
    //    5th room (must be FLAGGED + locked + never moved). Guarantees the full
    //    run→approve flow has real same-shift moves to work with. ──
    let demoNo = NUM_EMP;
    const mkDemoEmp = async (accId, roomId, shiftVal) => {
      demoNo++;
      await c.query(
        `INSERT INTO employees
          (contractor_id, accommodation_id, room_id, employee_number, status_id,
           first_name, last_name, gender, birth_date, mothers_name, workplace, shift_schedule,
           personal_email, personal_phone, nationality, start_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'male','1990-01-01',$8,$9,$10,$11,$12,'HU',CURRENT_DATE)`,
        [contractorId, accId, roomId, `SBX-${pad(demoNo)}`, activeStatus,
         pick(MALE), pick(SUR), `${pick(SUR)} ${pick(FEMALE)}`, pick(WORKPLACES), shiftVal,
         `sbx-emp-${pad(demoNo)}@sandbox.local`, `+36 30 000 ${pad(demoNo)}`]
      );
    };
    for (let d = 1; d <= 2; d++) {
      const accId = (await c.query(
        `INSERT INTO accommodations (name, address, type, current_contractor_id, status, monthly_rent)
         VALUES ($1,$2,'worker_hostel',$3,'occupied',250000) RETURNING id`,
        [`Konszolidáció Demo ${d} — ${pick(CITIES)}`, `Demo u. ${d}.`, contractorId]
      )).rows[0].id;
      await c.query(`INSERT INTO accommodation_contractors (accommodation_id, contractor_id, check_in) VALUES ($1,$2,CURRENT_DATE)`, [accId, contractorId]);
      const demoRooms = [];
      for (let r = 1; r <= 5; r++) {
        demoRooms.push((await c.query(
          `INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, is_active)
           VALUES ($1,$2,0,2,'standard',true) RETURNING id`, [accId, `D${d}0${r}`]
        )).rows[0].id);
      }
      for (let r = 0; r < 4; r++) await mkDemoEmp(accId, demoRooms[r], 'delelott'); // 4 same-shift → free 2 rooms
      await mkDemoEmp(accId, demoRooms[4], null);                                   // empty shift → flagged, never moved
    }

    // Fetch room composition to report the edge cases actually generated.
    const mixG = (await c.query(
      `SELECT COUNT(*)::int c FROM (
         SELECT room_id FROM employees WHERE room_id IS NOT NULL GROUP BY room_id
         HAVING COUNT(DISTINCT gender) > 1) x`)).rows[0].c;
    // cross-shift rooms = ≥2 DIFFERENT known shifts sharing a room (engine must never keep/create these).
    const mixS = (await c.query(
      `SELECT COUNT(*)::int c FROM (
         SELECT room_id FROM employees WHERE room_id IS NOT NULL AND shift_schedule IS NOT NULL
         GROUP BY room_id HAVING COUNT(DISTINCT shift_schedule) > 1) x`)).rows[0].c;
    // roomed employees with an EMPTY shift — the engine must flag, not move, these.
    const emptyShift = (await c.query(
      `SELECT COUNT(*)::int c FROM employees WHERE room_id IS NOT NULL AND shift_schedule IS NULL`)).rows[0].c;

    // ── a few tickets + expenses so dashboards aren't empty ──
    const someEmployees = (await c.query(`SELECT id, user_id FROM employees LIMIT 20`)).rows;
    const superadminForTickets = null;
    for (let t = 1; t <= 12; t++) {
      const acc = pick(accommodations);
      await c.query(
        `INSERT INTO tickets (contractor_id, ticket_number, title, description, status_id, category_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6, NOW() - ($7||' days')::interval)`,
        [contractorId, `#${t}`, `Sandbox hibajegy ${t}: ${pick(['csöpögő csap','fűtés','wifi','zár','világítás'])}`,
         'Szintetikus teszt hibajegy.', newStatus, benignCategory, int(0, 30)]
      );
    }
    for (let x = 1; x <= 20; x++) {
      const acc = pick(accommodations);
      await c.query(
        `INSERT INTO accommodation_expenses (accommodation_id, billing_month, category, amount, currency, vendor_name, created_at)
         VALUES ($1, to_char(CURRENT_DATE, 'YYYY-MM'), $2, $3, 'HUF', $4, NOW())`,
        [acc.id, pick(['rezsi','karbantartas','takaritas','egyeb']), int(20000, 250000), `Beszállító ${x} (sandbox)`]
      );
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
    // link the 2 residents to employee records so their /my endpoints have data
    await c.query(`UPDATE employees SET user_id=$1 WHERE id=(SELECT id FROM employees WHERE user_id IS NULL LIMIT 1)`, [res1]);
    await c.query(`UPDATE employees SET user_id=$1 WHERE id=(SELECT id FROM employees WHERE user_id IS NULL LIMIT 1)`, [res2]);

    await c.query('COMMIT');

    // ── summary ──
    const q = async (s) => (await pool.query(s)).rows[0].c;
    console.log('\n✅ Sandbox seeded (all synthetic):');
    console.log(`   contractors:   ${await q('SELECT COUNT(*)::int c FROM contractors')}`);
    console.log(`   accommodations:${await q('SELECT COUNT(*)::int c FROM accommodations')}  rooms:${await q('SELECT COUNT(*)::int c FROM accommodation_rooms')}  beds:${await q('SELECT COALESCE(SUM(beds),0)::int c FROM accommodation_rooms')}`);
    console.log(`   employees:     ${await q('SELECT COUNT(*)::int c FROM employees')}  assigned:${await q('SELECT COUNT(*)::int c FROM employees WHERE room_id IS NOT NULL')}  unassigned:${await q('SELECT COUNT(*)::int c FROM employees WHERE room_id IS NULL')}`);
    console.log(`   edge cases:    mixed-gender rooms=${mixG}  cross-shift rooms=${mixS}  empty-shift (roomed)=${emptyShift}`);
    console.log(`   tickets:${await q('SELECT COUNT(*)::int c FROM tickets')}  expenses:${await q('SELECT COUNT(*)::int c FROM accommodation_expenses')}`);
    console.log('   logins (pw "sandbox123"): superadmin@ / admin@ / resident1@ / resident2@ sandbox.local\n');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}
main();
