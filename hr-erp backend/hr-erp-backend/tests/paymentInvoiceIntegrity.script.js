/**
 * Regression: payment→invoice status is race-safe + terminal-guarded, and the
 * invoice editor persists contractor_id (audit #6-7 money paths).
 *
 * - Concurrent partial payments must serialize on the invoice row (FOR UPDATE)
 *   and both land — no lost update, correct final status.
 * - A cancelled invoice must NOT be auto-resurrected to paid by a payment.
 * - PUT /invoices update must persist contractor_id (was silently dropped).
 *
 * Pure Node, real DB, cleans up. Run: node tests/paymentInvoiceIntegrity.script.js
 */
require('dotenv').config();
const pool = require('../src/database/connection');
const paymentService = require('../src/services/payment.service');
const invoiceCtrl = require('../src/controllers/invoice.controller');

function mockRes() {
  return { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} };
}
let failures = 0;
const check = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

async function mkInvoice(total, cc, contractor, status = 'draft') {
  const r = await pool.query(
    `INSERT INTO invoices (amount, total_amount, invoice_date, cost_center_id, contractor_id, payment_status, vendor_name)
     VALUES ($1, $1, CURRENT_DATE, $2, $3, $4, 'ZZ Test Vendor') RETURNING id`,
    [total, cc, contractor, status]
  );
  return r.rows[0].id;
}
const statusOf = async (id) => (await pool.query('SELECT payment_status FROM invoices WHERE id=$1', [id])).rows[0].payment_status;
const paidSum = async (id) => Number((await pool.query('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE invoice_id=$1', [id])).rows[0].s);

(async () => {
  const cc = (await pool.query('SELECT id FROM cost_centers LIMIT 1')).rows[0]?.id;
  const contractorA = '00000000-0000-0000-0000-000000000001';
  const contractorB = (await pool.query(`SELECT id FROM contractors WHERE id <> $1 LIMIT 1`, [contractorA])).rows[0]?.id || contractorA;
  const admin = (await pool.query(`SELECT id FROM users WHERE email='admin@hr-erp.com'`)).rows[0].id;
  if (!cc) { console.log('SKIP: no cost_center to seed with'); process.exit(0); }
  const ids = [];

  try {
    // --- 1. Concurrent partial payments: both land, final = paid, no lost update ---
    const inv1 = await mkInvoice(100, cc, contractorA); ids.push(inv1);
    const pay = (amt) => paymentService.create(
      { invoice_id: inv1, amount: amt, payment_date: '2026-07-03', payment_method: 'bank_transfer' }, admin);
    const results = await Promise.all([pay(60), pay(60)]);
    check('both concurrent payments succeeded (no error)', results.every(r => r.data && !r.error));
    check('both payments persisted — no lost update (sum=120)', await paidSum(inv1) === 120);
    check('final invoice status = paid (120 >= 100)', await statusOf(inv1) === 'paid');

    // --- 2. Cancelled invoice is NOT resurrected by a payment ---
    const inv2 = await mkInvoice(100, cc, contractorA, 'cancelled'); ids.push(inv2);
    const r2 = await paymentService.create(
      { invoice_id: inv2, amount: 100, payment_date: '2026-07-03', payment_method: 'bank_transfer' }, admin);
    check('payment on cancelled invoice still records', r2.data && !r2.error);
    check('cancelled invoice stays cancelled (NOT resurrected to paid)', await statusOf(inv2) === 'cancelled');

    // --- 3. Invoice update persists contractor_id (was dropped) ---
    const inv3 = await mkInvoice(50, cc, contractorA); ids.push(inv3);
    const res = mockRes();
    await invoiceCtrl.update(
      { params: { id: inv3 }, body: { contractor_id: contractorB }, user: { id: admin, contractorId: contractorA } },
      res
    );
    const after = (await pool.query('SELECT contractor_id FROM invoices WHERE id=$1', [inv3])).rows[0].contractor_id;
    check('invoice update returns 200', res.statusCode === 200);
    check('contractor_id now persists on update', after === contractorB);
  } finally {
    for (const id of ids) {
      await pool.query('DELETE FROM payments WHERE invoice_id=$1', [id]).catch(()=>{});
      await pool.query('DELETE FROM invoices WHERE id=$1', [id]).catch(()=>{});
    }
  }

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
