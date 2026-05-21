/**
 * Accountant share-link controller — Day 4 (rewrite).
 *
 * Admin endpoints (auth gated): list / create / revoke.
 * Public endpoints (token gated, no auth): HTML page + ZIP stream +
 * individual attachment stream.
 *
 * Audit:
 *   • create     → activity_logs action 'share_create'
 *   • revoke     → activity_logs action 'share_revoke'
 *   • public hits are NOT activity-logged per-request — the share_link
 *     row carries accessed_count + last_accessed_at + last_accessed_ip
 *     which is sufficient for the forensic story without flooding
 *     activity_logs.
 */

const svc = require('../services/accountantShare.service');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

function validateYearMonth(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!y || y < 2000 || y > 2100) return 'Érvénytelen év';
  if (!m || m < 1 || m > 12) return 'Érvénytelen hónap (1-12)';
  return null;
}

/**
 * Base URL used when stamping the public share link into responses.
 *
 * Cascade (first non-empty wins):
 *   1. PUBLIC_BASE_URL — explicit override; the canonical answer when
 *      the public endpoint is behind a separate host (CDN, second domain).
 *   2. FRONTEND_URL — already used elsewhere for ngrok/cloudflared in
 *      dev. Lets the user set ONE env var and have both the admin SPA
 *      and the public share link work externally.
 *   3. X-Forwarded-* headers — for requests that arrive through a
 *      reverse proxy that sets them.
 *   4. req.protocol + req.headers.host — plain-localhost fallback.
 *
 * The localhost fallback is intentionally LAST because a phone on the
 * same WiFi can't resolve "localhost"; the previous behaviour stamped
 * unreachable URLs into freshly-created share links.
 */
function publicBaseUrl(req) {
  const env = (process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || '').trim();
  if (env) return env.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// ─── Admin: create / list / revoke ────────────────────────────────

const create = async (req, res) => {
  try {
    const err = validateYearMonth(req.body.year, req.body.month);
    if (err) return res.status(400).json({ success: false, message: err });

    const result = await svc.createLink({
      year:          parseInt(req.body.year, 10),
      month:         parseInt(req.body.month, 10),
      expiresInDays: req.body.expires_in_days,
      userId:        req.user.id,
      notes:         req.body.notes,
    });
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });

    const link = result.data;
    const publicUrl = `${publicBaseUrl(req)}/public/accountant/${link.token}`;

    await logActivity({
      userId: req.user.id,
      entityType: 'accountant_share',
      entityId: link.id,
      action: 'share_create',
      metadata: {
        year: link.year, month: link.month,
        expires_at: link.expires_at,
        token_tail: link.token.slice(-6),
        expense_count: result.expenseCount,
        pending_review_count: result.pendingReviewCount,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Megosztó link létrehozva',
      data: {
        ...link,
        public_url: publicUrl,
      },
      preview: {
        expense_count: result.expenseCount,
        pending_review_count: result.pendingReviewCount,
      },
    });
  } catch (error) {
    logger.error('Megosztó link létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Megosztó link létrehozási hiba' });
  }
};

const list = async (req, res) => {
  try {
    const include_revoked = req.query.include_revoked === 'true';
    const include_expired = req.query.include_expired === 'true';
    const result = await svc.listLinks({ include_revoked, include_expired });
    // Decorate with public_url for the admin UI's clipboard widget
    const base = publicBaseUrl(req);
    const links = result.links.map((l) => ({ ...l, public_url: `${base}/public/accountant/${l.token}` }));
    res.json({ success: true, data: { links } });
  } catch (error) {
    logger.error('Megosztó linkek lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Megosztó linkek lekérdezési hiba' });
  }
};

const revoke = async (req, res) => {
  try {
    const result = await svc.revoke({ id: req.params.id, userId: req.user.id });
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });

    await logActivity({
      userId: req.user.id,
      entityType: 'accountant_share',
      entityId: result.data.id,
      action: 'share_revoke',
      metadata: {
        year: result.data.year, month: result.data.month,
        token_tail: result.data.token.slice(-6),
        accessed_count: result.data.accessed_count,
      },
    });

    res.json({ success: true, message: 'Megosztó link visszavonva' });
  } catch (error) {
    logger.error('Megosztó link visszavonási hiba:', error);
    res.status(500).json({ success: false, message: 'Megosztó link visszavonási hiba' });
  }
};

// ─── Public (token gated) ─────────────────────────────────────────

function setPublicHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex,nofollow');
}

const publicPage = async (req, res) => {
  try {
    setPublicHeaders(res);
    const access = await svc.accessByToken({ token: req.params.token, ip: req.ip });
    if (access.error) {
      res.status(access.status).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(notFoundHtml(access.error));
    }
    const link = access.data;
    const { expenses } = await svc._loadExpensesForPeriod(link.year, link.month);
    const html = svc.renderPublicHtml({ link, expenses });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Publikus oldal hiba:', error);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(notFoundHtml('Belső hiba történt.'));
  }
};

const publicDownloadAll = async (req, res) => {
  try {
    setPublicHeaders(res);
    const access = await svc.accessByToken({ token: req.params.token, ip: req.ip });
    if (access.error) return res.status(access.status).json({ success: false, message: access.error });
    const link = access.data;
    const { expenses } = await svc._loadExpensesForPeriod(link.year, link.month);
    await svc.streamZipToResponse({ year: link.year, month: link.month, expenses, res });
  } catch (error) {
    logger.error('Publikus ZIP letöltési hiba:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'ZIP letöltési hiba' });
    }
  }
};

const publicFile = async (req, res) => {
  try {
    setPublicHeaders(res);
    const access = await svc.accessByToken({ token: req.params.token, ip: req.ip });
    if (access.error) return res.status(access.status).json({ success: false, message: access.error });
    const link = access.data;
    const { expenses } = await svc._loadExpensesForPeriod(link.year, link.month);

    const file = svc.findAttachment(expenses, req.params.expense_id, req.params.file_id);
    if (!file) return res.status(404).json({ success: false, message: 'Fájl nem található' });

    // Read via the storage adapter (path-traversal guard built in).
    const storage = require('../services/storage.service');
    let buf;
    try { buf = await storage.read(file.path); }
    catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ success: false, message: 'Fájl nem található' });
      throw e;
    }

    res.setHeader('Content-Type', file.mime || 'application/pdf');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name || file.filename)}"`);
    res.send(buf);
  } catch (error) {
    logger.error('Publikus fájl letöltési hiba:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Fájl letöltési hiba' });
    }
  }
};

// Minimal HTML for 404/410-style responses on the public side. We avoid
// leaking *why* (revoked vs expired vs bogus) — same message for all.
function notFoundHtml(_msg) {
  return `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Link érvénytelen</title>
<style>body{font-family:-apple-system,sans-serif;background:#f6f7f9;color:#1f2937;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
.box{background:white;padding:40px 50px;border-radius:8px;border:1px solid #e5e7eb;text-align:center;max-width:480px;}
h1{margin:0 0 12px;font-size:20px;}p{color:#6b7280;margin:0;font-size:14px;}</style>
</head><body><div class="box">
<h1>A link érvénytelen vagy lejárt</h1>
<p>Kérjük, kérjen új megosztó linket az adminisztrátortól.</p>
</div></body></html>`;
}

module.exports = {
  create, list, revoke,
  publicPage, publicDownloadAll, publicFile,
};
