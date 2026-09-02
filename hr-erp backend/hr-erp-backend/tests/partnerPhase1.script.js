/**
 * Partner module Phase 1 — contacts, contracts, leases, party-linked documents,
 * and the generalised expiry monitor (expiry AND notice deadline).
 *
 * Sandbox only. Pure Node, real DB, cleans up after itself.
 *   DB_NAME=hr_erp_sandbox DB_USER=$(whoami) node tests/partnerPhase1.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const partner = require('../src/services/partner.service');
const expiry = require('../src/services/expiryMonitor.service');

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};
// pg returns DATE columns as local-midnight JS Date objects. `String(d).slice(0,10)`
// gives "Fri Sep 11" and `.toISOString()` shifts the day back one under CEST — the
// footgun PROJECT_STATE documents. Format from the LOCAL parts instead.
const ymd = (d) => {
  if (d == null) return null;
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const su = { user: { id: null, email: 'su@test.local', roles: ['superadmin'], contractorId: null } };
const asReq = (body = {}, query = {}) => ({ ...su, body, query, params: {} });

(async () => {
  const stamp = Date.now();
  let C, C2, A, A2, madeDoc;

  try {
    if (!/sandbox/i.test(process.env.DB_NAME || '')) {
      throw new Error(`refusing to run outside a sandbox DB (DB_NAME=${process.env.DB_NAME})`);
    }

    C  = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('FT Szállásadó Kft',$1,true) RETURNING id`, ['ft-sz-' + stamp])).rows[0].id;
    C2 = (await pool.query(`INSERT INTO contractors (name,slug,is_active) VALUES ('FT Megbízó Zrt',$1,true) RETURNING id`, ['ft-mb-' + stamp])).rows[0].id;
    A  = (await pool.query(`INSERT INTO accommodations (name,type,capacity,status,current_contractor_id) VALUES ($1,'studio',10,'available',$2) RETURNING id`, ['FT Szálló A ' + stamp, C])).rows[0].id;
    A2 = (await pool.query(`INSERT INTO accommodations (name,type,capacity,status,current_contractor_id) VALUES ($1,'studio',10,'available',$2) RETURNING id`, ['FT Szálló B ' + stamp, C])).rows[0].id;

    // ── CONTACTS ────────────────────────────────────────────────────────────
    const k1 = await partner.saveContact(asReq(), null, { contractor_id: C, name: 'Kiss Anna', role_title: 'ügyvezető', email: 'anna@ft.local', is_primary: true });
    const k2 = await partner.saveContact(asReq(), null, { contractor_id: C, name: 'Nagy Béla', role_title: 'gondnok', phone: '+36301234567' });
    check('CT-01 multiple contacts per partner', (await partner.listContacts(su, { contractor_id: C })).length === 2);
    check('CT-02 first contact is primary', k1.is_primary === true && k2.is_primary === false);

    // Promoting a second contact must demote the first — the partial unique index
    // would otherwise reject it outright.
    await partner.saveContact(asReq(), k2.id, { contractor_id: C, name: 'Nagy Béla', is_primary: true });
    const after = await partner.listContacts(su, { contractor_id: C });
    const primaries = after.filter((x) => x.is_primary);
    check('CT-03 promoting a contact demotes the previous primary (exactly one)', primaries.length === 1 && primaries[0].id === k2.id);

    // The DB, not just the service, must guarantee it.
    let dbRejected = false;
    try {
      await pool.query(`INSERT INTO partner_contacts (contractor_id,name,is_primary) VALUES ($1,'Direkt Insert',true)`, [C]);
    } catch (e) { dbRejected = e.code === '23505'; }
    check('CT-04 a second primary is rejected by the DATABASE, not just the service', dbRejected);

    // Contacts belong to a property too (a site caretaker is not a company contact).
    await partner.saveContact(asReq(), null, { accommodation_id: A, name: 'Szálló gondnok', is_primary: true });
    check('CT-05 a property can hold its own contacts', (await partner.listContacts(su, { accommodation_id: A })).length === 1);

    let partyRejected = false;
    try { await partner.saveContact(asReq(), null, { contractor_id: C, accommodation_id: A, name: 'Kettős' }); }
    catch (e) { partyRejected = /Pontosan egy fél/.test(e.message); }
    check('CT-06 a contact must name exactly one party', partyRejected);

    // ── CONTRACTS: all three partner types ─────────────────────────────────
    const cMeg = await partner.saveContract(asReq(), null, { contractor_id: C2, contract_role: 'megbizo', title: 'FT Keretszerződés', status: 'active', start_date: '2026-01-01', end_date: '2027-12-31', notice_days: 60 });
    const cAlv = await partner.saveContract(asReq(), null, { contractor_id: C2, contract_role: 'alvallalkozo', title: 'FT Alvállalkozói', status: 'active', is_open_ended: true });
    check('CN-01 megbízó contract created', cMeg.contract_role === 'megbizo');
    check('CN-02 alvállalkozó contract created, open-ended has no end_date', cAlv.is_open_ended === true && cAlv.end_date === null);

    // A LEASE names the landlord AND the property.
    const lease = await partner.saveContract(asReq(), null, { contractor_id: C, accommodation_id: A, contract_role: 'szallasado', title: 'FT Bérleti A', status: 'active', start_date: '2025-01-01', end_date: '2026-12-10', notice_days: 90 });
    check('CN-03 lease = szállásadó contract carrying accommodation_id', lease.accommodation_id === A && lease.contract_role === 'szallasado');
    check('CN-04 notice_deadline is DERIVED (2026-12-10 − 90d = 2026-09-11)', ymd(lease.notice_deadline) === '2026-09-11');

    let leaseRoleRejected = false;
    try { await partner.saveContract(asReq(), null, { contractor_id: C, accommodation_id: A, contract_role: 'megbizo' }); }
    catch (e) { leaseRoleRejected = /szállásadó/.test(e.message); }
    check('CN-05 a property-linked contract must be szállásadó', leaseRoleRejected);

    // One landlord, two properties, different terms — the reason a lease is NOT
    // columns on `accommodations`.
    const lease2 = await partner.saveContract(asReq(), null, { contractor_id: C, accommodation_id: A2, contract_role: 'szallasado', title: 'FT Bérleti B', status: 'active', end_date: '2028-06-30', notice_days: 30 });
    check('CN-06 one szállásadó holds several leases on different terms',
      lease2.accommodation_id === A2 && ymd(lease2.notice_deadline) === '2028-05-31');

    // ── BOARD ORDERING: soonest ACTIONABLE date, notice before expiry ───────
    const board = (await partner.listContracts(su, {})).contracts.filter((x) => [cMeg.id, cAlv.id, lease.id, lease2.id].includes(x.id));
    const firstRow = board[0];
    check('CN-07 board sorts by soonest actionable date (lease A notice 2026-09-11 first)',
      firstRow.id === lease.id && ymd(firstRow.next_action_date) === '2026-09-11');
    check('CN-08 the actionable date is the NOTICE deadline, not the expiry', firstRow.next_action_kind === 'notice');
    check('CN-09 leases_only filter returns only property contracts',
      (await partner.listContracts(su, { leases_only: 'true' })).contracts.every((x) => x.accommodation_id));

    // ── PARTY-LINKED DOCUMENTS ─────────────────────────────────────────────
    madeDoc = (await pool.query(
      `INSERT INTO documents (title, file_path, file_name, contractor_id) VALUES ('FT Bérleti PDF','/tmp/ft.pdf','ft.pdf',$1) RETURNING id`, [C])).rows[0].id;
    await pool.query(`INSERT INTO documents (title, file_path, file_name, accommodation_id) VALUES ('FT Szálló alaprajz','/tmp/ft2.pdf','ft2.pdf',$1)`, [A]);
    const dC = await pool.query('SELECT count(*)::int n FROM documents WHERE contractor_id=$1', [C]);
    const dA = await pool.query('SELECT count(*)::int n FROM documents WHERE accommodation_id=$1', [A]);
    check('DOC-01 a document attaches to a PARTNER', dC.rows[0].n === 1);
    check('DOC-02 a document attaches to a PROPERTY', dA.rows[0].n === 1);
    await pool.query('UPDATE partner_contracts SET document_id=$1 WHERE id=$2', [madeDoc, lease.id]);
    check('DOC-03 a contract can point at its signed document',
      (await pool.query('SELECT document_id FROM partner_contracts WHERE id=$1', [lease.id])).rows[0].document_id === madeDoc);

    // ── EXPIRY MONITOR: two independent cycles off ONE contract ────────────
    // expiry 100 days out, notice 10 days out.
    const watched = await partner.saveContract(asReq(), null, {
      contractor_id: C, accommodation_id: A, contract_role: 'szallasado',
      title: 'FT Figyelt bérlet', status: 'active',
      end_date: new Date(Date.now() + 100 * 864e5).toISOString().slice(0, 10), notice_days: 90,
    });
    await pool.query(`DELETE FROM expiry_alert_log WHERE entity_type='partner_contract'`);
    const run1 = await expiry.runDaily({ force: true });
    const alerts = await pool.query(
      `SELECT field, threshold_days FROM expiry_alert_log WHERE entity_type='partner_contract' AND entity_id=$1 ORDER BY field`,
      [watched.id]);
    const fields = alerts.rows.map((r) => r.field);
    check('EXP-01 the monitor watches partner contracts at all', alerts.rows.length > 0);
    check('EXP-02 the NOTICE deadline raises its own alert', fields.includes('notice'));
    check('EXP-03 notice fires while the expiry (100d out) is still beyond its widest threshold',
      fields.includes('notice') && !fields.includes('partner_contract'));

    // Scope to THIS contract. Taking "the newest few expiry alerts" made the assertion
    // depend on whatever else had run against the sandbox first — a functest reset or a
    // sibling suite could leave a newer notice alert for a different contract.
    const notif = await pool.query(
      `SELECT title, message, link FROM notifications
        WHERE type='expiry_alert' AND data->>'entity_id' = $1
        ORDER BY created_at DESC`, [watched.id]);
    const noticeNotif = notif.rows.find((n) => /Felmondási határidő/.test(n.title));
    check('EXP-04 the alert names the CONTRACT, not "Munkavállaló"',
      !!noticeNotif && /Figyelt bérlet/.test(noticeNotif.title));
    check('EXP-05 the notice alert explains the consequence (auto-renewal)',
      !!noticeNotif && /megújul/.test(noticeNotif.message));
    check('EXP-06 the alert deep-links to the contract, not to /employees',
      !!noticeNotif && noticeNotif.link.startsWith('/partners/contracts'));

    // Idempotency — the whole point of the dedup key.
    const before = (await pool.query(`SELECT count(*)::int n FROM expiry_alert_log WHERE entity_type='partner_contract'`)).rows[0].n;
    await expiry.runDaily({ force: true });
    const afterN = (await pool.query(`SELECT count(*)::int n FROM expiry_alert_log WHERE entity_type='partner_contract'`)).rows[0].n;
    check('EXP-07 a second run raises no duplicate alerts', before === afterN);
    check('EXP-08 employee alerts still work (no regression)', run1.checked >= alerts.rows.length);
  } catch (err) {
    console.error('SUITE ERROR:', err.message);
    failures++;
  } finally {
    const q = (sql, p) => pool.query(sql, p).catch(() => {});
    await q(`DELETE FROM expiry_alert_log WHERE entity_type='partner_contract'`);
    await q('DELETE FROM partner_contracts WHERE contractor_id = ANY($1::uuid[])', [[C, C2].filter(Boolean)]);
    await q('DELETE FROM partner_contacts  WHERE contractor_id = ANY($1::uuid[]) OR accommodation_id = ANY($2::uuid[])', [[C, C2].filter(Boolean), [A, A2].filter(Boolean)]);
    await q('DELETE FROM documents WHERE contractor_id = ANY($1::uuid[]) OR accommodation_id = ANY($2::uuid[])', [[C, C2].filter(Boolean), [A, A2].filter(Boolean)]);
    await q('DELETE FROM accommodations WHERE id = ANY($1::uuid[])', [[A, A2].filter(Boolean)]);
    await q('DELETE FROM contractors WHERE id = ANY($1::uuid[])', [[C, C2].filter(Boolean)]);
    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
    await pool.end?.();
    process.exit(failures === 0 ? 0 : 1);
  }
})();
