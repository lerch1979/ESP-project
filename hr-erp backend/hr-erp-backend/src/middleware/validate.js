/**
 * Request Validation Middleware
 *
 * Reusable middleware factories for common validation patterns.
 * Uses the existing validation utilities from src/utils/validation.js.
 */

const {
  isValidUUID,
  sanitizeString,
  parsePagination,
  sanitizeSearch,
} = require('../utils/validation');

/**
 * Validate UUID path parameters.
 * Usage: router.get('/:id', validateUUID('id'), controller.getById)
 */
function validateUUID(...paramNames) {
  return (req, res, next) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value && !isValidUUID(value)) {
        return res.status(400).json({
          success: false,
          message: `Érvénytelen ${name} formátum`,
        });
      }
    }
    next();
  };
}

/**
 * Validate and normalize pagination query params.
 * Attaches req.pagination = { page, limit, offset }
 */
function validatePagination(defaults = {}) {
  return (req, res, next) => {
    req.pagination = parsePagination(req.query, {
      page: 1,
      limit: defaults.limit || 50,
      maxLimit: defaults.maxLimit || 200,
    });
    next();
  };
}

/**
 * Validate required body fields.
 * Usage: validateRequired('title', 'email')
 */
function validateRequired(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => {
      const val = req.body[f];
      return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
    });

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A következő mezők kitöltése kötelező: ${missing.join(', ')}`,
      });
    }
    next();
  };
}

/**
 * Sanitize string body fields (strip HTML, trim, limit length).
 * Usage: sanitizeBody('title', 'description', 'comment')
 */
function sanitizeBody(...fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (req.body[field] !== undefined && typeof req.body[field] === 'string') {
        req.body[field] = sanitizeString(req.body[field], 10000);
      }
    }
    next();
  };
}

/**
 * Validate email format.
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate email body fields.
 * Usage: validateEmail('email', 'to')
 */
function validateEmailFields(...fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== '') {
        if (!isValidEmail(req.body[field])) {
          return res.status(400).json({
            success: false,
            message: `Érvénytelen email formátum: ${field}`,
          });
        }
      }
    }
    next();
  };
}

/**
 * Validate search query param and attach to req.searchQuery.
 */
function validateSearch(req, res, next) {
  if (req.query.search) {
    req.searchQuery = sanitizeSearch(req.query.search);
  } else {
    req.searchQuery = null;
  }
  next();
}

module.exports = {
  validateUUID,
  validatePagination,
  validateRequired,
  sanitizeBody,
  validateEmailFields,
  validateSearch,
  isValidEmail,
};
