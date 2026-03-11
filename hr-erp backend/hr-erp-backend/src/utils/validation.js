/**
 * Shared input validation & sanitization utilities
 * Used across all controllers to prevent injection and ensure data integrity.
 */

/**
 * Validate UUID format. Returns true if valid UUID v4.
 */
function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Strip HTML tags from a string to prevent stored XSS.
 */
function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize string input: trim, strip HTML tags, and limit length.
 * Returns null if empty after trimming.
 */
function sanitizeString(str, maxLength = 255) {
  if (str === null || str === undefined) return null;
  if (typeof str !== 'string') str = String(str);
  const cleaned = stripHtml(str).trim();
  if (cleaned.length === 0) return null;
  return cleaned.substring(0, maxLength);
}

/**
 * Validate and parse positive number. Returns null if invalid.
 */
function parsePositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
}

/**
 * Validate pagination params. Returns safe { page, limit, offset }.
 */
function parsePagination(query, defaults = { page: 1, limit: 50, maxLimit: 200 }) {
  const page = Math.max(1, parseInt(query.page) || defaults.page);
  const limit = Math.min(Math.max(1, parseInt(query.limit) || defaults.limit), defaults.maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Validate sort direction — only 'ASC' or 'DESC'.
 */
function parseSortOrder(value) {
  return value && value.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

/**
 * Validate that a value is in an allowed set.
 */
function isAllowedValue(value, allowedSet) {
  return allowedSet.includes(value);
}

/**
 * Validate search query: trim, limit length, reject if too short.
 */
function sanitizeSearch(str, { minLength = 1, maxLength = 200 } = {}) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim().substring(0, maxLength);
  if (trimmed.length < minLength) return null;
  return trimmed;
}

/**
 * Validate date string (YYYY-MM-DD format).
 */
function isValidDate(str) {
  if (!str || typeof str !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Validate numeric amount for financial fields.
 * Must be positive and within NUMERIC(15,2) range.
 */
function validateAmount(value) {
  const num = parsePositiveNumber(value);
  if (num === null) return { valid: false, error: 'Érvénytelen összeg' };
  if (num <= 0) return { valid: false, error: 'Az összegnek pozitívnak kell lennie' };
  if (num > 9999999999.99) return { valid: false, error: 'Az összeg túl nagy' };
  return { valid: true, value: num };
}

/**
 * Validate UUID from req.params and return 400 if invalid.
 * Returns the id or null (and sends response) if invalid.
 */
function validateIdParam(req, res, paramName = 'id') {
  const id = req.params[paramName];
  if (!isValidUUID(id)) {
    res.status(400).json({ success: false, message: `Érvénytelen ${paramName} formátum` });
    return null;
  }
  return id;
}

module.exports = {
  isValidUUID,
  sanitizeString,
  parsePositiveNumber,
  parsePagination,
  parseSortOrder,
  isAllowedValue,
  sanitizeSearch,
  isValidDate,
  validateAmount,
  validateIdParam,
};
