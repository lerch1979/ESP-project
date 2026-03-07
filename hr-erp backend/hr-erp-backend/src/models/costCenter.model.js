/**
 * Cost Center Validation Model
 * Validates input data for cost center CRUD operations
 */

const VALID_FIELDS = ['name', 'code', 'description', 'budget', 'parent_id', 'color', 'icon', 'is_active'];

/**
 * Validate cost center creation data
 * @param {Object} data - Request body
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCreate(data) {
  const errors = [];

  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    errors.push('Név megadása kötelező');
  } else if (data.name.trim().length > 100) {
    errors.push('Név maximum 100 karakter lehet');
  }

  if (!data.code || typeof data.code !== 'string' || !data.code.trim()) {
    errors.push('Kód megadása kötelező');
  } else if (data.code.trim().length > 50) {
    errors.push('Kód maximum 50 karakter lehet');
  } else if (!/^[A-Z0-9_-]+$/i.test(data.code.trim())) {
    errors.push('Kód csak betűket, számokat, kötőjelet és aláhúzást tartalmazhat');
  }

  if (data.budget !== undefined && data.budget !== null) {
    const budget = parseFloat(data.budget);
    if (isNaN(budget) || budget < 0) {
      errors.push('Költségkeret nem lehet negatív szám');
    }
  }

  if (data.description && typeof data.description === 'string' && data.description.length > 500) {
    errors.push('Leírás maximum 500 karakter lehet');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate cost center update data
 * @param {Object} data - Request body
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateUpdate(data) {
  const errors = [];

  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim()) {
      errors.push('Név nem lehet üres');
    } else if (data.name.trim().length > 100) {
      errors.push('Név maximum 100 karakter lehet');
    }
  }

  if (data.code !== undefined) {
    if (typeof data.code !== 'string' || !data.code.trim()) {
      errors.push('Kód nem lehet üres');
    } else if (data.code.trim().length > 50) {
      errors.push('Kód maximum 50 karakter lehet');
    } else if (!/^[A-Z0-9_-]+$/i.test(data.code.trim())) {
      errors.push('Kód csak betűket, számokat, kötőjelet és aláhúzást tartalmazhat');
    }
  }

  if (data.budget !== undefined && data.budget !== null) {
    const budget = parseFloat(data.budget);
    if (isNaN(budget) || budget < 0) {
      errors.push('Költségkeret nem lehet negatív szám');
    }
  }

  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description === 'string' && data.description.length > 500) {
      errors.push('Leírás maximum 500 karakter lehet');
    }
  }

  // Check at least one valid field is being updated
  const hasValidField = Object.keys(data).some(key => VALID_FIELDS.includes(key));
  if (!hasValidField) {
    errors.push('Legalább egy módosítandó mező szükséges');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateCreate,
  validateUpdate,
  VALID_FIELDS,
};
