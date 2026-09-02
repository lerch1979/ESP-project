/**
 * Partner module Phase 2 — activities + follow-ups that reuse `tasks`.
 *
 * The claim under test is that a follow-up is a REAL task, not a private reminder
 * table: it must appear in the ordinary tasks queries staff already use, carry the
 * partner it is about, and stay alive if the activity is deleted.
 *
 * Sandbox only.
 *   DB_NAME=hr_erp_sandbox DB_USER=$(whoami) node tests/partnerPhase2.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const partner = require('../src/services/partner.service');

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};
const su = { user: { id: null, email: 'su@test.local', roles: ['superadmin'], contractorId: null } };

(async () => {
  const stamp = Date.now();
  let C, A, contactId, actWithFollowUp, actPlain, taskId;

  try {
    if (!/sandbox/i.test(process.env.DB_NAME || '')) {
      throw new Error(`refusing to run outside a sandbox DB (DB_NAME=${process.env.DB_NAME})`);
    }
    const u = await pool.query('SELECT id FROM users LIMIT 1');
    su.user.id = u.rows[0].id;

    C = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('F2 Partner Kft',$1,true) RETURNING id`, ['f2-' + stamp])).rows[0].id;
    A = (await pool.query(`INSERT INTO accommodations (name,type,capacity,status,current_contractor_id) VALUES ($1,'studio',5,'available',$2) RETURNING id`, ['F2 Szálló ' + stamp, C])).rows[0].id;
    contactId = (await partner.saveContact(su, null, { contractor_id: C, name: 'F2 Kapcsolat', is_primary: true })).id;

    // ── plain activity ─────────────────────────────────────────────────────
    actPlain = await partner.createActivity(su, {
      contractor_id: C, kind: 'call', subject: 'F2 Bejövő hívás',
      body: 'Egyeztettünk a jövő havi létszámról.', contact_id: contactId,
    });
    check('AC-01 activity created and linked to the contact',
      actPlain.kind === 'call' && actPlain.contact_id === contactId);
    check('AC-02 a plain activity creates NO task', actPlain.follow_up_task_id === null);

    let kindRejected = false;
    try { await partner.createActivity(su, { contractor_id: C, kind: 'telepathy', subject: 'x' }); }
    catch (e) { kindRejected = /kind:/.test(e.message); }
    check('AC-03 an unknown activity kind is rejected', kindRejected);

    let emptyRejected = false;
    try { await partner.createActivity(su, { contractor_id: C, kind: 'note' }); }
    catch (e) { emptyRejected = /Tárgy vagy leírás/.test(e.message); }
    check('AC-04 an activity with no subject and no body is rejected', emptyRejected);

    // A contact from a DIFFERENT party must not be attachable.
    const otherC = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('F2 Másik',$1,true) RETURNING id`, ['f2b-' + stamp])).rows[0].id;
    const otherContact = (await partner.saveContact(su, null, { contractor_id: otherC, name: 'F2 Idegen' })).id;
    let wrongContact = false;
    try { await partner.createActivity(su, { contractor_id: C, kind: 'note', subject: 'x', contact_id: otherContact }); }
    catch (e) { wrongContact = /nem ehhez a félhez/.test(e.message); }
    check('AC-05 a contact from another party cannot be attached', wrongContact);
    await pool.query('DELETE FROM partner_contacts WHERE id=$1', [otherContact]);
    await pool.query('DELETE FROM contractors WHERE id=$1', [otherC]);

    // ── follow-up creates a REAL task ──────────────────────────────────────
    const due = new Date(Date.now() + 3 * 864e5).toISOString();
    actWithFollowUp = await partner.createActivity(su, {
      contractor_id: C, kind: 'meeting', subject: 'F2 Helyszíni bejárás',
      body: 'Megnéztük a szállót.', follow_up_at: due, follow_up_priority: 'high',
    });
    taskId = actWithFollowUp.follow_up_task_id;
    check('FU-01 a follow-up date produces a linked task', !!taskId);

    const t = (await pool.query('SELECT * FROM tasks WHERE id=$1', [taskId])).rows[0];
    check('FU-02 the task is a REAL row in `tasks`', !!t);
    check('FU-03 the task carries the partner it is ABOUT (related_contractor_id)', t.related_contractor_id === C);
    check('FU-04 the task is actionable (todo + assignee + due date)',
      t.status === 'todo' && !!t.assigned_to && !!t.due_date);
    check('FU-05 the task title names the partner', /F2 Partner Kft/.test(t.title));
    check('FU-06 the task priority came from the activity', t.priority === 'high');
    check('FU-07 the task is tagged so partner follow-ups are findable',
      Array.isArray(t.tags) && t.tags.includes('partner-utankovetes'));

    // related_contractor_id must NOT be conflated with the tenancy key.
    check('FU-08 contractor_id (tenant) and related_contractor_id (subject) are separate columns',
      Object.prototype.hasOwnProperty.call(t, 'contractor_id')
      && Object.prototype.hasOwnProperty.call(t, 'related_contractor_id'));

    // ── the timeline shows the task's LIVE status ──────────────────────────
    let list = await partner.listActivities(su, { contractor_id: C });
    let withFu = list.find((x) => x.id === actWithFollowUp.id);
    check('FU-09 the timeline reports the follow-up as open', withFu.follow_up_status === 'todo');

    await pool.query(`UPDATE tasks SET status='done' WHERE id=$1`, [taskId]);
    list = await partner.listActivities(su, { contractor_id: C });
    withFu = list.find((x) => x.id === actWithFollowUp.id);
    check('FU-10 completing the TASK is reflected in the activity timeline', withFu.follow_up_status === 'done');

    // ── open follow-ups view ───────────────────────────────────────────────
    await pool.query(`UPDATE tasks SET status='todo' WHERE id=$1`, [taskId]);
    const open = await partner.listOpenFollowUps(su, {});
    check('FU-11 an open follow-up appears in the cross-partner view',
      open.some((x) => x.follow_up_task_id === taskId));
    await pool.query(`UPDATE tasks SET status='done' WHERE id=$1`, [taskId]);
    const openAfter = await partner.listOpenFollowUps(su, {});
    check('FU-12 a completed follow-up drops out of the view',
      !openAfter.some((x) => x.follow_up_task_id === taskId));

    // ── deleting the activity must not destroy someone's assigned work ─────
    await partner.deleteActivity(su, actWithFollowUp.id);
    const stillThere = (await pool.query('SELECT id FROM tasks WHERE id=$1', [taskId])).rows.length === 1;
    check('FU-13 deleting the activity leaves the assigned task alive', stillThere);

    // ── timeline ordering + accommodation parties ──────────────────────────
    await partner.createActivity(su, { accommodation_id: A, kind: 'note', subject: 'F2 Ingatlan jegyzet' });
    check('AC-06 a property can hold its own activity timeline',
      (await partner.listActivities(su, { accommodation_id: A })).length === 1);

    const older = new Date(Date.now() - 10 * 864e5).toISOString();
    await partner.createActivity(su, { contractor_id: C, kind: 'email', subject: 'F2 Régi levél', occurred_at: older });
    const ordered = await partner.listActivities(su, { contractor_id: C });
    check('AC-07 the timeline is newest-first',
      new Date(ordered[0].occurred_at) >= new Date(ordered[ordered.length - 1].occurred_at));
  } catch (err) {
    console.error('SUITE ERROR:', err.message);
    failures++;
  } finally {
    const q = (sql, p) => pool.query(sql, p).catch(() => {});
    await q('DELETE FROM partner_activities WHERE contractor_id=$1 OR accommodation_id=$2', [C, A]);
    await q("DELETE FROM tasks WHERE related_contractor_id=$1 OR title LIKE 'Utánkövetés — F2%'", [C]);
    await q('DELETE FROM partner_contacts WHERE contractor_id=$1', [C]);
    await q('DELETE FROM accommodations WHERE id=$1', [A]);
    await q('DELETE FROM contractors WHERE id=$1', [C]);
    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
    await pool.end?.();
    process.exit(failures === 0 ? 0 : 1);
  }
})();
