/**
 * Regression: employee documents are tenant-scoped for staff (audit finding #3).
 *
 * Before the fix, resolveDocScope returned {selfScoped:false} for ALL staff with
 * no contractor filter, and update/delete didn't scope at all — so a staff user
 * of contractor A with documents.* could read/edit/delete/download contractor B's
 * employee documents (salary/PII). Now every path scopes to the caller's
 * contractor (superadmin excepted); the document's tenant is its employee's
 * contractor (documents.tenant_id fallback).
 *
 * Pure Node, real DB, cleans up. Run: node tests/documentTenantScope.script.js
 * (needs Postgres; honors DB_* env).
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const ctrl = require('../src/controllers/document.controller');

const A = '00000000-0000-0000-0000-000000000001'; // existing contractor

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader() {}, send() {},
  };
}
let failures = 0;
function check(label, cond) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; }

(async () => {
  const cB = await pool.query(
    `INSERT INTO contractors (name, slug, is_active) VALUES ('ZZ Doc Test', $1, true) RETURNING id`,
    ['zz-doc-test-' + Date.now()]
  );
  const B = cB.rows[0].id;
  const eB = await pool.query(
    `INSERT INTO employees (contractor_id, first_name, last_name) VALUES ($1, 'Doc', 'TestB') RETURNING id`, [B]
  );
  const empB = eB.rows[0].id;
  const dB = await pool.query(
    `INSERT INTO documents (title, file_path, file_name, employee_id) VALUES ('DocB', '/tmp/docb.pdf', 'docb.pdf', $1) RETURNING id`, [empB]
  );
  const docB = dB.rows[0].id;
  const admin = await pool.query(`SELECT id FROM users WHERE email = 'admin@hr-erp.com' LIMIT 1`);
  const uid = admin.rows[0].id; // real users.id for uploaded_by FK

  const staffA = { user: { id: uid, roles: ['admin'], contractorId: A } };
  const staffB = { user: { id: uid, roles: ['admin'], contractorId: B } };
  const superA = { user: { id: uid, roles: ['superadmin'], contractorId: A } };
  const file = { path: '/tmp/x.pdf', originalname: 'x.pdf', size: 1, mimetype: 'application/pdf' };

  try {
    // --- getDocumentById ---
    let res = mockRes(); await ctrl.getDocumentById({ ...staffA, params: { id: docB } }, res);
    check('staffA getById(docB) -> 404 (cross-tenant)', res.statusCode === 404);
    res = mockRes(); await ctrl.getDocumentById({ ...staffB, params: { id: docB } }, res);
    check('staffB getById(docB) -> 200 (owner)', res.statusCode === 200 && res.body?.data?.document?.id === docB);
    check('  _doc_contractor stripped from response', res.body?.data?.document && !('_doc_contractor' in res.body.data.document));
    res = mockRes(); await ctrl.getDocumentById({ ...superA, params: { id: docB } }, res);
    check('superadmin getById(docB) -> 200 (bypass)', res.statusCode === 200);

    // --- list ---
    res = mockRes(); await ctrl.getDocuments({ ...staffA, query: {} }, res);
    check('staffA list EXCLUDES docB', !(res.body?.data?.documents || []).some(d => d.id === docB));
    res = mockRes(); await ctrl.getDocuments({ ...staffB, query: {} }, res);
    check('staffB list INCLUDES docB', (res.body?.data?.documents || []).some(d => d.id === docB));

    // --- update ---
    res = mockRes(); await ctrl.updateDocument({ ...staffA, params: { id: docB }, body: { title: 'HACK' } }, res);
    check('staffA update(docB) -> 404', res.statusCode === 404);
    const t = await pool.query('SELECT title FROM documents WHERE id = $1', [docB]);
    check('  docB title unchanged after blocked update', t.rows[0].title === 'DocB');
    res = mockRes(); await ctrl.updateDocument({ ...staffB, params: { id: docB }, body: { title: 'DocB2' } }, res);
    check('staffB update(docB) -> 200', res.statusCode === 200);

    // --- createDocument: cross-tenant employee rejected; own-tenant stamps tenant_id ---
    res = mockRes(); await ctrl.createDocument({ ...staffA, file, body: { title: 'X', employee_id: empB } }, res);
    check('staffA create for employeeB -> 404 (cross-tenant employee)', res.statusCode === 404);
    res = mockRes(); await ctrl.createDocument({ ...staffB, file, body: { title: 'Y', employee_id: empB } }, res);
    check('staffB create for employeeB -> 201', res.statusCode === 201);
    check('  new doc stamped tenant_id = B', res.body?.data?.document?.tenant_id === B);

    // --- delete ---
    res = mockRes(); await ctrl.deleteDocument({ ...staffA, params: { id: docB } }, res);
    check('staffA delete(docB) -> 404', res.statusCode === 404);
    const d = await pool.query('SELECT deleted_at FROM documents WHERE id = $1', [docB]);
    check('  docB NOT deleted after blocked delete', d.rows[0].deleted_at === null);
    res = mockRes(); await ctrl.deleteDocument({ ...staffB, params: { id: docB } }, res);
    check('staffB delete(docB) -> 200', res.statusCode === 200);
  } finally {
    await pool.query('DELETE FROM documents WHERE employee_id = $1', [empB]);
    await pool.query('DELETE FROM employees WHERE id = $1', [empB]);
    await pool.query('DELETE FROM contractors WHERE id = $1', [B]);
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
