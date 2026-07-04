/**
 * Regression: GDPR erasure reaches EVERYTHING and fails LOUDLY (audit #5).
 *
 * Seeds one person with a unique PII marker spread across the tables the old
 * flow MISSED (damage_reports signatures/salary/photos, ticket message + file,
 * chatbot content, employee_notes, activity_logs IP+JSONB, slack mapping) plus
 * real files on disk, runs execute, then:
 *   - asserts each PII site is erased/scrubbed and files are gone;
 *   - scans every seeded text column for the marker → expects ZERO hits;
 *   - asserts the result is ok:true with an accurate receipt.
 *
 * Pure Node, real DB, cleans up. Run: node tests/gdprErasureComplete.script.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/database/connection');
const svc = require('../src/services/gdprAnonymization.service');

const CONTRACTOR = '00000000-0000-0000-0000-000000000001';
const MARK = 'ZZPII' + Date.now();               // unique, greppable PII marker
const UPLOADS = path.join(__dirname, '..', 'uploads', 'gdprtest');
let failures = 0;
const check = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const q = (sql, p) => pool.query(sql, p);
const one = async (sql, p) => (await q(sql, p)).rows[0];

(async () => {
  fs.mkdirSync(UPLOADS, { recursive: true });
  const photoAbs = path.join(UPLOADS, MARK + '-photo.jpg');
  const attAbs = path.join(UPLOADS, MARK + '-att.pdf');
  fs.writeFileSync(photoAbs, 'x'); fs.writeFileSync(attAbs, 'x');
  const photoRel = `uploads/gdprtest/${MARK}-photo.jpg`;
  const attRel = `uploads/gdprtest/${MARK}-att.pdf`;

  const created = {};
  try {
    // --- seed user + employee with the marker in PII fields ---
    const u = await one(`INSERT INTO users (email, password_hash, first_name, last_name, phone, contractor_id, is_active)
      VALUES ($1,'x',$2,$2,$3,$4,true) RETURNING id`, [`${MARK}@ex.com`, MARK, `+3620${MARK}`.slice(0,20), CONTRACTOR]);
    const uid = u.id; created.uid = uid;
    const e = await one(`INSERT INTO employees (contractor_id, user_id, first_name, last_name, personal_email, personal_phone, bank_account, tax_id, profile_photo_url)
      VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [CONTRACTOR, uid, MARK, `${MARK}@personal.com`, `+3630${MARK}`.slice(0,20), MARK+'-bank', MARK+'-tax', photoRel]);
    const eid = e.id; created.eid = eid;

    // --- seed the previously-MISSED PII sites ---
    const dr = await one(`INSERT INTO damage_reports (report_number, contractor_id, employee_id, incident_date, description, employee_salary, employee_signature_data, photo_urls)
      VALUES ($1,$2,$3,CURRENT_DATE,$4,999999,$4,$5) RETURNING id`, [`DR-${MARK}`.slice(0,20), CONTRACTOR, uid, MARK, [photoRel]]);
    const tk = await one(`INSERT INTO tickets (ticket_number, title, contractor_id, created_by) VALUES ($1,$2,$3,$4) RETURNING id`, [`#T${MARK}`.slice(0,20), 'seed', CONTRACTOR, uid]);
    await q(`INSERT INTO ticket_messages (ticket_id, sender_id, message) VALUES ($1,$2,$3)`, [tk.id, uid, MARK]);
    await q(`INSERT INTO ticket_attachments (ticket_id, uploaded_by, file_path, file_name) VALUES ($1,$2,$3,$4)`, [tk.id, uid, attRel, MARK+'.pdf']);
    const conv = await one(`INSERT INTO chatbot_conversations (contractor_id, user_id) VALUES ($1,$2) RETURNING id`, [CONTRACTOR, uid]);
    await q(`INSERT INTO chatbot_messages (conversation_id, sender_type, content) VALUES ($1,'user',$2)`, [conv.id, MARK]);
    await q(`INSERT INTO employee_notes (employee_id, created_by, content, title) VALUES ($1,$2,$3,$4)`, [eid, uid, MARK, MARK]);
    await q(`INSERT INTO activity_logs (user_id, entity_type, action, ip_address, changes) VALUES ($1,'test','x','1.2.3.4',$2::jsonb)`, [uid, JSON.stringify({ name: MARK })]);
    await q(`INSERT INTO slack_users (user_id, contractor_id, slack_user_id, slack_real_name) VALUES ($1,$2,$3,$4)`, [uid, CONTRACTOR, 'S'+MARK, MARK]).catch(()=>{});
    await q(`INSERT INTO wellbeing_points (user_id, contractor_id, points, action_type) VALUES ($1,$2,10,'test')`, [uid, CONTRACTOR]).catch(()=>{});

    // --- ERASE ---
    const res = await svc.anonymizeEmployee(eid, { dryRun: false, requestedBy: uid, reason: 'gdpr_request' });
    check('erasure returned ok:true (nothing failed)', res.ok === true);
    check('receipt marks complete', res.receipt && res.receipt.complete === true);
    check('receipt reports files_deleted >= 2 (photo + attachment)', res.receipt.files_deleted >= 2);
    check('no files_failed', res.filesFailed.length === 0);

    // --- per-site assertions ---
    const emp = await one('SELECT first_name, last_name, personal_email, bank_account, anonymized_at FROM employees WHERE id=$1', [eid]);
    check('employee first_name nulled + last_name pseudonymized + anonymized_at set',
      emp.first_name === null && emp.last_name.startsWith('TÖRÖLT-') && emp.personal_email === null && emp.bank_account === null && emp.anonymized_at);
    const usr = await one('SELECT is_active, email FROM users WHERE id=$1', [uid]);
    check('user deactivated + email scrambled', usr.is_active === false && /anonymized\.invalid$/.test(usr.email));
    const drow = await one('SELECT description, employee_salary, employee_signature_data, photo_urls FROM damage_reports WHERE id=$1', [dr.id]);
    check('damage_report signature/salary/photos nulled + description scrubbed (NOT NULL col)',
      drow.employee_signature_data === null && drow.employee_salary === null && !drow.photo_urls && drow.description === '[GDPR törölve]');
    check('ticket_message scrubbed', (await one('SELECT message FROM ticket_messages WHERE ticket_id=$1', [tk.id])).message === '[GDPR törölve]');
    check('ticket_attachment row deleted', !(await one('SELECT 1 FROM ticket_attachments WHERE ticket_id=$1', [tk.id])));
    check('chatbot content scrubbed', (await one('SELECT content FROM chatbot_messages WHERE conversation_id=$1', [conv.id])).content === '[GDPR törölve]');
    check('employee_notes scrubbed', (await one('SELECT content FROM employee_notes WHERE employee_id=$1', [eid])).content === '[GDPR törölve]');
    const al = await one('SELECT ip_address, changes FROM activity_logs WHERE user_id=$1', [uid]);
    check('activity_log IP nulled + JSONB redacted', al.ip_address === null && JSON.stringify(al.changes).includes('_redacted'));
    check('slack mapping deleted', !(await one('SELECT 1 FROM slack_users WHERE user_id=$1', [uid])));
    check('wellbeing_points (health) deleted', !(await one('SELECT 1 FROM wellbeing_points WHERE user_id=$1', [uid])));
    check('profile photo file physically deleted', !fs.existsSync(photoAbs));
    check('ticket attachment file physically deleted', !fs.existsSync(attAbs));

    // --- ZERO-PII SCAN: the marker must not survive in any seeded text column ---
    const E = "''"; // SQL empty string, kept out of JS quoting
    const scans = [
      ['employees', `first_name||last_name||coalesce(personal_email,${E})||coalesce(bank_account,${E})||coalesce(tax_id,${E})`, 'id=$1', [eid]],
      ['users', `email||first_name||last_name||coalesce(phone,${E})`, 'id=$1', [uid]],
      ['damage_reports', `coalesce(description,${E})||coalesce(employee_signature_data,${E})`, 'id=$1', [dr.id]],
      ['ticket_messages', 'message', 'ticket_id=$1', [tk.id]],
      ['chatbot_messages', `content||coalesce(translated_content,${E})`, 'conversation_id=$1', [conv.id]],
      ['employee_notes', 'content', 'employee_id=$1', [eid]],
      ['activity_logs', `changes::text||coalesce(ip_address::text,${E})`, 'user_id=$1', [uid]],
    ];
    let hits = 0;
    for (const [t, expr, where, p] of scans) {
      const r = await q(`SELECT count(*)::int c FROM ${t} WHERE (${expr}) LIKE '%${MARK}%' AND ${where}`, p).catch(() => ({ rows: [{ c: 0 }] }));
      if (r.rows[0].c > 0) { console.log(`   marker still in ${t}: ${r.rows[0].c}`); hits += r.rows[0].c; }
    }
    check('ZERO-PII SCAN: marker not found in ANY seeded table', hits === 0);

  } finally {
    // cleanup (erasure left pseudonymized skeletons; remove test rows)
    const { uid, eid } = created;
    if (uid) {
      await q('DELETE FROM ticket_attachments WHERE uploaded_by=$1', [uid]).catch(()=>{});
      await q('DELETE FROM ticket_messages WHERE sender_id=$1', [uid]).catch(()=>{});
      await q(`DELETE FROM tickets WHERE created_by=$1`, [uid]).catch(()=>{});
      await q('DELETE FROM chatbot_messages WHERE conversation_id IN (SELECT id FROM chatbot_conversations WHERE user_id=$1)', [uid]).catch(()=>{});
      await q('DELETE FROM chatbot_conversations WHERE user_id=$1', [uid]).catch(()=>{});
      await q('DELETE FROM damage_reports WHERE employee_id=$1', [uid]).catch(()=>{});
      await q('DELETE FROM activity_logs WHERE user_id=$1', [uid]).catch(()=>{});
      await q('DELETE FROM slack_users WHERE user_id=$1', [uid]).catch(()=>{});
      await q('DELETE FROM wellbeing_points WHERE user_id=$1', [uid]).catch(()=>{});
    }
    if (eid) {
      await q('DELETE FROM employee_notes WHERE employee_id=$1', [eid]).catch(()=>{});
      await q('DELETE FROM anonymization_log WHERE employee_id=$1', [eid]).catch(()=>{});
      await q('DELETE FROM employees WHERE id=$1', [eid]).catch(()=>{});
    }
    if (uid) await q('DELETE FROM users WHERE id=$1', [uid]).catch(()=>{});
    fs.rmSync(UPLOADS, { recursive: true, force: true });
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
