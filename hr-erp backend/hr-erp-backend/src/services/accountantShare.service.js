/**
 * Accountant share-link service — Day 4 (rewrite, 2026-05-21).
 *
 * Model: admin creates a tokenised share link for a (year, month). The
 * accountant opens https://<host>/public/accountant/<token> without
 * logging in. Page lists the confirmed expenses for that month and
 * exposes a "Download all" link that streams a ZIP built on demand —
 * nothing persisted to disk, nothing emailed.
 *
 * Security boundaries:
 *   • token = crypto.randomUUID() — 122 bits of entropy, URL-safe
 *   • UNIQUE constraint on token + app-level revoked_at + expires_at
 *     gates every public read
 *   • atomic accessed_count via UPDATE … RETURNING (no read-modify-write)
 *   • only last accessed IP stored (no JSONB history — see migration note)
 *   • truncated tokens in logs ("tok_…<last6>") — never full
 *   • pending_review expenses do NOT appear in the public list; admin
 *     side surfaces a warning at link-create time
 */

const crypto = require('crypto');
const path = require('path');
const archiver = require('archiver');
const XLSX = require('xlsx');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const storage = require('./storage.service');

const DEFAULT_EXPIRY_DAYS = parseInt(process.env.ACCOUNTANT_LINK_DEFAULT_DAYS || '14', 10);

const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];
const CATEGORY_LABELS = {
  rezsi: 'Rezsi', karbantartas: 'Karbantartás',
  takaritas: 'Takarítás', egyeb: 'Egyéb',
};

function pad(n, w) { return String(n).padStart(w, '0'); }
function ym(year, month) { return `${year}-${pad(month, 2)}`; }
function tokenTail(t) { return t ? `tok_…${String(t).slice(-6)}` : 'tok_…<none>'; }
function fmtMoney(n) {
  return n == null ? '—' : `${Math.round(Number(n)).toLocaleString('hu-HU')} Ft`;
}
function localDateStr(d) {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1, 2)}-${pad(dt.getDate(), 2)}`;
}
function slug(s) {
  return String(s || 'unknown')
    .toLowerCase()
    .replace(/[áä]/g, 'a').replace(/[éë]/g, 'e').replace(/[íï]/g, 'i')
    .replace(/[óöő]/g, 'o').replace(/[úüű]/g, 'u')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'unknown';
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

class AccountantShareService {

  /** Public period bounds for "performance_date IN month" queries. */
  _periodBounds(year, month) {
    const start = `${year}-${pad(month, 2)}-01`;
    const endDate = new Date(year, month, 0); // day 0 of next month = last day
    const end = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1, 2)}-${pad(endDate.getDate(), 2)}`;
    return { start, end };
  }

  /** Load confirmed expenses for a (year, month), plus pending_review count for the warning. */
  async _loadExpensesForPeriod(year, month) {
    const { start, end } = this._periodBounds(year, month);
    const rows = await query(
      `SELECT e.id, e.amount, e.net_amount, e.vat_amount, e.vat_rate, e.vat_exemption_reason,
              e.is_reverse_vat, e.currency, e.billing_month, e.performance_date, e.invoice_date,
              e.category, e.vendor_name, e.vendor_tax_number, e.invoice_number, e.notes,
              e.file_attachments,
              a.name  AS accommodation_name,
              cc.name AS cost_center_name,
              cc.code AS cost_center_code
         FROM accommodation_expenses e
         LEFT JOIN accommodations a   ON e.accommodation_id = a.id
         LEFT JOIN cost_centers cc    ON e.cost_center_id   = cc.id
        WHERE e.deleted_at IS NULL
          AND e.status = 'confirmed'
          AND e.performance_date BETWEEN $1::date AND $2::date
        ORDER BY e.performance_date ASC, e.vendor_name NULLS LAST, e.id`,
      [start, end],
    );
    const warn = await query(
      `SELECT COUNT(*)::int AS n FROM accommodation_expenses
        WHERE deleted_at IS NULL AND status='pending_review'
          AND performance_date BETWEEN $1::date AND $2::date`,
      [start, end],
    );
    return {
      expenses: rows.rows,
      pendingReviewCount: warn.rows[0]?.n || 0,
      periodStart: start,
      periodEnd: end,
    };
  }

  // ─── Admin: create / list / revoke ────────────────────────────────

  async createLink({ year, month, expiresInDays, userId, notes }) {
    const days = parseInt(expiresInDays || DEFAULT_EXPIRY_DAYS, 10);
    if (Number.isNaN(days) || days < 1 || days > 365) {
      return { error: 'Érvénytelen lejárati idő (1-365 nap)', status: 400 };
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + days * 86400 * 1000);

    const result = await query(
      `INSERT INTO accountant_share_links
         (year, month, token, expires_at, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [year, month, token, expiresAt, userId || null, notes || null],
    );

    // Sanity preview: how many confirmed / pending_review expenses fall in
    // this period? Lets the admin UI warn the user if pending exist.
    const { expenses, pendingReviewCount } = await this._loadExpensesForPeriod(year, month);

    logger.info(`[accountantShare] created ${ym(year, month)} ${tokenTail(token)} expires=${expiresAt.toISOString()} (user=${userId})`);

    return { data: result.rows[0], expenseCount: expenses.length, pendingReviewCount };
  }

  async listLinks(filters = {}) {
    const { include_revoked = false, include_expired = false } = filters;
    const where = ['1=1'];
    if (!include_revoked) where.push('revoked_at IS NULL');
    if (!include_expired) where.push('expires_at > NOW()');
    const result = await query(
      `SELECT s.*, u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
         FROM accountant_share_links s
         LEFT JOIN users u ON s.created_by = u.id
        WHERE ${where.join(' AND ')}
        ORDER BY s.year DESC, s.month DESC, s.created_at DESC
        LIMIT 200`,
    );
    return { links: result.rows };
  }

  async revoke({ id, userId }) {
    const result = await query(
      `UPDATE accountant_share_links
          SET revoked_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING *`,
      [id],
    );
    if (result.rows.length === 0) {
      return { error: 'A link nem található vagy már vissza van vonva', status: 404 };
    }
    logger.info(`[accountantShare] revoked ${tokenTail(result.rows[0].token)} by user=${userId}`);
    return { data: result.rows[0] };
  }

  // ─── Public: token validation + atomic access counter ─────────────

  /**
   * Look up a link by token, validating it's not revoked or expired.
   * Atomically bumps accessed_count + last_accessed_at + last_accessed_ip.
   * Returns { link } or { error, status }.
   */
  async accessByToken({ token, ip }) {
    if (!token || typeof token !== 'string' || token.length < 30) {
      // Bad shape — same response as not-found so we don't leak info.
      return { error: 'A link nem található vagy lejárt', status: 404 };
    }
    // Atomic update: only succeeds if not revoked and not expired.
    // Returns the row only when valid; otherwise empty rowset.
    const result = await query(
      `UPDATE accountant_share_links
          SET accessed_count   = accessed_count + 1,
              last_accessed_at = CURRENT_TIMESTAMP,
              last_accessed_ip = $2
        WHERE token = $1
          AND revoked_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
       RETURNING *`,
      [token, ip || null],
    );
    if (result.rows.length === 0) {
      return { error: 'A link nem található vagy lejárt', status: 404 };
    }
    return { data: result.rows[0] };
  }

  // ─── Excel ────────────────────────────────────────────────────────

  buildExcelBuffer({ year, month, expenses }) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Tételes
    const detailRows = expenses.map((e, i) => ({
      '#': i + 1,
      'Teljesítés dátuma': localDateStr(e.performance_date),
      'Beszállító': e.vendor_name || '',
      'Adószám': e.vendor_tax_number || '',
      'Számlaszám': e.invoice_number || '',
      'Számla dátuma': localDateStr(e.invoice_date),
      'Szállás': e.accommodation_name || '',
      'Költséghely': e.cost_center_name || '',
      'Költséghely kód': e.cost_center_code || '',
      'Kategória': CATEGORY_LABELS[e.category] || e.category,
      'Nettó (Ft)': e.net_amount ? Number(e.net_amount) : null,
      'ÁFA kulcs': e.vat_rate ? `${e.vat_rate}%` : (e.vat_exemption_reason || ''),
      'ÁFA (Ft)': e.vat_amount ? Number(e.vat_amount) : null,
      'Bruttó (Ft)': Number(e.amount),
      'Fordított ÁFA': e.is_reverse_vat ? 'igen' : '',
      'Megjegyzés': e.notes || '',
    }));
    if (detailRows.length > 0) {
      // Append a sum row at the bottom
      detailRows.push({
        '#': '',
        'Teljesítés dátuma': '',
        'Beszállító': 'ÖSSZESEN',
        'Adószám': '', 'Számlaszám': '', 'Számla dátuma': '',
        'Szállás': '', 'Költséghely': '', 'Költséghely kód': '', 'Kategória': '',
        'Nettó (Ft)': expenses.reduce((s, e) => s + Number(e.net_amount || 0), 0),
        'ÁFA kulcs': '',
        'ÁFA (Ft)': expenses.reduce((s, e) => s + Number(e.vat_amount || 0), 0),
        'Bruttó (Ft)': expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
        'Fordított ÁFA': '', 'Megjegyzés': '',
      });
    }
    const ws1 = XLSX.utils.json_to_sheet(detailRows);
    if (detailRows.length > 0) {
      ws1['!autofilter'] = { ref: ws1['!ref'] };
      ws1['!cols'] = Object.keys(detailRows[0]).map(() => ({ wch: 16 }));
    }
    XLSX.utils.book_append_sheet(wb, ws1, 'Tételes');

    // Sheet 2: Összesítő — by category, by cost_center, by accommodation
    const byCat = {}, byCc = {}, byAcc = {};
    for (const e of expenses) {
      const c = CATEGORY_LABELS[e.category] || e.category;
      byCat[c] = (byCat[c] || 0) + Number(e.amount || 0);
      const cc = e.cost_center_name
        ? `${e.cost_center_name}${e.cost_center_code ? ` (${e.cost_center_code})` : ''}`
        : '— (nincs költséghely)';
      byCc[cc] = (byCc[cc] || 0) + Number(e.amount || 0);
      const acc = e.accommodation_name || 'Ismeretlen szállás';
      byAcc[acc] = (byAcc[acc] || 0) + Number(e.amount || 0);
    }
    const sumRows = [
      { A: 'Időszak', B: ym(year, month) },
      { A: 'Tételek száma', B: expenses.length },
      { A: 'Nettó összesen (Ft)', B: expenses.reduce((s, e) => s + Number(e.net_amount || 0), 0) },
      { A: 'ÁFA összesen (Ft)', B: expenses.reduce((s, e) => s + Number(e.vat_amount || 0), 0) },
      { A: 'Bruttó összesen (Ft)', B: expenses.reduce((s, e) => s + Number(e.amount || 0), 0) },
      { A: '', B: '' },
      { A: 'Kategória szerint (bruttó)', B: '' },
      ...Object.entries(byCat).map(([k, v]) => ({ A: `  ${k}`, B: v })),
      { A: '', B: '' },
      { A: 'Költséghely szerint (bruttó)', B: '' },
      ...Object.entries(byCc).map(([k, v]) => ({ A: `  ${k}`, B: v })),
      { A: '', B: '' },
      { A: 'Szállás szerint (bruttó)', B: '' },
      ...Object.entries(byAcc).map(([k, v]) => ({ A: `  ${k}`, B: v })),
    ];
    const ws2 = XLSX.utils.json_to_sheet(sumRows, { header: ['A', 'B'], skipHeader: true });
    ws2['!cols'] = [{ wch: 40 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Összesítő');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  // ─── On-demand ZIP stream ─────────────────────────────────────────

  /**
   * Build a ZIP archive and pipe it directly to a writable stream
   * (the Express response). Includes the Excel summary + every
   * original invoice attachment, prefixed by ordering for stable
   * cross-reference with the Excel rows.
   */
  async streamZipToResponse({ year, month, expenses, res }) {
    const period = ym(year, month);
    const filename = `szamlak_${period}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');

    const arch = archiver('zip', { zlib: { level: 9 } });
    arch.on('warning', (e) => logger.warn('[accountantShare zip warning]', e));
    arch.on('error', (e) => {
      logger.error('[accountantShare zip error]', e);
      // The response is already flowing; we can't switch to JSON. End the
      // stream — the client gets a truncated ZIP that won't open. The error
      // log is the audit trail.
      try { res.destroy(e); } catch { /* noop */ }
    });
    arch.pipe(res);

    // Excel first
    const xlsxBuf = this.buildExcelBuffer({ year, month, expenses });
    arch.append(xlsxBuf, { name: `${period}/tetelek-${period}.xlsx` });

    // Then each attachment (PDFs + JPGs + PNGs)
    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      const seq = pad(i + 1, 3);
      const vendor = slug(e.vendor_name);
      const date = localDateStr(e.performance_date) || 'undated';
      const atts = Array.isArray(e.file_attachments) ? e.file_attachments : [];
      for (let j = 0; j < atts.length; j++) {
        const att = atts[j];
        try {
          const buf = await storage.read(att.path);
          const ext = path.extname(att.original_name || att.filename || '.pdf').toLowerCase() || '.pdf';
          const base = atts.length === 1
            ? `${seq}_${vendor}_${date}${ext}`
            : `${seq}_${vendor}_${date}_${j + 1}${ext}`;
          arch.append(buf, { name: `${period}/szamlak/${base}` });
        } catch (err) {
          logger.warn(`[accountantShare] could not read attachment ${att.path}: ${err.message}`);
        }
      }
    }

    await arch.finalize();
  }

  // ─── Public page HTML render ──────────────────────────────────────

  /**
   * Server-rendered HTML — no JS, no SPA, accountant-friendly. Self-
   * contained inline CSS so a copy-pasted URL works on any device.
   * `Cache-Control: no-store` and `X-Robots-Tag: noindex` are set by
   * the controller before calling this.
   */
  renderPublicHtml({ link, expenses }) {
    const period = ym(link.year, link.month);
    const monthLabel = `${link.year}. ${HU_MONTHS[link.month - 1]}`;
    const totals = {
      gross: expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
      net:   expenses.reduce((s, e) => s + Number(e.net_amount || 0), 0),
      vat:   expenses.reduce((s, e) => s + Number(e.vat_amount || 0), 0),
    };

    const expiresText = new Date(link.expires_at).toLocaleString('hu-HU');

    const rows = expenses.map((e, i) => {
      const atts = Array.isArray(e.file_attachments) ? e.file_attachments : [];
      const fileLinks = atts.map((a) => `
        <a href="/public/accountant/${escapeHtml(link.token)}/file/${escapeHtml(e.id)}/${escapeHtml(a.id)}"
           class="filelink" title="${escapeHtml(a.original_name || a.filename)}">📎 ${escapeHtml(a.original_name || a.filename)}</a>
      `).join('') || '<span class="muted">—</span>';
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(localDateStr(e.performance_date))}</td>
          <td>${escapeHtml(e.vendor_name || '—')}</td>
          <td>${escapeHtml(e.invoice_number || '—')}</td>
          <td>${escapeHtml(e.accommodation_name || '—')}</td>
          <td>${escapeHtml(CATEGORY_LABELS[e.category] || e.category)}</td>
          <td class="num">${escapeHtml(fmtMoney(e.net_amount))}</td>
          <td class="num">${escapeHtml(fmtMoney(e.vat_amount))}</td>
          <td class="num strong">${escapeHtml(fmtMoney(e.amount))}</td>
          <td>${fileLinks}</td>
        </tr>`;
    }).join('');

    return `<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Havi költségelszámolás — ${escapeHtml(monthLabel)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           margin: 0; padding: 0; background: #f6f7f9; color: #1f2937; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 8px;
            padding: 12px 16px; min-width: 160px; }
    .card .label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .card .value { font-size: 18px; font-weight: 600; margin-top: 2px; }
    .actions { margin: 16px 0 24px; }
    .btn { display: inline-block; padding: 10px 18px; background: #2563eb; color: white;
           text-decoration: none; border-radius: 6px; font-weight: 600; }
    .btn:hover { background: #1d4ed8; }
    table { width: 100%; border-collapse: collapse; background: white;
            border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; font-size: 13px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #f1f5f9; }
    th { background: #f9fafb; font-weight: 600; color: #374151; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.strong { font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .filelink { display: inline-block; margin-right: 6px; color: #2563eb; text-decoration: none;
                font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;
                white-space: nowrap; vertical-align: top; }
    .filelink:hover { text-decoration: underline; }
    .muted { color: #9ca3af; }
    .footer { color: #6b7280; font-size: 12px; margin-top: 24px; text-align: center; }
    .empty { background: white; padding: 40px; text-align: center; border-radius: 8px;
             border: 1px solid #e5e7eb; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Havi költségelszámolás — ${escapeHtml(monthLabel)}</h1>
    <div class="sub">Solutions Group — szállás üzemeltetési költségek</div>

    <div class="summary">
      <div class="card"><div class="label">Tételek</div><div class="value">${expenses.length}</div></div>
      <div class="card"><div class="label">Nettó össz.</div><div class="value">${escapeHtml(fmtMoney(totals.net))}</div></div>
      <div class="card"><div class="label">ÁFA össz.</div><div class="value">${escapeHtml(fmtMoney(totals.vat))}</div></div>
      <div class="card"><div class="label">Bruttó össz.</div><div class="value">${escapeHtml(fmtMoney(totals.gross))}</div></div>
    </div>

    <div class="actions">
      <a class="btn" href="/public/accountant/${escapeHtml(link.token)}/download-all">⬇ Mindent letöltés (ZIP)</a>
    </div>

    ${expenses.length === 0 ? `
      <div class="empty">Nincs jóváhagyott költség ezen a hónapon.</div>
    ` : `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Teljesítés</th>
            <th>Beszállító</th>
            <th>Számla</th>
            <th>Szállás</th>
            <th>Kategória</th>
            <th class="num">Nettó</th>
            <th class="num">ÁFA</th>
            <th class="num">Bruttó</th>
            <th>Csatolmányok</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `}

    <div class="footer">
      A megosztott link lejár: ${escapeHtml(expiresText)}<br>
      ${link.accessed_count > 1 ? `(${link.accessed_count}. megnyitás)` : ''}
    </div>
  </div>
</body>
</html>`;
  }

  /** Helper for the public file-stream endpoint. */
  findAttachment(expenses, expenseId, fileId) {
    const e = expenses.find((x) => x.id === expenseId);
    if (!e) return null;
    const atts = Array.isArray(e.file_attachments) ? e.file_attachments : [];
    return atts.find((a) => a.id === fileId) || null;
  }
}

module.exports = new AccountantShareService();
module.exports.DEFAULT_EXPIRY_DAYS = DEFAULT_EXPIRY_DAYS;
