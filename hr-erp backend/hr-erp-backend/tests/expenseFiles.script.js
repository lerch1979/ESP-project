/**
 * File-attachment endpoint tests for accommodation_expenses.
 *
 * Exercises POST/GET/DELETE /api/v1/expenses/:id/files/:file_id end-to-end
 * via HTTP (multipart). Generates a JWT inline. Cleans up: deletes test
 * expense row + on-disk files on teardown.
 *
 * Run with the backend running on http://localhost:3001.
 */

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const storage = require('../src/services/storage.service');
const { query, closePool } = require('../src/database/connection');

const BASE = 'http://localhost:3001';

let passed = 0;
let failed = 0;
const createdExpenseIds = [];

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

function blob(buf, mime) {
  // Node 18+ has globalThis.Blob and FormData
  return new Blob([buf], { type: mime });
}

async function postFile(token, expense_id, buffer, mime, filename) {
  const fd = new FormData();
  fd.append('file', blob(buffer, mime), filename);
  const r = await fetch(`${BASE}/api/v1/expenses/${expense_id}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function getFile(token, expense_id, file_id) {
  const r = await fetch(`${BASE}/api/v1/expenses/${expense_id}/files/${file_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buf = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null;
  return { status: r.status, contentType: r.headers.get('content-type'), buf };
}

async function deleteFile(token, expense_id, file_id) {
  const r = await fetch(`${BASE}/api/v1/expenses/${expense_id}/files/${file_id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function cleanup() {
  // Remove on-disk dirs for any test expenses we created (best-effort).
  for (const id of createdExpenseIds) {
    try {
      // Path layout: uploads/expenses/<YYYY>/<MM>/<id>/...
      // We don't track YYYY/MM here, so search by glob-ish recursion.
      const expRoot = path.join(storage.UPLOAD_ROOT, 'expenses');
      const exists = await fs.stat(expRoot).then(() => true).catch(() => false);
      if (!exists) continue;
      const years = await fs.readdir(expRoot);
      for (const y of years) {
        const months = await fs.readdir(path.join(expRoot, y)).catch(() => []);
        for (const m of months) {
          const idDir = path.join(expRoot, y, m, id);
          await fs.rm(idDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }
  if (createdExpenseIds.length > 0) {
    await query('DELETE FROM activity_logs WHERE entity_id = ANY($1::uuid[])', [createdExpenseIds]);
    await query('DELETE FROM accommodation_expenses WHERE id = ANY($1::uuid[])', [createdExpenseIds]);
  }
}

async function main() {
  // ── Pre-flight: token + accommodation + create a test expense ─────
  const u = await query(
    `SELECT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id        = ur.role_id
     WHERE r.slug = 'superadmin' AND u.is_active = true
     LIMIT 1`,
  );
  if (u.rows.length === 0) throw new Error('No superadmin user');
  const userId = u.rows[0].id;
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const acc = await query('SELECT id FROM accommodations LIMIT 1');
  const accId = acc.rows[0].id;

  // Create one expense via the API so it exists in DB with billing_month etc.
  const createR = await fetch(`${BASE}/api/v1/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      accommodation_id: accId,
      billing_month: '1896-01',
      performance_date: '1896-01-15',
      category: 'rezsi',
      amount: 1000,
      vendor_name: 'File Test Vendor',
      notes: 'file-test-run',
    }),
  });
  const createBody = await createR.json();
  if (createR.status !== 201) throw new Error(`seed expense failed: ${JSON.stringify(createBody)}`);
  const expenseId = createBody.data.expense.id;
  createdExpenseIds.push(expenseId);

  // ──────────────────────────────────────────────────────────────────
  // Storage adapter — pure / path safety
  // ──────────────────────────────────────────────────────────────────

  await describe('Storage adapter — path safety', async () => {
    await test('rejects path traversal ../', async () => {
      let threw = false;
      try { await storage.read('../etc/passwd'); } catch { threw = true; }
      if (!threw) throw new Error('expected throw');
    });
    await test('rejects absolute path /etc/passwd', async () => {
      let threw = false;
      try { await storage.read('/etc/passwd'); } catch { threw = true; }
      if (!threw) throw new Error('expected throw');
    });
    await test('rejects unknown MIME in save()', async () => {
      let threw = false;
      try {
        await storage.save({
          buffer: Buffer.from('x'), mime: 'text/plain',
          expense_id: expenseId, billing_month: '1896-01',
        });
      } catch { threw = true; }
      if (!threw) throw new Error('expected throw');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Upload happy paths
  // ──────────────────────────────────────────────────────────────────

  let pdfFileId, jpgFileId, pngFileId;
  let pdfPath; // for download body comparison
  const pdfBuf = Buffer.from('%PDF-1.4\nfake-pdf-content-for-tests\n%%EOF');
  const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  await describe('Upload — happy paths', async () => {
    await test('POST PDF → 201 + JSONB updated', async () => {
      const r = await postFile(token, expenseId, pdfBuf, 'application/pdf', 'invoice.pdf');
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      if (!r.body.data?.file?.id) throw new Error('no file.id in response');
      pdfFileId = r.body.data.file.id;
      pdfPath = r.body.data.file.path;
      if (r.body.data.file.mime !== 'application/pdf') throw new Error('mime mismatch');
      if (r.body.data.file.size !== pdfBuf.length) throw new Error('size mismatch');
      if (r.body.data.file.original_name !== 'invoice.pdf') throw new Error('original_name lost');
      const atts = r.body.data.file_attachments;
      if (!Array.isArray(atts) || atts.length !== 1) throw new Error('attachment list wrong');
    });

    await test('PDF actually persisted to disk', async () => {
      const buf = await storage.read(pdfPath);
      if (buf.length !== pdfBuf.length) throw new Error('disk size mismatch');
      if (!buf.equals(pdfBuf)) throw new Error('disk content mismatch');
    });

    await test('POST JPG → 201', async () => {
      const r = await postFile(token, expenseId, jpgBuf, 'image/jpeg', 'photo.jpg');
      if (r.status !== 201) throw new Error(`got ${r.status}`);
      jpgFileId = r.body.data.file.id;
      if (r.body.data.file_attachments.length !== 2) throw new Error('expected 2 attachments');
    });

    await test('POST PNG → 201', async () => {
      const r = await postFile(token, expenseId, pngBuf, 'image/png', 'screenshot.png');
      if (r.status !== 201) throw new Error(`got ${r.status}`);
      pngFileId = r.body.data.file.id;
      if (r.body.data.file_attachments.length !== 3) throw new Error('expected 3 attachments');
    });

    await test('multiple files coexist on same expense', async () => {
      const exp = await query('SELECT file_attachments FROM accommodation_expenses WHERE id = $1', [expenseId]);
      const atts = exp.rows[0].file_attachments;
      if (atts.length !== 3) throw new Error(`expected 3 in DB, got ${atts.length}`);
      const ids = atts.map((a) => a.id).sort();
      const expected = [pdfFileId, jpgFileId, pngFileId].sort();
      if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error('id set mismatch');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Upload — rejections
  // ──────────────────────────────────────────────────────────────────

  await describe('Upload — rejections', async () => {
    await test('text/plain rejected with 400', async () => {
      const r = await postFile(token, expenseId, Buffer.from('hello'), 'text/plain', 'evil.txt');
      if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
    });

    await test('>10 MB rejected with 413', async () => {
      const big = Buffer.alloc(11 * 1024 * 1024, 0x41); // 11 MB
      const r = await postFile(token, expenseId, big, 'application/pdf', 'huge.pdf');
      if (r.status !== 413) throw new Error(`expected 413, got ${r.status}`);
    });

    await test('upload to non-existent expense → 404', async () => {
      const r = await postFile(token, '00000000-0000-0000-0000-000000000000',
                               pdfBuf, 'application/pdf', 'ghost.pdf');
      if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
    });

    await test('upload without file field → 400', async () => {
      const fd = new FormData();
      const r = await fetch(`${BASE}/api/v1/expenses/${expenseId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Download
  // ──────────────────────────────────────────────────────────────────

  await describe('Download', async () => {
    await test('GET existing file → 200 with correct Content-Type + body', async () => {
      const r = await getFile(token, expenseId, pdfFileId);
      if (r.status !== 200) throw new Error(`got ${r.status}`);
      if (!r.contentType?.includes('application/pdf')) throw new Error(`bad content-type ${r.contentType}`);
      if (!r.buf.equals(pdfBuf)) throw new Error('body mismatch');
    });

    await test('GET unknown file_id → 404', async () => {
      const r = await getFile(token, expenseId, '00000000-0000-0000-0000-000000000000');
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });

    await test('GET on unknown expense → 404', async () => {
      const r = await getFile(token, '00000000-0000-0000-0000-000000000000', pdfFileId);
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Delete
  // ──────────────────────────────────────────────────────────────────

  await describe('Delete', async () => {
    await test('DELETE removes from JSONB array', async () => {
      const r = await deleteFile(token, expenseId, jpgFileId);
      if (r.status !== 200) throw new Error(`got ${r.status}`);
      const ids = r.body.data.file_attachments.map((a) => a.id);
      if (ids.includes(jpgFileId)) throw new Error('jpg still in list');
      if (ids.length !== 2) throw new Error(`expected 2 left, got ${ids.length}`);
    });

    await test('DELETE removes file from disk', async () => {
      // Find the jpg path from the original create response — we know it was at
      // expenses/1896/01/<expenseId>/<jpgFileId>.jpg
      const jpgPath = path.posix.join('expenses', '1896', '01', expenseId, `${jpgFileId}.jpg`);
      let stillThere = false;
      try { await storage.read(jpgPath); stillThere = true; } catch { /* gone */ }
      if (stillThere) throw new Error('file still on disk');
    });

    await test('DELETE unknown file_id → 404', async () => {
      const r = await deleteFile(token, expenseId, '00000000-0000-0000-0000-000000000000');
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });

    await test('DELETE same file twice → second is 404', async () => {
      const r1 = await deleteFile(token, expenseId, pngFileId);
      if (r1.status !== 200) throw new Error(`first delete: ${r1.status}`);
      const r2 = await deleteFile(token, expenseId, pngFileId);
      if (r2.status !== 404) throw new Error(`second delete: ${r2.status}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Soft-deleted expense scenario
  // ──────────────────────────────────────────────────────────────────

  await describe('Soft-deleted expense', async () => {
    // Create a second expense, upload to it, soft-delete it, then verify
    // file ops return 404.
    const r0 = await fetch(`${BASE}/api/v1/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        accommodation_id: accId, billing_month: '1895-12', performance_date: '1895-12-01',
        category: 'rezsi', amount: 500, vendor_name: 'Ghost Vendor', notes: 'file-test-soft',
      }),
    });
    const j0 = await r0.json();
    const ghostId = j0.data.expense.id;
    createdExpenseIds.push(ghostId);

    const up = await postFile(token, ghostId, pdfBuf, 'application/pdf', 'pre-delete.pdf');
    const ghostFileId = up.body.data?.file?.id;

    // Soft-delete via API
    await fetch(`${BASE}/api/v1/expenses/${ghostId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    await test('GET file on soft-deleted expense → 404', async () => {
      const r = await getFile(token, ghostId, ghostFileId);
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });

    await test('POST upload to soft-deleted expense → 404', async () => {
      const r = await postFile(token, ghostId, pdfBuf, 'application/pdf', 'late.pdf');
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });

    await test('DELETE file on soft-deleted expense → 404', async () => {
      const r = await deleteFile(token, ghostId, ghostFileId);
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Activity log audit
  // ──────────────────────────────────────────────────────────────────

  await describe('Activity log audit', async () => {
    await test('file_upload action logged', async () => {
      const r = await query(
        `SELECT COUNT(*)::int AS n FROM activity_logs
          WHERE entity_id = $1 AND action = 'file_upload'`,
        [expenseId],
      );
      if (r.rows[0].n < 3) throw new Error(`expected ≥3 file_upload logs, got ${r.rows[0].n}`);
    });

    await test('file_download action logged', async () => {
      const r = await query(
        `SELECT COUNT(*)::int AS n FROM activity_logs
          WHERE entity_id = $1 AND action = 'file_download'`,
        [expenseId],
      );
      if (r.rows[0].n < 1) throw new Error(`expected ≥1 file_download log, got ${r.rows[0].n}`);
    });

    await test('file_delete action logged', async () => {
      const r = await query(
        `SELECT COUNT(*)::int AS n FROM activity_logs
          WHERE entity_id = $1 AND action = 'file_delete'`,
        [expenseId],
      );
      if (r.rows[0].n < 1) throw new Error(`expected ≥1 file_delete log, got ${r.rows[0].n}`);
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
