/**
 * Accountant share-link — HTTP smoke against the running backend.
 *
 * Seeds a synthetic month with mixed status expenses, generates a link,
 * exercises:
 *   • admin create / list / revoke
 *   • public page HTML (valid / revoked / expired / bogus token)
 *   • public ZIP stream
 *   • public file stream + path-traversal guard from the storage adapter
 *   • atomic accessed_count + last_accessed_ip
 *   • status='confirmed' + performance_date filter (pending_review and
 *     out-of-period expenses excluded)
 *
 * Cleans up all seeded rows + on-disk attachments.
 */

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const { query, closePool } = require('../src/database/connection');
const storage = require('../src/services/storage.service');

const BASE = 'http://localhost:3001';

let passed = 0, failed = 0;
const createdExpenseIds = [];
const createdLinkIds = [];
const tempPdfPaths = [];

async function test(name, fn) {
  try { await fn(); passed++; console.log(`  PASS: ${name}`); }
  catch (e) { failed++; console.error(`  FAIL: ${name}`); console.error(`    ${e.message}`); }
}
async function describe(name, fn) { console.log(`\n${name}`); await fn(); }

async function cleanup() {
  try {
    if (createdExpenseIds.length > 0) {
      await query('DELETE FROM activity_logs WHERE entity_id = ANY($1::uuid[])', [createdExpenseIds]);
      // remove file_attachments from disk
      const rows = await query('SELECT file_attachments FROM accommodation_expenses WHERE id = ANY($1::uuid[])', [createdExpenseIds]);
      for (const r of rows.rows) {
        for (const a of (r.file_attachments || [])) {
          if (a?.path) await storage.delete(a.path).catch(() => {});
        }
      }
      await query('DELETE FROM accommodation_expenses WHERE id = ANY($1::uuid[])', [createdExpenseIds]);
    }
    if (createdLinkIds.length > 0) {
      await query('DELETE FROM activity_logs WHERE entity_id = ANY($1::uuid[])', [createdLinkIds]);
      await query('DELETE FROM accountant_share_links WHERE id = ANY($1::uuid[])', [createdLinkIds]);
    }
    for (const p of tempPdfPaths) await fs.unlink(p).catch(() => {});
  } catch (e) { console.error('Cleanup failed:', e.message); }
}

async function main() {
  const u = await query(
    `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id
     JOIN roles r ON r.id=ur.role_id
     WHERE r.slug='superadmin' AND u.is_active=true LIMIT 1`,
  );
  const token = jwt.sign({ userId: u.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const acc = await query('SELECT id FROM accommodations LIMIT 1');
  const accId = acc.rows[0].id;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const post = async (p, b) => {
    const r = await fetch(`${BASE}${p}`, { method: 'POST', headers, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const del = async (p) => {
    const r = await fetch(`${BASE}${p}`, { method: 'DELETE', headers });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const get = async (p) => {
    const r = await fetch(`${BASE}${p}`, { headers });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  // ── Seed expenses ──
  // Year 2097 to stay clear of real data; CHECK on year (2000-2100) allows it.
  const tag = `share-test-${Date.now()}`;
  // Create a PDF attachment that the share link can serve.
  const pdfDir = path.join(__dirname, '..', 'uploads', 'documents');
  await fs.mkdir(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, `${tag}.pdf`);
  const pdfBuf = Buffer.from('%PDF-1.4\nshare-test-fixture\n%%EOF\n');
  await fs.writeFile(pdfPath, pdfBuf);
  tempPdfPaths.push(pdfPath);

  // 3 confirmed in 2097-06, 1 pending_review in 2097-06, 1 confirmed in 2097-05 (prior month)
  const ins = async (row) => {
    const r = await query(
      `INSERT INTO accommodation_expenses
         (accommodation_id, billing_month, performance_date, category, amount,
          vendor_name, status, notes, source,
          net_amount, vat_rate, vat_amount, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9,$10,$11,'HUF')
       RETURNING id`,
      [accId, row.bm, row.pd, row.cat, row.amt, row.vendor, row.st || 'confirmed', tag, row.net, row.rate, row.vat],
    );
    createdExpenseIds.push(r.rows[0].id);
    return r.rows[0].id;
  };

  const e1 = await ins({ bm:'2097-06', pd:'2097-06-05', cat:'rezsi',        amt:12700, vendor:'Áram Zrt.', net:10000, rate:27, vat:2700 });
  const e2 = await ins({ bm:'2097-06', pd:'2097-06-15', cat:'karbantartas', amt:50000, vendor:'Karb Kft.', net:39370, rate:27, vat:10630 });
  const e3 = await ins({ bm:'2097-06', pd:'2097-06-28', cat:'takaritas',    amt:8000,  vendor:'Tiszta Bt.',net:6299,  rate:27, vat:1701 });
  await ins({ bm:'2097-06', pd:'2097-06-20', cat:'egyeb', amt:99999, vendor:'Pending Zrt.', st:'pending_review' });
  await ins({ bm:'2097-05', pd:'2097-05-31', cat:'rezsi',  amt:9999,  vendor:'PriorMonth Zrt.' });

  // Attach the PDF to e1 so the public file-stream test has something to fetch
  const savedFile = await storage.save({
    buffer: pdfBuf, mime: 'application/pdf',
    expense_id: e1, billing_month: '2097-06',
    original_name: 'aram-202706.pdf', uploaded_by: u.rows[0].id,
  });
  await query(
    `UPDATE accommodation_expenses
        SET file_attachments = COALESCE(file_attachments, '[]'::jsonb) || $1::jsonb
      WHERE id = $2`,
    [JSON.stringify([savedFile]), e1],
  );

  // ──────────────────────────────────────────────────────────────────
  // Admin: create + list + (later) revoke
  // ──────────────────────────────────────────────────────────────────

  let publicToken, linkId, publicUrl;
  await describe('Admin: create link', async () => {
    const r = await post('/api/v1/accountant-links', { year: 2097, month: 6, expires_in_days: 7, notes: tag });
    await test('POST → 201 + token + public_url', async () => {
      if (r.status !== 201) throw new Error(`got ${r.status}: ${JSON.stringify(r.body)}`);
      publicToken = r.body.data.token;
      publicUrl   = r.body.data.public_url;
      linkId      = r.body.data.id;
      createdLinkIds.push(linkId);
      if (!publicToken || publicToken.length < 30) throw new Error(`bad token: ${publicToken}`);
      if (!publicUrl?.includes(publicToken)) throw new Error(`url missing token: ${publicUrl}`);
    });

    await test('preview surfaces correct counts (3 confirmed, 1 pending_review)', async () => {
      if (r.body.preview?.expense_count !== 3) throw new Error(`expense=${r.body.preview?.expense_count}`);
      if (r.body.preview?.pending_review_count !== 1) throw new Error(`pending=${r.body.preview?.pending_review_count}`);
    });

    await test('activity_log share_create entry', async () => {
      const log = await query(`SELECT action, metadata FROM activity_logs WHERE entity_id = $1 AND action='share_create'`, [linkId]);
      if (log.rows.length === 0) throw new Error('missing log');
      const md = log.rows[0].metadata;
      if (typeof md.token_tail !== 'string' || md.token_tail.length !== 6) {
        throw new Error(`token not truncated in log: ${JSON.stringify(md)}`);
      }
      if (Object.values(md).some((v) => typeof v === 'string' && v === publicToken)) {
        throw new Error('full token leaked into activity_log');
      }
    });
  });

  await describe('Admin: list', async () => {
    await test('GET / lists the new link', async () => {
      const r = await get('/api/v1/accountant-links');
      if (r.status !== 200) throw new Error(`got ${r.status}`);
      const links = r.body.data.links || [];
      const me = links.find((l) => l.id === linkId);
      if (!me) throw new Error('seed link missing from list');
      if (!me.public_url?.includes(publicToken)) throw new Error('list row missing public_url');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Public: page renders + only confirmed-in-period expenses listed
  // ──────────────────────────────────────────────────────────────────

  await describe('Public: page render', async () => {
    const r = await fetch(`${BASE}/public/accountant/${publicToken}`);
    const html = await r.text();

    await test('GET /public/accountant/<token> → 200 HTML', async () => {
      if (r.status !== 200) throw new Error(`got ${r.status}`);
      const ct = r.headers.get('content-type');
      if (!ct?.includes('text/html')) throw new Error(`bad ct: ${ct}`);
    });

    await test('headers: Cache-Control no-store + X-Robots-Tag noindex', async () => {
      if (!r.headers.get('cache-control')?.includes('no-store')) throw new Error('no-store missing');
      if (!r.headers.get('x-robots-tag')?.includes('noindex')) throw new Error('noindex missing');
    });

    await test('all 3 confirmed-in-period vendor names appear in the HTML', async () => {
      for (const name of ['Áram Zrt.', 'Karb Kft.', 'Tiszta Bt.']) {
        if (!html.includes(name)) throw new Error(`missing vendor: ${name}`);
      }
    });

    await test('pending_review and prior-month expenses NOT visible', async () => {
      if (html.includes('Pending Zrt.')) throw new Error('pending_review leaked');
      if (html.includes('PriorMonth Zrt.')) throw new Error('prior month leaked');
    });

    await test('Mindent letöltés button present', async () => {
      if (!html.includes('Mindent letöltés')) throw new Error('download button missing');
      if (!html.includes(`/public/accountant/${publicToken}/download-all`)) throw new Error('download href wrong');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Atomic counter + last_accessed_ip
  // ──────────────────────────────────────────────────────────────────

  await describe('Atomic counter + last_accessed_ip', async () => {
    const before = await query(`SELECT accessed_count, last_accessed_ip FROM accountant_share_links WHERE id = $1`, [linkId]);
    await fetch(`${BASE}/public/accountant/${publicToken}`);
    await fetch(`${BASE}/public/accountant/${publicToken}`);
    const after = await query(`SELECT accessed_count, last_accessed_ip FROM accountant_share_links WHERE id = $1`, [linkId]);
    await test('accessed_count increments by exactly 2 across two requests', async () => {
      const delta = after.rows[0].accessed_count - before.rows[0].accessed_count;
      if (delta !== 2) throw new Error(`delta=${delta}`);
    });
    await test('last_accessed_ip populated', async () => {
      if (!after.rows[0].last_accessed_ip) throw new Error('ip not stored');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Public: download-all (ZIP stream)
  // ──────────────────────────────────────────────────────────────────

  await describe('Public: ZIP stream', async () => {
    const r = await fetch(`${BASE}/public/accountant/${publicToken}/download-all`);
    await test('GET /download-all → 200 application/zip', async () => {
      if (r.status !== 200) throw new Error(`got ${r.status}`);
      const ct = r.headers.get('content-type');
      if (!ct?.includes('application/zip')) throw new Error(`bad ct: ${ct}`);
      const disp = r.headers.get('content-disposition') || '';
      if (!disp.includes('szamlak_2097-06.zip')) throw new Error(`bad filename: ${disp}`);
    });
    await test('response body is a valid ZIP (PK signature)', async () => {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('not a ZIP');
      if (buf.length < 200) throw new Error(`suspiciously small: ${buf.length}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Public: individual file stream
  // ──────────────────────────────────────────────────────────────────

  await describe('Public: file stream', async () => {
    await test('valid expense+file → 200 application/pdf', async () => {
      const r = await fetch(`${BASE}/public/accountant/${publicToken}/file/${e1}/${savedFile.id}`);
      if (r.status !== 200) throw new Error(`got ${r.status}`);
      const ct = r.headers.get('content-type');
      if (!ct?.includes('application/pdf')) throw new Error(`bad ct: ${ct}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.equals(pdfBuf)) throw new Error('body mismatch');
    });

    await test('file from another expense (not in this period) → 404', async () => {
      // Pick the prior-month expense id we seeded
      const prior = await query(
        `SELECT id FROM accommodation_expenses WHERE notes = $1 AND billing_month = '2097-05' LIMIT 1`,
        [tag],
      );
      const priorId = prior.rows[0].id;
      const r = await fetch(`${BASE}/public/accountant/${publicToken}/file/${priorId}/${savedFile.id}`);
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });

    await test('bogus file_id under valid expense → 404', async () => {
      const r = await fetch(`${BASE}/public/accountant/${publicToken}/file/${e1}/00000000-0000-0000-0000-000000000000`);
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Invalid tokens — same response for not-found / expired / revoked
  // ──────────────────────────────────────────────────────────────────

  await describe('Invalid / expired / revoked tokens', async () => {
    await test('bogus token → 404 HTML page (no info leak)', async () => {
      const r = await fetch(`${BASE}/public/accountant/00000000-0000-0000-0000-000000000000`);
      if (r.status !== 404) throw new Error(`got ${r.status}`);
      const html = await r.text();
      if (!html.includes('érvénytelen vagy lejárt')) throw new Error('expected friendly 404 HTML');
    });

    await test('short/garbage token → 404 (validated shape)', async () => {
      const r = await fetch(`${BASE}/public/accountant/abc`);
      if (r.status !== 404) throw new Error(`got ${r.status}`);
    });

    let expiredId, expiredTok;
    await test('expired link → 404 + counter NOT incremented', async () => {
      // Seed an already-expired link
      expiredTok = require('crypto').randomUUID();
      const ins = await query(
        `INSERT INTO accountant_share_links (year, month, token, expires_at, created_by)
         VALUES (2097, 6, $1, NOW() - INTERVAL '1 day', $2)
         RETURNING id, accessed_count`,
        [expiredTok, u.rows[0].id],
      );
      expiredId = ins.rows[0].id;
      createdLinkIds.push(expiredId);

      const r = await fetch(`${BASE}/public/accountant/${expiredTok}`);
      if (r.status !== 404) throw new Error(`got ${r.status}`);
      const after = await query(`SELECT accessed_count FROM accountant_share_links WHERE id=$1`, [expiredId]);
      if (after.rows[0].accessed_count !== 0) {
        throw new Error(`expired link incremented counter to ${after.rows[0].accessed_count}`);
      }
    });

    await test('revoke endpoint → 200, subsequent public access → 404', async () => {
      const d = await del(`/api/v1/accountant-links/${linkId}`);
      if (d.status !== 200) throw new Error(`revoke got ${d.status}`);
      const r = await fetch(`${BASE}/public/accountant/${publicToken}`);
      if (r.status !== 404) throw new Error(`revoked link got ${r.status}`);
    });

    await test('revoking already-revoked → 404', async () => {
      const d = await del(`/api/v1/accountant-links/${linkId}`);
      if (d.status !== 404) throw new Error(`re-revoke got ${d.status}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Validation
  // ──────────────────────────────────────────────────────────────────

  await describe('Create validation', async () => {
    await test('bad month → 400', async () => {
      const r = await post('/api/v1/accountant-links', { year: 2097, month: 13 });
      if (r.status !== 400) throw new Error(`got ${r.status}`);
    });
    await test('expires_in_days out of range → 400', async () => {
      const r = await post('/api/v1/accountant-links', { year: 2097, month: 6, expires_in_days: 9999 });
      if (r.status !== 400) throw new Error(`got ${r.status}`);
    });
  });
}

(async () => {
  let code = 0;
  try { await main(); } catch (e) { console.error('\nFATAL:', e.message); console.error(e.stack); code = 1; }
  finally {
    await cleanup();
    console.log(`\n${'='.repeat(40)}\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n${'='.repeat(40)}\n`);
    await closePool();
    if (failed > 0 || code !== 0) process.exit(1);
  }
})();
