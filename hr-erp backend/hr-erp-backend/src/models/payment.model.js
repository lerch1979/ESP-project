/**
 * Payment Validation Model
 */

const VALID_METHODS = ['cash', 'bank_transfer', 'credit_card', 'other'];

const METHOD_LABELS = {
  cash: 'Készpénz',
  bank_transfer: 'Banki átutalás',
  credit_card: 'Bankkártya',
  other: 'Egyéb',
};

function validateCreate(data) {
  const errors = [];

  if (!data.invoice_id) {
    errors.push('Számla megadása kötelező');
  }

  if (data.amount === undefined || data.amount === null) {
    errors.push('Összeg megadása kötelező');
  } else {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push('Összeg pozitív szám kell legyen');
    }
  }

  if (!data.payment_date) {
    errors.push('Fizetés dátuma kötelező');
  }

  if (!data.payment_method) {
    errors.push('Fizetési mód megadása kötelező');
  } else if (!VALID_METHODS.includes(data.payment_method)) {
    errors.push(`Érvénytelen fizetési mód. Lehetséges értékek: ${VALID_METHODS.join(', ')}`);
  }

  if (data.reference_number && data.reference_number.length > 100) {
    errors.push('Hivatkozási szám maximum 100 karakter lehet');
  }

  return { valid: errors.length === 0, errors };
}

function validateUpdate(data) {
  const errors = [];

  if (data.amount !== undefined) {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push('Összeg pozitív szám kell legyen');
    }
  }

  if (data.payment_method !== undefined && !VALID_METHODS.includes(data.payment_method)) {
    errors.push(`Érvénytelen fizetési mód. Lehetséges értékek: ${VALID_METHODS.join(', ')}`);
  }

  if (data.reference_number && data.reference_number.length > 100) {
    errors.push('Hivatkozási szám maximum 100 karakter lehet');
  }

  const validFields = ['amount', 'payment_date', 'payment_method', 'reference_number', 'notes'];
  const hasValidField = Object.keys(data).some(key => validFields.includes(key));
  if (!hasValidField) {
    errors.push('Legalább egy módosítandó mező szükséges');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCreate, validateUpdate, VALID_METHODS, METHOD_LABELS };
