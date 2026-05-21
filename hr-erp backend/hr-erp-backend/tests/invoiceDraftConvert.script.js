/**
 * invoice_drafts → accommodation_expenses conversion — HTTP smoke.
 *
 * Seeds a synthetic draft (with a real PDF on disk), exercises
 * POST /api/v1/invoice-drafts/:id/convert, asserts:
 *   • expense row created with draft metadata pulled in as fallback
 *   • PDF copied to the new expense's file_attachments
 *   • draft transitions to status='converted' with final_expense_id
 *   • idempotency: re-convert returns 409 with the existing
 *     final_expense_id
 *   • list filter ?status=pending excludes converted rows
 *
 * Cleans up: deletes seeded draft + expense + activity logs +
 * the temporary PDF on disk.
 */

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const { query, closePool } = require('../src/database/connection');
const storage = require('../src/services/storage.service');

const BASE = 'http://localhost:3001';

let passed = 0;
let failed = 0;
const createdDraftIds = [];
const createdExpenseIds = [];
const tempPdfPaths = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${error.message}`);
  }
}

async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

/**
 * Read a YYYY-MM-DD from whatever the API serialised a DATE column to.
 * pg returns DATE as a local-midnight Date; Express JSON.stringify converts
 * via .toISOString() to UTC, which shifts the day by -1 under CEST. Same
 * fix pattern as frontend fmtDateInput / billingEngine localDateStr.
 *
 * Asserts in the test MUST use this, NOT String(v).slice(0,10), or the
 * tests pretend the API is broken when it isn't.
 */
function asLocalDate(v) {
  if (!v) return null;
  // Already a plain YYYY-MM-DD string? Pass through.
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function cleanup() {
  try {
    if (createdExpenseIds.length > 0) {
      await query(
        'DELETE FROM activity_logs WHERE entity_id = ANY($1::uuid[])',
        [createdExpenseIds],
      );
      await query(
        'DELETE FROM accommodation_expenses WHERE id = ANY($1::uuid[])',
        [createdExpenseIds],
      );
    }
    if (createdDraftIds.length > 0) {
      await query(
        'DELETE FROM activity_logs WHERE entity_id = ANY($1::uuid[])',
        [createdDraftIds],
      );
      await query(
        'DELETE FROM invoice_drafts WHERE id = ANY($1::uuid[])',
        [createdDraftIds],
      );
    }
    for (const p of tempPdfPaths) {
      await fs.unlink(p).catch(() => {});
    }
    // remove storage-side expense directories
    for (const id of createdExpenseIds) {
      const root = path.join(storage.UPLOAD_ROOT, 'expenses');
      try {
        const years = await fs.readdir(root);
        for (const y of years) {
          const months = await fs.readdir(path.join(root, y)).catch(() => []);
          for (const m of months) {
            await fs.rm(path.join(root, y, m, id), { recursive: true, force: true }).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.error('Cleanup failed:', e.message);
  }
}

async function main() {
  // ── Bootstrap ────────────────────────────────────────────────────────
  const u = await query(
    `SELECT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id = ur.role_id
     WHERE r.slug = 'superadmin' AND u.is_active = true LIMIT 1`,
  );
  if (u.rows.length === 0) throw new Error('No superadmin in DB');
  const token = jwt.sign({ userId: u.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const acc = await query('SELECT id FROM accommodations LIMIT 1');
  const accId = acc.rows[0].id;

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const get  = async (p) => { const r = await fetch(`${BASE}${p}`, { headers }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const post = async (p, b) => { const r = await fetch(`${BASE}${p}`, { method: 'POST', headers, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

  // ── Seed: synthetic draft + real PDF on disk ────────────────────────
  const tag = `dc-${Date.now()}`;
  const pdfDir = path.join(__dirname, '..', 'uploads', 'documents');
  await fs.mkdir(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, `${tag}.pdf`);
  const pdfBuf = Buffer.from('%PDF-1.4\nconvert-test-fixture\n%%EOF\n');
  await fs.writeFile(pdfPath, pdfBuf);
  tempPdfPaths.push(pdfPath);

  const draftIns = await query(
    `INSERT INTO invoice_drafts
       (vendor_name, vendor_tax_number, invoice_number,
        invoice_date, performance_date, due_date,
        pdf_file_path, description, extracted_data, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'pending')
     RETURNING id`,
    [
      `${tag}-vendor`, '12345678-1-00', `${tag}-INV-001`,
      '2026-04-11',          // invoice_date (April)
      '2026-03-31',          // performance_date (March — the VAT period)
      '2026-04-25',
      pdfPath, `${tag} OCR-extracted description text`,
      JSON.stringify({
        vendorName: `${tag}-vendor`,
        invoiceNumber: `${tag}-INV-001`,
        invoiceDate: '2026-04-11',
        performanceDate: '2026-03-31',
      }),
    ],
  );
  const draftId = draftIns.rows[0].id;
  createdDraftIds.push(draftId);

  // ──────────────────────────────────────────────────────────────────────
  // 1. List filter: pending includes the new draft
  // ──────────────────────────────────────────────────────────────────────

  await describe('Pending list', async () => {
    await test('GET /invoice-drafts?status=pending includes new draft', async () => {
      const r = await get('/api/v1/invoice-drafts?status=pending&limit=100');
      if (r.status !== 200) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      // Response shape: { success, data: { drafts, ... } } per controller — robust pluck:
      const list = r.body?.data?.drafts || r.body?.data || r.body?.drafts || [];
      if (!Array.isArray(list)) throw new Error('list not array');
      if (!list.some((d) => d.id === draftId)) throw new Error('seed draft missing from pending list');
    });

    // ── Response-shape contract ─────────────────────────────────────
    // The 2026-05-21 "drafts have empty fields" bug was a pure
    // frontend/backend key-name mismatch: formatDraft returns
    // camelCase, the UI was reading snake_case. The HTTP smoke
    // previously asserted on DB rows directly (snake_case) and missed
    // it. This block locks the wire format so a future controller
    // refactor that silently flips back to snake_case (or drops a
    // field) breaks the test immediately.
    await test('list response uses camelCase keys (NOT snake_case)', async () => {
      const r = await get('/api/v1/invoice-drafts?status=pending&limit=100');
      const list = r.body?.data?.drafts || r.body?.data || r.body?.drafts || [];
      const row = list.find((d) => d.id === draftId);
      if (!row) throw new Error('seed draft missing');

      // Camel-case keys MUST be present on every row.
      // performanceDate added by migration 116 — it's required even when null.
      const required = [
        'vendorName', 'vendorTaxNumber', 'invoiceNumber',
        'invoiceDate', 'performanceDate', 'dueDate',
        'pdfFilePath', 'description',
      ];
      for (const k of required) {
        if (!(k in row)) throw new Error(`response missing camelCase key: ${k}`);
      }
      // Snake-case must NOT appear (would mean a regression to old shape)
      const forbidden = [
        'vendor_name', 'vendor_tax_number', 'invoice_number',
        'invoice_date', 'due_date', 'pdf_file_path',
        'performance_date',
      ];
      for (const k of forbidden) {
        if (k in row) throw new Error(`response leaks snake_case key: ${k}`);
      }
      // Values for the seed draft should round-trip correctly
      if (row.vendorName !== `${tag}-vendor`) throw new Error(`vendorName=${row.vendorName}`);
      if (row.invoiceNumber !== `${tag}-INV-001`) throw new Error(`invoiceNumber=${row.invoiceNumber}`);
      if (row.vendorTaxNumber !== '12345678-1-00') throw new Error('vendorTaxNumber lost');
      // performanceDate round-trips — pg returns a Date for DATE; JSON
      // serialises to UTC ISO string with day-1 under CEST. asLocalDate()
      // extracts the original local day, matching the frontend pattern.
      const perf = asLocalDate(row.performanceDate);
      if (perf !== '2026-03-31') throw new Error(`performanceDate=${perf}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. Convert — happy path
  // ──────────────────────────────────────────────────────────────────────

  let expenseId;
  await describe('Convert — happy path', async () => {
    const r = await post(`/api/v1/invoice-drafts/${draftId}/convert`, {
      accommodation_id: accId,
      billing_month: '1887-04',
      // Caller-provided performance_date wins over draft.performance_date.
      performance_date: '1887-04-11',
      category: 'rezsi',
      amount: 12700,
      vat_rate: 27,
      // intentionally omit vendor_name / invoice_number / invoice_date —
      // the convert endpoint should fill them from the draft.
      notes: tag,
    });
    await test('POST /:id/convert → 201 with expense + draft id', async () => {
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      if (!r.body.data?.expense?.id) throw new Error('no expense id in response');
      if (r.body.data.invoice_draft_id !== draftId) throw new Error('draft id mismatch');
      expenseId = r.body.data.expense.id;
      createdExpenseIds.push(expenseId);
    });

    await test('expense carries draft vendor + invoice metadata as fallback', async () => {
      const e = r.body.data.expense;
      if (e.vendor_name !== `${tag}-vendor`) throw new Error(`vendor=${e.vendor_name}`);
      if (e.vendor_tax_number !== '12345678-1-00') throw new Error('tax number lost');
      if (e.invoice_number !== `${tag}-INV-001`) throw new Error('invoice_number lost');
      if (!e.invoice_date) throw new Error('invoice_date lost');
    });

    await test('expense source is email_ocr', async () => {
      if (r.body.data.expense.source !== 'email_ocr') {
        throw new Error(`source=${r.body.data.expense.source}`);
      }
    });

    await test('expense has VAT auto-fill from rate 27', async () => {
      const e = r.body.data.expense;
      if (parseFloat(e.net_amount) !== 10000) throw new Error(`net=${e.net_amount}`);
      if (parseFloat(e.vat_amount) !== 2700) throw new Error(`vat=${e.vat_amount}`);
    });

    await test('PDF copied into expense.file_attachments', async () => {
      const e = r.body.data.expense;
      if (!Array.isArray(e.file_attachments) || e.file_attachments.length !== 1) {
        throw new Error(`file_attachments=${JSON.stringify(e.file_attachments)}`);
      }
      const f = e.file_attachments[0];
      if (f.mime !== 'application/pdf') throw new Error(`mime=${f.mime}`);
      // verify the bytes really landed
      const buf = await storage.read(f.path);
      if (!buf.equals(pdfBuf)) throw new Error('disk content mismatch');
    });

    await test('draft now has status=converted + final_expense_id', async () => {
      const db = await query('SELECT status, final_expense_id, reviewed_by, reviewed_at FROM invoice_drafts WHERE id = $1', [draftId]);
      const row = db.rows[0];
      if (row.status !== 'converted') throw new Error(`status=${row.status}`);
      if (row.final_expense_id !== expenseId) throw new Error('final_expense_id mismatch');
      if (!row.reviewed_by) throw new Error('reviewed_by not set');
      if (!row.reviewed_at) throw new Error('reviewed_at not set');
    });

    await test('activity_logs has draft_convert + from_draft entries', async () => {
      const r1 = await query("SELECT action FROM activity_logs WHERE entity_id = $1 AND action = 'draft_convert'", [draftId]);
      if (r1.rows.length === 0) throw new Error('draft_convert log missing');
      const r2 = await query("SELECT action FROM activity_logs WHERE entity_id = $1 AND action = 'from_draft'", [expenseId]);
      if (r2.rows.length === 0) throw new Error('from_draft log missing');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. Idempotency — re-convert returns 409 with existing link
  // ──────────────────────────────────────────────────────────────────────

  await describe('Idempotency', async () => {
    await test('second convert returns 409 with existing final_expense_id', async () => {
      const r = await post(`/api/v1/invoice-drafts/${draftId}/convert`, {
        accommodation_id: accId, billing_month: '1887-04',
        category: 'rezsi', amount: 999, notes: 'should-be-rejected',
      });
      if (r.status !== 409) throw new Error(`got ${r.status}`);
      if (r.body.final_expense_id !== expenseId) {
        throw new Error(`expected ${expenseId}, got ${r.body.final_expense_id}`);
      }
    });

    await test('no second expense was created', async () => {
      // Search by the marker notes from the rejected attempt
      const r = await query(
        "SELECT id FROM accommodation_expenses WHERE notes = 'should-be-rejected'",
      );
      if (r.rows.length > 0) throw new Error('phantom second expense created');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. Pending list no longer includes the converted draft
  // ──────────────────────────────────────────────────────────────────────

  await describe('Pending list excludes converted', async () => {
    await test('?status=pending no longer returns the seed draft', async () => {
      const r = await get('/api/v1/invoice-drafts?status=pending&limit=100');
      const list = r.body?.data?.drafts || r.body?.data || r.body?.drafts || [];
      if (list.some((d) => d.id === draftId)) throw new Error('converted draft still in pending');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. Non-pending status guard (e.g., already rejected)
  // ──────────────────────────────────────────────────────────────────────

  await describe('Non-pending status rejected', async () => {
    const rejected = await query(
      `INSERT INTO invoice_drafts (vendor_name, status) VALUES ($1, 'rejected') RETURNING id`,
      [`${tag}-rejected`],
    );
    const rejId = rejected.rows[0].id;
    createdDraftIds.push(rejId);

    await test("convert on status='rejected' draft returns 409", async () => {
      const r = await post(`/api/v1/invoice-drafts/${rejId}/convert`, {
        accommodation_id: accId, billing_month: '1887-04',
        category: 'rezsi', amount: 100,
      });
      if (r.status !== 409) throw new Error(`got ${r.status}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Convert priority chain for performance_date
  //   caller > draft.performance_date > draft.invoice_date > null
  // ──────────────────────────────────────────────────────────────────────

  await describe('Convert performance_date priority', async () => {
    await test('uses draft.performance_date when caller omits it', async () => {
      const ins = await query(
        `INSERT INTO invoice_drafts
           (vendor_name, invoice_date, performance_date, pdf_file_path, status)
         VALUES ($1, $2, $3, NULL, 'pending')
         RETURNING id`,
        [`${tag}-perf`, '2026-04-11', '2026-03-31'],
      );
      const id = ins.rows[0].id;
      createdDraftIds.push(id);

      const r = await post(`/api/v1/invoice-drafts/${id}/convert`, {
        accommodation_id: accId,
        billing_month: '1887-03',
        category: 'rezsi',
        amount: 1000,
        // no performance_date in body → should fall to draft.performance_date
      });
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      createdExpenseIds.push(r.body.data.expense.id);

      const perf = asLocalDate(r.body.data.expense.performance_date);
      if (perf !== '2026-03-31') throw new Error(`expected 2026-03-31, got ${perf}`);
    });

    await test('falls back to draft.invoice_date when draft.performance_date is null (legacy drafts)', async () => {
      const ins = await query(
        `INSERT INTO invoice_drafts
           (vendor_name, invoice_date, performance_date, pdf_file_path, status)
         VALUES ($1, $2, NULL, NULL, 'pending')
         RETURNING id`,
        [`${tag}-legacy`, '2026-02-15'],
      );
      const id = ins.rows[0].id;
      createdDraftIds.push(id);

      const r = await post(`/api/v1/invoice-drafts/${id}/convert`, {
        accommodation_id: accId,
        billing_month: '1887-02',
        category: 'rezsi',
        amount: 500,
      });
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      createdExpenseIds.push(r.body.data.expense.id);

      const perf = asLocalDate(r.body.data.expense.performance_date);
      if (perf !== '2026-02-15') throw new Error(`expected 2026-02-15 (invoice_date fallback), got ${perf}`);
    });

    await test('caller-supplied performance_date overrides both draft values', async () => {
      const ins = await query(
        `INSERT INTO invoice_drafts
           (vendor_name, invoice_date, performance_date, pdf_file_path, status)
         VALUES ($1, $2, $3, NULL, 'pending')
         RETURNING id`,
        [`${tag}-override`, '2026-04-11', '2026-03-31'],
      );
      const id = ins.rows[0].id;
      createdDraftIds.push(id);

      const r = await post(`/api/v1/invoice-drafts/${id}/convert`, {
        accommodation_id: accId,
        billing_month: '1887-01',
        category: 'rezsi',
        amount: 1000,
        performance_date: '2026-01-15', // caller wins
      });
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      createdExpenseIds.push(r.body.data.expense.id);

      const perf = asLocalDate(r.body.data.expense.performance_date);
      if (perf !== '2026-01-15') throw new Error(`expected caller value 2026-01-15, got ${perf}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // OCR regex extraction — verify performanceDate pulled from Hungarian text
  // (no Claude API call — exercises the regex fallback path).
  // ──────────────────────────────────────────────────────────────────────

  await describe('OCR regex — Hungarian teljesítés extraction', async () => {
    const claudeOCR = require('../src/services/claudeOCR.service');

    const HU_SAMPLE = `Számla
Számla sorszám: 2026/0042
Eladó: Vodafone Zrt.
Adószám: 11999999-2-44
Kelte: 2026.04.11.
Teljesítés dátuma: 2026.03.31.
Fizetési határidő: 2026.04.25.
Nettó összeg: 10 000 Ft
ÁFA 27%: 2 700 Ft
Bruttó összeg: 12 700 Ft
Pénznem: HUF`;

    await test('parseInvoiceText extracts performanceDate from "Teljesítés dátuma"', async () => {
      const r = claudeOCR.parseInvoiceText(HU_SAMPLE);
      if (r.performanceDate !== '2026-03-31') {
        throw new Error(`performanceDate=${r.performanceDate}`);
      }
      // Sanity: other dates still extracted correctly
      if (r.invoiceDate !== '2026-04-11') throw new Error(`invoiceDate=${r.invoiceDate}`);
      if (r.dueDate !== '2026-04-25') throw new Error(`dueDate=${r.dueDate}`);
    });

    await test('parseInvoiceText handles "Telj.:" abbreviation', async () => {
      const r = claudeOCR.parseInvoiceText('Vendor X\nTelj.: 2026.05.20.\nBruttó: 1000 Ft');
      if (r.performanceDate !== '2026-05-20') throw new Error(`got ${r.performanceDate}`);
    });

    await test('parseInvoiceText returns null when teljesítés is absent', async () => {
      const r = claudeOCR.parseInvoiceText('Vendor Y\nKelte: 2026.06.01.\nBruttó: 500 Ft');
      if (r.performanceDate !== null) throw new Error(`got ${r.performanceDate}`);
      if (r.invoiceDate !== '2026-06-01') throw new Error('invoiceDate regression');
    });

    await test('vatRate quality check — 27% extracts cleanly', async () => {
      const r = claudeOCR.parseInvoiceText(HU_SAMPLE);
      if (r.vatRate !== '27%') throw new Error(`vatRate=${r.vatRate}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. Convert without PDF (graceful — PDF copy is non-fatal)
  // ──────────────────────────────────────────────────────────────────────

  await describe('Convert without PDF', async () => {
    const noPdf = await query(
      `INSERT INTO invoice_drafts (vendor_name, status) VALUES ($1, 'pending') RETURNING id`,
      [`${tag}-nopdf`],
    );
    const noPdfId = noPdf.rows[0].id;
    createdDraftIds.push(noPdfId);

    await test('convert succeeds with empty file_attachments', async () => {
      const r = await post(`/api/v1/invoice-drafts/${noPdfId}/convert`, {
        accommodation_id: accId, billing_month: '1887-05',
        category: 'egyeb', amount: 500, notes: 'nopdf',
      });
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      createdExpenseIds.push(r.body.data.expense.id);
      const atts = r.body.data.expense.file_attachments;
      if (!Array.isArray(atts) || atts.length !== 0) throw new Error('expected empty attachments');
    });
  });
}

(async () => {
  let exitCode = 0;
  try {
    await main();
  } catch (e) {
    console.error('\nFATAL:', e.message);
    console.error(e.stack);
    exitCode = 1;
  } finally {
    await cleanup();
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`${'='.repeat(40)}\n`);
    await closePool();
    if (failed > 0 || exitCode !== 0) process.exit(1);
  }
})();
