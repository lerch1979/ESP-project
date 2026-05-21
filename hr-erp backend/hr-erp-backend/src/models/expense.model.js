/**
 * Accommodation Expense Validation Model
 *
 * Categories + status + source + payment_status must match the CHECK
 * constraints on accommodation_expenses (migrations 112 + 113).
 */

const crypto = require('crypto');

const VALID_CATEGORIES = ['rezsi', 'karbantartas', 'takaritas', 'egyeb'];
const VALID_SOURCES = ['manual', 'ai', 'email_ocr', 'import'];
const VALID_STATUSES = ['pending_review', 'confirmed', 'rejected'];
const VALID_PAYMENT_STATUSES = ['unpaid', 'paid', 'partial'];

const CATEGORY_LABELS = {
  rezsi: 'Rezsi',
  karbantartas: 'Karbantartás',
  takaritas: 'Takarítás',
  egyeb: 'Egyéb',
};

// ────────────────────────────────────────────────────────────────────────
// VAT (ÁFA) defaults + math — migration 114
//
// HU VAT is 27% for most accommodation operating costs (utilities,
// maintenance, cleaning). 'egyeb' is intentionally NULL — let the user
// pick because the bucket spans many actual rates.
//
// Tolerance: ±1 HUF when validating user-supplied net/vat/gross triples.
// HUF has no minor units in practice, so 1 forint covers rounding noise.
// ────────────────────────────────────────────────────────────────────────
const DEFAULT_VAT_RATE_BY_CATEGORY = {
  rezsi: 27,
  karbantartas: 27,
  takaritas: 27,
  egyeb: null,
};
const VAT_TOLERANCE_HUF = 1;

function defaultVatRateForCategory(category) {
  if (category in DEFAULT_VAT_RATE_BY_CATEGORY) {
    return DEFAULT_VAT_RATE_BY_CATEGORY[category];
  }
  return null;
}

/**
 * Compute (net, vat) from a gross amount + rate.
 *   net = round(gross / (1 + rate/100))
 *   vat = gross - net
 * Returns {net, vat} or null if inputs are unusable.
 */
function computeNetVat(grossAmount, vatRate) {
  if (grossAmount == null || vatRate == null) return null;
  const gross = Number(grossAmount);
  const rate = Number(vatRate);
  if (Number.isNaN(gross) || Number.isNaN(rate)) return null;
  if (rate < 0 || rate > 100) return null;

  // Special case: 0% — net == gross, vat == 0
  if (rate === 0) {
    return { net: Math.round(gross), vat: 0 };
  }
  const net = Math.round(gross / (1 + rate / 100));
  const vat = Math.round(gross - net);
  return { net, vat };
}

const BILLING_MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ────────────────────────────────────────────────────────────────────────
// billing_month derivation — if performance_date is set, the accounting
// month defaults to its YYYY-MM. Caller can still pass billing_month
// explicitly to override (cross-month adjustments).
// ────────────────────────────────────────────────────────────────────────
function deriveBillingMonth(performance_date) {
  if (!performance_date) return null;
  const s = String(performance_date);
  if (!DATE_RE.test(s)) return null;
  return s.slice(0, 7);
}

// ────────────────────────────────────────────────────────────────────────
// dedup fingerprint — SHA256 of normalized vendor_name + amount (rounded
// to nearest HUF) + performance_date. Returns null if any input is
// missing — incomplete data cannot generate a fingerprint, which avoids
// false-positive collisions on the legacy/manual rows that don't yet
// carry vendor metadata.
//
// Normalization rules:
//   - vendor_name: lowercase, trim, collapse internal whitespace
//   - amount: rounded to nearest integer (HUF has no minor units in
//     normal use)
//   - performance_date: ISO YYYY-MM-DD
// ────────────────────────────────────────────────────────────────────────
function generateFingerprint({ vendor_name, amount, performance_date }) {
  if (!vendor_name || amount == null || !performance_date) return null;

  const v = String(vendor_name).toLowerCase().trim().replace(/\s+/g, ' ');
  const a = Math.round(Number(amount));
  if (!v || Number.isNaN(a)) return null;

  // performance_date may come in as a JS Date (PG returns DATE columns as
  // Date objects), an ISO string, or a YYYY-MM-DD string. Normalise to
  // YYYY-MM-DD without locale shifts.
  let d;
  if (performance_date instanceof Date) {
    if (Number.isNaN(performance_date.getTime())) return null;
    const y = performance_date.getFullYear();
    const m = String(performance_date.getMonth() + 1).padStart(2, '0');
    const day = String(performance_date.getDate()).padStart(2, '0');
    d = `${y}-${m}-${day}`;
  } else {
    d = String(performance_date).slice(0, 10);
  }
  if (!DATE_RE.test(d)) return null;

  return crypto
    .createHash('sha256')
    .update(`${v}|${a}|${d}`)
    .digest('hex');
}

// ────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────

function validateCreate(data) {
  const errors = [];

  if (!data.accommodation_id) {
    errors.push('Szállás megadása kötelező');
  }

  // billing_month — required at the DB level. If caller omits but
  // performance_date is present, the service auto-derives. So at
  // validation time we accept "either or both".
  if (!data.billing_month && !data.performance_date) {
    errors.push('Számlázási hónap vagy teljesítés dátum kötelező');
  } else if (data.billing_month && !BILLING_MONTH_RE.test(data.billing_month)) {
    errors.push('Számlázási hónap formátuma: YYYY-MM');
  }

  if (data.performance_date && !DATE_RE.test(String(data.performance_date))) {
    errors.push('Teljesítés dátum formátuma: YYYY-MM-DD');
  }
  if (data.invoice_date && !DATE_RE.test(String(data.invoice_date))) {
    errors.push('Számla dátum formátuma: YYYY-MM-DD');
  }
  if (data.payment_date && !DATE_RE.test(String(data.payment_date))) {
    errors.push('Fizetés dátum formátuma: YYYY-MM-DD');
  }

  if (!data.category) {
    errors.push('Kategória megadása kötelező');
  } else if (!VALID_CATEGORIES.includes(data.category)) {
    errors.push(`Érvénytelen kategória. Lehetséges értékek: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (data.amount === undefined || data.amount === null) {
    errors.push('Összeg megadása kötelező');
  } else {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount < 0) {
      errors.push('Összeg nem lehet negatív szám');
    }
  }

  if (data.currency && data.currency.length !== 3) {
    errors.push('Pénznem kódja 3 karakter kell legyen (pl. HUF)');
  }

  if (data.invoice_number && String(data.invoice_number).length > 100) {
    errors.push('Számlaszám maximum 100 karakter lehet');
  }
  if (data.vendor_tax_number && String(data.vendor_tax_number).length > 50) {
    errors.push('Adószám maximum 50 karakter lehet');
  }

  if (data.source !== undefined && !VALID_SOURCES.includes(data.source)) {
    errors.push(`Érvénytelen forrás. Lehetséges: ${VALID_SOURCES.join(', ')}`);
  }
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    errors.push(`Érvénytelen státusz. Lehetséges: ${VALID_STATUSES.join(', ')}`);
  }
  if (data.payment_status !== undefined && !VALID_PAYMENT_STATUSES.includes(data.payment_status)) {
    errors.push(`Érvénytelen fizetési státusz. Lehetséges: ${VALID_PAYMENT_STATUSES.join(', ')}`);
  }
  if (data.ai_confidence !== undefined && data.ai_confidence !== null) {
    const n = parseInt(data.ai_confidence, 10);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      errors.push('AI bizonyosság 0 és 100 között lehet');
    }
  }

  if (data.file_attachments !== undefined && !Array.isArray(data.file_attachments)) {
    errors.push('file_attachments tömb (array) kell legyen');
  }

  validateVatFields(data, errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Shared VAT validation — appends errors into the supplied array.
 *   • vat_rate range (loose, 0-100 — matches CHECK)
 *   • net/vat split consistency (both or neither — matches CHECK)
 *   • If all three of (net, vat, amount) are present: |net + vat - amount| ≤ 1 HUF
 *   • is_reverse_vat boolean type
 *   • vat_exemption_reason length sanity
 */
function validateVatFields(data, errors) {
  if (data.vat_rate !== undefined && data.vat_rate !== null && data.vat_rate !== '') {
    const r = Number(data.vat_rate);
    if (Number.isNaN(r) || r < 0 || r > 100) {
      errors.push('ÁFA kulcs 0 és 100 között lehet');
    }
  }

  const hasNet = data.net_amount !== undefined && data.net_amount !== null && data.net_amount !== '';
  const hasVat = data.vat_amount !== undefined && data.vat_amount !== null && data.vat_amount !== '';
  if (hasNet !== hasVat) {
    errors.push('Nettó és ÁFA összeg csak együtt adható meg (vagy egyik sem)');
  }

  if (hasNet && hasVat
      && data.amount !== undefined && data.amount !== null && data.amount !== '') {
    const net = Number(data.net_amount);
    const vat = Number(data.vat_amount);
    const amt = Number(data.amount);
    if (!Number.isNaN(net) && !Number.isNaN(vat) && !Number.isNaN(amt)
        && Math.abs(net + vat - amt) > VAT_TOLERANCE_HUF) {
      errors.push(
        `Nettó + ÁFA = bruttó nem stimmel (${net} + ${vat} ≠ ${amt}, tolerancia ${VAT_TOLERANCE_HUF} Ft)`,
      );
    }
  }

  if (data.is_reverse_vat !== undefined
      && typeof data.is_reverse_vat !== 'boolean') {
    errors.push('is_reverse_vat csak true vagy false lehet');
  }

  if (data.vat_exemption_reason && String(data.vat_exemption_reason).length > 50) {
    errors.push('ÁFA mentesség indoka maximum 50 karakter lehet');
  }
}

function validateUpdate(data) {
  const errors = [];

  if (data.billing_month !== undefined && !BILLING_MONTH_RE.test(data.billing_month)) {
    errors.push('Számlázási hónap formátuma: YYYY-MM');
  }
  if (data.performance_date !== undefined && data.performance_date !== null
      && !DATE_RE.test(String(data.performance_date))) {
    errors.push('Teljesítés dátum formátuma: YYYY-MM-DD');
  }
  if (data.invoice_date !== undefined && data.invoice_date !== null
      && !DATE_RE.test(String(data.invoice_date))) {
    errors.push('Számla dátum formátuma: YYYY-MM-DD');
  }
  if (data.payment_date !== undefined && data.payment_date !== null
      && !DATE_RE.test(String(data.payment_date))) {
    errors.push('Fizetés dátum formátuma: YYYY-MM-DD');
  }

  if (data.category !== undefined && !VALID_CATEGORIES.includes(data.category)) {
    errors.push(`Érvénytelen kategória. Lehetséges értékek: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (data.amount !== undefined) {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount < 0) {
      errors.push('Összeg nem lehet negatív szám');
    }
  }

  if (data.currency !== undefined && data.currency.length !== 3) {
    errors.push('Pénznem kódja 3 karakter kell legyen (pl. HUF)');
  }

  if (data.invoice_number && String(data.invoice_number).length > 100) {
    errors.push('Számlaszám maximum 100 karakter lehet');
  }
  if (data.vendor_tax_number && String(data.vendor_tax_number).length > 50) {
    errors.push('Adószám maximum 50 karakter lehet');
  }

  if (data.source !== undefined && !VALID_SOURCES.includes(data.source)) {
    errors.push(`Érvénytelen forrás. Lehetséges: ${VALID_SOURCES.join(', ')}`);
  }
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    errors.push(`Érvénytelen státusz. Lehetséges: ${VALID_STATUSES.join(', ')}`);
  }
  if (data.payment_status !== undefined && !VALID_PAYMENT_STATUSES.includes(data.payment_status)) {
    errors.push(`Érvénytelen fizetési státusz. Lehetséges: ${VALID_PAYMENT_STATUSES.join(', ')}`);
  }
  if (data.ai_confidence !== undefined && data.ai_confidence !== null) {
    const n = parseInt(data.ai_confidence, 10);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      errors.push('AI bizonyosság 0 és 100 között lehet');
    }
  }

  if (data.file_attachments !== undefined && !Array.isArray(data.file_attachments)) {
    errors.push('file_attachments tömb (array) kell legyen');
  }

  validateVatFields(data, errors);

  const validFields = [
    'accommodation_id', 'billing_month', 'category', 'amount', 'currency',
    'invoice_number', 'attachment_url', 'notes',
    // Phase 2 fields:
    'performance_date', 'invoice_date', 'vendor_name', 'vendor_tax_number',
    'file_attachments', 'cost_center_id', 'source', 'ai_confidence', 'status',
    'approved_by', 'approved_at', 'payment_date', 'payment_status',
    // VAT fields (migration 114):
    'net_amount', 'vat_rate', 'vat_amount', 'vat_exemption_reason', 'is_reverse_vat',
  ];
  const hasValidField = Object.keys(data).some((key) => validFields.includes(key));
  if (!hasValidField) {
    errors.push('Legalább egy módosítandó mező szükséges');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateCreate,
  validateUpdate,
  deriveBillingMonth,
  generateFingerprint,
  defaultVatRateForCategory,
  computeNetVat,
  VALID_CATEGORIES,
  VALID_SOURCES,
  VALID_STATUSES,
  VALID_PAYMENT_STATUSES,
  CATEGORY_LABELS,
  DEFAULT_VAT_RATE_BY_CATEGORY,
  VAT_TOLERANCE_HUF,
};
