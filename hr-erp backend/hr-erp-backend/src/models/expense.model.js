/**
 * Accommodation Expense Validation Model
 *
 * Categories must match migration 112 CHECK constraint on accommodation_expenses.category.
 */

const VALID_CATEGORIES = ['rezsi', 'karbantartas', 'takaritas', 'egyeb'];

const CATEGORY_LABELS = {
  rezsi: 'Rezsi',
  karbantartas: 'Karbantartás',
  takaritas: 'Takarítás',
  egyeb: 'Egyéb',
};

const BILLING_MONTH_RE = /^\d{4}-\d{2}$/;

function validateCreate(data) {
  const errors = [];

  if (!data.accommodation_id) {
    errors.push('Szállás megadása kötelező');
  }

  if (!data.billing_month) {
    errors.push('Számlázási hónap kötelező');
  } else if (!BILLING_MONTH_RE.test(data.billing_month)) {
    errors.push('Számlázási hónap formátuma: YYYY-MM');
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

  if (data.invoice_number && data.invoice_number.length > 100) {
    errors.push('Számlaszám maximum 100 karakter lehet');
  }

  return { valid: errors.length === 0, errors };
}

function validateUpdate(data) {
  const errors = [];

  if (data.billing_month !== undefined && !BILLING_MONTH_RE.test(data.billing_month)) {
    errors.push('Számlázási hónap formátuma: YYYY-MM');
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

  if (data.invoice_number && data.invoice_number.length > 100) {
    errors.push('Számlaszám maximum 100 karakter lehet');
  }

  const validFields = [
    'accommodation_id', 'billing_month', 'category', 'amount', 'currency',
    'invoice_number', 'attachment_url', 'notes',
  ];
  const hasValidField = Object.keys(data).some((key) => validFields.includes(key));
  if (!hasValidField) {
    errors.push('Legalább egy módosítandó mező szükséges');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCreate, validateUpdate, VALID_CATEGORIES, CATEGORY_LABELS };
