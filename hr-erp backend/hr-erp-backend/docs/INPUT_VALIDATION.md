# Input Validation Guide

## Overview

All user input is validated and sanitized before processing. The validation layer uses a combination of utility functions (`src/utils/validation.js`) and Express middleware factories (`src/middleware/validate.js`).

## Validation Utilities

### UUID Validation
```javascript
const { isValidUUID } = require('../utils/validation');
// Used for all path params (:id)
if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format' });
```

### String Sanitization
```javascript
const { sanitizeString } = require('../utils/validation');
// Strips HTML tags, trims whitespace, enforces max length
const name = sanitizeString(req.body.name, 255); // null if empty
```

### Pagination
```javascript
const { parsePagination } = require('../utils/validation');
// Returns { page, limit, offset } with enforced bounds
const { page, limit, offset } = parsePagination(req.query);
// Options: parsePagination(query, { maxLimit: 100 })
```

### Sort Order
```javascript
const { parseSortOrder } = require('../utils/validation');
// Only allows 'ASC' or 'DESC', defaults to 'DESC'
const order = parseSortOrder(req.query.sortOrder);
```

### Search
```javascript
const { sanitizeSearch } = require('../utils/validation');
// Trims, enforces 200-char max, returns null if empty
const search = sanitizeSearch(req.query.search);
```

### Date Validation
```javascript
const { isValidDate } = require('../utils/validation');
// Accepts YYYY-MM-DD format only
if (!isValidDate(dateStr)) return res.status(400).json({ message: 'Invalid date' });
```

### Amount Validation
```javascript
const { validateAmount } = require('../utils/validation');
// Returns { valid, value, error }
const result = validateAmount(req.body.amount);
if (!result.valid) return res.status(400).json({ message: result.error });
```

### Allowlist Validation
```javascript
const { isAllowedValue } = require('../utils/validation');
const ALLOWED_STATUSES = ['active', 'inactive', 'pending'];
if (!isAllowedValue(status, ALLOWED_STATUSES)) { /* reject */ }
```

## Middleware Factories

### validateUUID(paramName)
```javascript
const { validateUUID } = require('../middleware/validate');
router.get('/:id', validateUUID('id'), controller.getById);
```

### validatePagination()
```javascript
router.get('/', validatePagination(), controller.getAll);
```

### validateRequired(fields)
```javascript
router.post('/', validateRequired(['name', 'email']), controller.create);
```

### sanitizeBody(fields)
```javascript
router.post('/', sanitizeBody(['name', 'description']), controller.create);
```

### validateSearch()
```javascript
router.get('/', validateSearch(), controller.search);
```

## SQL Injection Prevention

All queries use PostgreSQL parameterized queries (`$1`, `$2`, etc.):

```javascript
// SAFE - parameterized
await query('SELECT * FROM employees WHERE id = $1', [id]);

// SAFE - allowlist-validated column names
const SORT_COLUMNS = { name: 'e.last_name', date: 'e.created_at' };
const sortCol = SORT_COLUMNS[req.query.sort] || 'e.created_at';
const sql = `SELECT * FROM employees ORDER BY ${sortCol} ${order}`;
```

Column names in ORDER BY clauses are validated against allowlists, never interpolated from user input directly.

## XSS Prevention

- `sanitizeString()` strips all HTML tags via regex
- All user-facing text fields pass through sanitization before storage
- Content-Security-Policy headers prevent inline script execution
- API responses are JSON (not rendered HTML)

## Controller Coverage

| Controller | UUID | Pagination | Sanitize | Search | Email | Amount |
|-----------|------|-----------|----------|--------|-------|--------|
| employee | Yes | Yes | Yes | Yes | - | - |
| user | Yes | Yes | Yes | Yes | Yes | - |
| ticket | Yes | Yes | Yes | Yes | - | - |
| invoice | Yes | Yes | Yes | Yes | - | Yes |
| salary | Yes | Yes | - | - | - | Yes |
| notification | Yes | Yes | - | - | - | - |
| auth | - | - | Yes | - | Yes | - |
| category | Yes | - | - | - | - | - |
| status | Yes | - | - | - | - | - |
| priority | Yes | - | - | - | - | - |
| costCenter | Yes | - | - | - | - | - |

## Audit Scripts

Run these to check validation coverage:
```bash
npm run security:scan-sql      # Scan for SQL injection patterns
npm run security:audit-validation  # Audit controller validation coverage
```
