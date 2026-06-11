/**
 * Expiry monitor — visa / contract / document expiry alerts (audit P0).
 *
 * Monitors three date fields and alerts HR admins ahead of expiry:
 *   • employees.visa_expiry            → field 'visa'
 *   • employees.end_date               → field 'contract'
 *   • employee_documents.expiry_date   → field 'document' (any document_type)
 *
 * Fully runtime-controlled (no restart, no env flag):
 *   • expiry_monitor_config.enabled   — the cron exits silently when off.
 *   • expiry_threshold_rules          — per-attribute lead times; most specific wins.
 *
 * Idempotency: each (entity, field, expiry_date, bucket) alerts ONCE via
 * expiry_alert_log's unique index + INSERT … ON CONFLICT DO NOTHING. Keyed on the
 * threshold VALUE that fired, so editing rules never re-fires passed buckets, and a
 * renewed expiry_date (new key) starts a fresh cycle.
 *
 * Never throws out of runDaily()/getSummary() — failures are logged and swallowed so
 * a bad row can't crash the cron or the dashboard.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const inApp = require('./inAppNotification.service');

// Last-resort fallback when no rule matches (e.g. every rule row deleted).
const BASELINE = { thresholds: [60, 30, 14, 7], include_overdue: true };
const OVERDUE_BUCKET = -1;        // sentinel threshold_days for the "expired" bucket
const OVERDUE_LOOKBACK_DAYS = 365; // don't alert on expiries older than this (stale data)

const HR_ROLE_SLUGS = ['superadmin', 'data_controller', 'admin'];

// ── config (runtime toggle) ──────────────────────────────────────
async function getConfig() {
  const r = await query(
    'SELECT id, enabled, digest_enabled, updated_at FROM expiry_monitor_config ORDER BY updated_at ASC LIMIT 1'
  );
  // Fail safe: if somehow no row, treat as enabled (default ON) but flag it.
  return r.rows[0] || { enabled: true, digest_enabled: false, _missing: true };
}

async function setConfig({ enabled, digest_enabled, updatedBy } = {}) {
  const cur = await getConfig();
  const next = {
    enabled: typeof enabled === 'boolean' ? enabled : cur.enabled,
    digest_enabled: typeof digest_enabled === 'boolean' ? digest_enabled : cur.digest_enabled,
  };
  await query(
    `UPDATE expiry_monitor_config
        SET enabled = $1, digest_enabled = $2, updated_by = $3, updated_at = NOW()
      WHERE id = (SELECT id FROM expiry_monitor_config ORDER BY updated_at ASC LIMIT 1)`,
    [next.enabled, next.digest_enabled, updatedBy || null]
  );
  return getConfig();
}

// ── rules ────────────────────────────────────────────────────────
async function loadRules() {
  const r = await query(
    `SELECT id, field, nationality, document_type, contractor_id,
            thresholds, include_overdue, created_at
       FROM expiry_threshold_rules
      WHERE is_active = TRUE`
  );
  return r.rows;
}

// Most specific matching rule wins; nationality > document_type > contractor > field.
function resolveRule(rules, item) {
  let best = null;
  let bestScore = -1;
  for (const r of rules) {
    if (r.field !== '*' && r.field !== item.field) continue;
    if (r.nationality != null && r.nationality !== item.nationality) continue;
    if (r.document_type != null && r.document_type !== item.document_type) continue;
    if (r.contractor_id != null && r.contractor_id !== item.contractor_id) continue;
    const score =
      (r.nationality != null ? 4 : 0) +
      (r.document_type != null ? 2 : 0) +
      (r.contractor_id != null ? 1 : 0) +
      (r.field !== '*' ? 1 : 0);
    if (score > bestScore || (score === bestScore && best && new Date(r.created_at) > new Date(best.created_at))) {
      best = r;
      bestScore = score;
    }
  }
  return best || BASELINE;
}

// The single most-urgent bucket the item currently qualifies for (fires once each).
// Returns a threshold-day value, OVERDUE_BUCKET, or null (too far out / no overdue rule).
function computeBucket(daysUntil, rule) {
  if (daysUntil < 0) return rule.include_overdue ? OVERDUE_BUCKET : null;
  // smallest T such that daysUntil <= T  →  most-urgent qualifying window
  const asc = [...rule.thresholds].filter((t) => Number.isInteger(t) && t > 0).sort((a, b) => a - b);
  for (const t of asc) {
    if (daysUntil <= t) return t;
  }
  return null; // farther out than the widest threshold
}

// ── candidate gathering ──────────────────────────────────────────
function maxThreshold(rules) {
  let m = Math.max(...BASELINE.thresholds);
  for (const r of rules) {
    for (const t of r.thresholds || []) if (t > m) m = t;
  }
  return m;
}

// today at UTC midnight, and integer day diff from an ISO date string.
function todayUTC() {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}
function daysUntil(expiryDate) {
  const d = new Date(expiryDate);
  const e = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((e - todayUTC()) / 86400000);
}

// All items whose expiry sits within [today - lookback, today + maxThreshold].
async function gatherItems(maxT) {
  const lo = `-${OVERDUE_LOOKBACK_DAYS} days`;
  const hi = `${maxT} days`;
  const r = await query(
    `SELECT 'employee' AS entity_type, e.id::text AS entity_id, 'visa' AS field,
            e.visa_expiry AS expiry_date, e.id AS employee_id,
            e.first_name, e.last_name, e.nationality, e.contractor_id,
            NULL::varchar AS document_type, NULL::varchar AS document_name
       FROM employees e
      WHERE e.visa_expiry IS NOT NULL
        AND e.visa_expiry BETWEEN (CURRENT_DATE + ($1)::interval) AND (CURRENT_DATE + ($2)::interval)
     UNION ALL
     SELECT 'employee', e.id::text, 'contract',
            e.end_date, e.id,
            e.first_name, e.last_name, e.nationality, e.contractor_id,
            NULL, NULL
       FROM employees e
      WHERE e.end_date IS NOT NULL
        AND e.end_date BETWEEN (CURRENT_DATE + ($1)::interval) AND (CURRENT_DATE + ($2)::interval)
     UNION ALL
     SELECT 'employee_document', d.id::text, 'document',
            d.expiry_date, d.employee_id,
            e.first_name, e.last_name, e.nationality, e.contractor_id,
            d.document_type, d.document_name
       FROM employee_documents d
       JOIN employees e ON e.id = d.employee_id
      WHERE d.deleted_at IS NULL
        AND d.expiry_date IS NOT NULL
        AND d.expiry_date BETWEEN (CURRENT_DATE + ($1)::interval) AND (CURRENT_DATE + ($2)::interval)`,
    [lo, hi]
  );
  return r.rows;
}

async function getRecipients() {
  const r = await query(
    `SELECT DISTINCT u.id
       FROM users u
       LEFT JOIN roles r  ON r.id  = u.role_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r2 ON r2.id = ur.role_id
      WHERE u.is_active = TRUE
        AND (r.slug = ANY($1) OR r2.slug = ANY($1))`,
    [HR_ROLE_SLUGS]
  );
  return r.rows.map((x) => x.id);
}

// ── presentation helpers ─────────────────────────────────────────
function severityOf(bucket) {
  if (bucket === OVERDUE_BUCKET) return 'critical';
  if (bucket <= 7) return 'high';
  if (bucket <= 14) return 'warning';
  return 'info';
}

function fieldLabelHu(field, documentType) {
  if (field === 'visa') return 'Vízum';
  if (field === 'contract') return 'Szerződés';
  return documentType ? `Dokumentum (${documentType})` : 'Dokumentum';
}

function buildMessage(item, bucket, dUntil) {
  const name = `${item.last_name || ''} ${item.first_name || ''}`.trim() || 'Munkavállaló';
  const what = fieldLabelHu(item.field, item.document_type);
  const date = new Date(item.expiry_date).toISOString().slice(0, 10);
  if (bucket === OVERDUE_BUCKET) {
    return { title: `${what} LEJÁRT — ${name}`, message: `${name}: ${what} lejárt (${date}, ${Math.abs(dUntil)} napja).` };
  }
  return { title: `${what} lejár (${dUntil} nap) — ${name}`, message: `${name}: ${what} lejár ${date} (${dUntil} nap múlva).` };
}

// ── main daily run ───────────────────────────────────────────────
async function runDaily({ force = false } = {}) {
  try {
    const config = await getConfig();
    if (!force && !config.enabled) {
      logger.info('[expiryMonitor] disabled — skipping run');
      return { skipped: true, reason: 'disabled' };
    }

    const rules = await loadRules();
    const items = await gatherItems(maxThreshold(rules));
    const recipients = await getRecipients();

    let fired = 0;
    const byBucket = {};

    for (const item of items) {
      try {
        const rule = resolveRule(rules, item);
        const dUntil = daysUntil(item.expiry_date);
        const bucket = computeBucket(dUntil, rule);
        if (bucket === null) continue;

        // Atomic dedup: insert the log row first; only notify if WE created it.
        const ins = await query(
          `INSERT INTO expiry_alert_log (entity_type, entity_id, field, expiry_date, threshold_days)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (entity_type, entity_id, field, expiry_date, threshold_days) DO NOTHING
           RETURNING id`,
          [item.entity_type, item.entity_id, item.field, item.expiry_date, bucket]
        );
        if (ins.rows.length === 0) continue; // already alerted for this bucket

        const { title, message } = buildMessage(item, bucket, dUntil);
        const link = `/employees/${item.employee_id}`;
        const data = {
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          field: item.field,
          expiry_date: new Date(item.expiry_date).toISOString().slice(0, 10),
          threshold_days: bucket,
          severity: severityOf(bucket),
        };
        if (recipients.length > 0) {
          await inApp.notifyMany(recipients, {
            type: 'expiry_alert',
            title,
            message,
            link,
            data,
            contractorId: item.contractor_id || null,
          });
        }
        fired += 1;
        byBucket[bucket] = (byBucket[bucket] || 0) + 1;
      } catch (itemErr) {
        logger.error('[expiryMonitor] item failed:', itemErr.message);
      }
    }

    logger.info(`[expiryMonitor] run complete — checked=${items.length} fired=${fired} recipients=${recipients.length}`);
    return { skipped: false, checked: items.length, fired, byBucket, recipients: recipients.length };
  } catch (err) {
    logger.error('[expiryMonitor] runDaily failed:', err.message);
    return { skipped: false, error: err.message, checked: 0, fired: 0 };
  }
}

// ── dashboard widget (live, read-only; does NOT fire or log) ─────
async function getSummary() {
  try {
    const config = await getConfig();
    if (!config.enabled) return { enabled: false };

    const rules = await loadRules();
    const items = await gatherItems(maxThreshold(rules));

    const counts = { critical: 0, high: 0, warning: 0, info: 0 };
    const list = [];
    for (const item of items) {
      const rule = resolveRule(rules, item);
      const dUntil = daysUntil(item.expiry_date);
      const bucket = computeBucket(dUntil, rule);
      if (bucket === null) continue;
      const severity = severityOf(bucket);
      counts[severity] += 1;
      list.push({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        employee_id: item.employee_id,
        name: `${item.last_name || ''} ${item.first_name || ''}`.trim(),
        field: item.field,
        document_type: item.document_type,
        nationality: item.nationality,
        expiry_date: new Date(item.expiry_date).toISOString().slice(0, 10),
        days_until: dUntil,
        bucket,
        severity,
      });
    }
    list.sort((a, b) => a.days_until - b.days_until);
    return { enabled: true, total: list.length, counts, items: list.slice(0, 100) };
  } catch (err) {
    logger.error('[expiryMonitor] getSummary failed:', err.message);
    return { enabled: true, total: 0, counts: { critical: 0, high: 0, warning: 0, info: 0 }, items: [], error: err.message };
  }
}

module.exports = {
  runDaily,
  getSummary,
  getConfig,
  setConfig,
  loadRules,
  // exported for unit-level reasoning/tests:
  resolveRule,
  computeBucket,
  BASELINE,
  OVERDUE_BUCKET,
};
