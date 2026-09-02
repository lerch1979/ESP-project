/**
 * Settlement sheets — admin endpoints + the public tokenised view.
 *
 * Two audiences, deliberately separated:
 *   • adminRouter  — staff, permission-gated, can render any partner's sheet and mint
 *                    share links.
 *   • publicHandler — no auth at all; the token IS the authorisation, and it is bound
 *                    to one partner + one kind + one month (mig 149). Editing the URL
 *                    cannot reach another partner's document.
 */
const crypto = require('crypto');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const svc = require('../services/settlementSheet.service');
const render = require('../services/settlementRender.service');

const DEFAULT_EXPIRY_DAYS = 30;
const tokenTail = (t) => (t ? `tok_…${String(t).slice(-6)}` : 'tok_…<none>');

const fail = (res, err, label) => {
  if (err instanceof svc.SettlementError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  logger.error(`[settlement.${label}]`, err);
  return res.status(500).json({ success: false, message: 'Elszámoló lap hiba' });
};

/** Build the sheet for (kind, partner, month) — the one place that dispatches. */
async function buildSheet(kind, partnerId, month) {
  return kind === 'landlord'
    ? svc.landlordSheet({ month, landlordId: partnerId })
    : svc.clientSheet({ month, clientId: partnerId });
}

async function sendAs(res, sheet, format) {
  const base = render.fileBase(sheet);
  if (format === 'pdf') {
    const buf = await render.renderPdf(sheet);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
    return res.send(buf);
  }
  const buf = render.renderXlsx(sheet);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
  return res.send(buf);
}

// ── admin ───────────────────────────────────────────────────────────────────

/** Which partners have a settlement for this month (drives the picker). */
const listPartners = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.availablePartners(req.query.month) });
  } catch (e) { fail(res, e, 'listPartners'); }
};

/** JSON preview — what the admin screen shows before downloading. */
const preview = async (req, res) => {
  try {
    const sheet = await buildSheet(req.params.kind, req.query.partner_id, req.query.month);
    res.json({ success: true, data: sheet });
  } catch (e) { fail(res, e, 'preview'); }
};

/** Download xlsx / pdf. */
const download = async (req, res) => {
  try {
    const sheet = await buildSheet(req.params.kind, req.query.partner_id, req.query.month);
    await sendAs(res, sheet, (req.query.format || 'xlsx').toLowerCase());
  } catch (e) { fail(res, e, 'download'); }
};

const createLink = async (req, res) => {
  try {
    const { kind, partner_id, month, expires_in_days, notes } = req.body || {};
    if (!['landlord', 'client'].includes(kind)) {
      return res.status(400).json({ success: false, message: 'kind: landlord | client' });
    }
    // Build it once before minting the token: a link that renders nothing is worse than
    // no link, because the partner discovers the failure instead of us.
    await buildSheet(kind, partner_id, month);

    const days = Math.max(1, Math.min(parseInt(expires_in_days, 10) || DEFAULT_EXPIRY_DAYS, 365));
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + days * 86400 * 1000);
    const r = await query(
      `INSERT INTO settlement_share_links (token, kind, partner_id, billing_month, expires_at, created_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, token, expires_at`,
      [token, kind, partner_id, month, expiresAt, req.user?.id || null, notes || null]);

    logger.info(`[settlement] link ${kind}/${month} ${tokenTail(token)} expires=${expiresAt.toISOString()} (user=${req.user?.id})`);
    res.status(201).json({ success: true, data: { ...r.rows[0], url: `/public/settlement/${token}` } });
  } catch (e) { fail(res, e, 'createLink'); }
};

const listLinks = async (req, res) => {
  try {
    const r = await query(
      `SELECT l.id, l.kind, l.billing_month, l.partner_id, c.name AS partner_name,
              l.expires_at, l.revoked_at, l.view_count, l.last_viewed_at, l.notes, l.created_at,
              (l.revoked_at IS NULL AND l.expires_at > now()) AS active,
              RIGHT(l.token, 6) AS token_tail
         FROM settlement_share_links l
         LEFT JOIN contractors c ON c.id = l.partner_id
        ${req.query.month ? 'WHERE l.billing_month = $1' : ''}
        ORDER BY l.created_at DESC LIMIT 100`,
      req.query.month ? [req.query.month] : []);
    res.json({ success: true, data: r.rows });
  } catch (e) { fail(res, e, 'listLinks'); }
};

const revokeLink = async (req, res) => {
  try {
    const r = await query(
      `UPDATE settlement_share_links SET revoked_at = now()
        WHERE id = $1 AND revoked_at IS NULL RETURNING id, token`, [req.params.id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Megosztás nem található vagy már visszavont' });
    }
    logger.info(`[settlement] link REVOKED ${tokenTail(r.rows[0].token)} (user=${req.user?.id})`);
    res.json({ success: true, data: { id: r.rows[0].id } });
  } catch (e) { fail(res, e, 'revokeLink'); }
};

// ── public (token only, NO auth) ────────────────────────────────────────────

/** Resolve a token to its link, or null. Expiry and revocation are both checked here. */
async function resolveToken(token) {
  const r = await query(
    `SELECT id, token, kind, partner_id, billing_month, expires_at, revoked_at
       FROM settlement_share_links WHERE token = $1`, [token]);
  if (r.rows.length === 0) return null;
  const l = r.rows[0];
  if (l.revoked_at) return null;
  if (new Date(l.expires_at) <= new Date()) return null;
  return l;
}

const publicView = async (req, res) => {
  try {
    const link = await resolveToken(req.params.token);
    if (!link) {
      logger.warn(`[settlement] public view REJECTED ${tokenTail(req.params.token)}`);
      return res.status(404).json({ success: false, message: 'A megosztás lejárt vagy visszavonásra került.' });
    }
    await query(
      `UPDATE settlement_share_links
          SET view_count = view_count + 1, last_viewed_at = now(), last_viewed_ip = $2
        WHERE id = $1`, [link.id, (req.ip || '').slice(0, 45)]);

    const sheet = await buildSheet(link.kind, link.partner_id, link.billing_month);
    const format = (req.query.format || '').toLowerCase();
    if (format === 'xlsx' || format === 'pdf') return sendAs(res, sheet, format);
    // No format → the JSON the public page renders from.
    res.json({ success: true, data: sheet });
  } catch (e) { fail(res, e, 'publicView'); }
};

module.exports = {
  listPartners, preview, download,
  createLink, listLinks, revokeLink,
  publicView,
  DEFAULT_EXPIRY_DAYS,
};
