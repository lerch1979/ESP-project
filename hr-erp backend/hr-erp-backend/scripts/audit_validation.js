#!/usr/bin/env node
/**
 * Validation Audit Script
 *
 * Scans controllers for validation coverage.
 * Run: node scripts/audit_validation.js
 */

const fs = require('fs');
const path = require('path');

const CONTROLLERS_DIR = path.join(__dirname, '..', 'src', 'controllers');

const VALIDATION_PATTERNS = {
  uuidValidation: /isValidUUID|validateIdParam|validateUUID/,
  pagination: /parsePagination/,
  sanitizeString: /sanitizeString/,
  sanitizeSearch: /sanitizeSearch/,
  emailValidation: /isValidEmail|email.*format|@.*@/,
  requiredCheck: /!.*\|\||required|kötelező/,
  amountValidation: /validateAmount/,
  dateValidation: /isValidDate/,
};

function auditController(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath);

  // Count exported functions
  const exportMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  const exports = exportMatch
    ? exportMatch[1].split(',').map(e => e.trim()).filter(Boolean)
    : [];

  const results = {};
  for (const [pattern, regex] of Object.entries(VALIDATION_PATTERNS)) {
    results[pattern] = regex.test(content);
  }

  // Count parameterized queries
  const paramQueries = (content.match(/\$\d+/g) || []).length;
  const templateQueries = (content.match(/\$\{/g) || []).length;

  return {
    name,
    endpoints: exports.length,
    exports,
    validation: results,
    parameterizedQueryCount: paramQueries,
    templateInterpolations: templateQueries,
  };
}

// Run audit
console.log('\n📋 Validation Audit\n');

const files = fs.readdirSync(CONTROLLERS_DIR).filter(f => f.endsWith('.js'));
const audits = files.map(f => auditController(path.join(CONTROLLERS_DIR, f)));

// Generate report
let report = `# Validation Audit Report

**Date:** ${new Date().toISOString().split('T')[0]}
**Scanner:** scripts/audit_validation.js
**Scope:** src/controllers/

## Controller Coverage

| Controller | Endpoints | UUID | Pagination | Sanitize | Search | Email | Required | Amount | Date |
|---|---|---|---|---|---|---|---|---|---|\n`;

for (const a of audits) {
  const v = a.validation;
  const check = (val) => val ? '✅' : '❌';
  report += `| ${a.name} | ${a.endpoints} | ${check(v.uuidValidation)} | ${check(v.pagination)} | ${check(v.sanitizeString)} | ${check(v.sanitizeSearch)} | ${check(v.emailValidation)} | ${check(v.requiredCheck)} | ${check(v.amountValidation)} | ${check(v.dateValidation)} |\n`;

  console.log(`  ${v.uuidValidation && v.requiredCheck ? '✅' : '⚠️'}  ${a.name} — ${a.endpoints} endpoints`);
}

report += `
## Validation Utilities Available

Location: \`src/utils/validation.js\`

| Function | Purpose |
|---|---|
| \`isValidUUID()\` | Validates UUID v4 format |
| \`sanitizeString()\` | Strips HTML, trims, limits length |
| \`parsePositiveNumber()\` | Validates positive numbers |
| \`parsePagination()\` | Validates page/limit with maxLimit |
| \`parseSortOrder()\` | Only allows ASC/DESC |
| \`isAllowedValue()\` | Checks value against allowlist |
| \`sanitizeSearch()\` | Validates search query length |
| \`isValidDate()\` | Validates YYYY-MM-DD format |
| \`validateAmount()\` | Validates financial amounts |
| \`validateIdParam()\` | Validates UUID with 400 response |

## Validation Middleware Available

Location: \`src/middleware/validate.js\`

| Middleware | Purpose |
|---|---|
| \`validateUUID()\` | Route-level UUID param validation |
| \`validatePagination()\` | Attaches safe pagination to req |
| \`validateRequired()\` | Checks required body fields |
| \`sanitizeBody()\` | Strips HTML from body fields |
| \`validateEmailFields()\` | Validates email format in body |
| \`validateSearch\` | Validates search query param |

## Summary

- **Total Controllers:** ${audits.length}
- **With UUID Validation:** ${audits.filter(a => a.validation.uuidValidation).length}
- **With Pagination Validation:** ${audits.filter(a => a.validation.pagination).length}
- **With String Sanitization:** ${audits.filter(a => a.validation.sanitizeString).length}
- **With Required Checks:** ${audits.filter(a => a.validation.requiredCheck).length}
`;

fs.writeFileSync(path.join(__dirname, '..', 'VALIDATION_AUDIT.md'), report);
console.log('\n📄 Report saved to VALIDATION_AUDIT.md');
