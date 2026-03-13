# Validation Audit Report

**Date:** 2026-03-13
**Scanner:** scripts/audit_validation.js
**Scope:** src/controllers/

## Controller Coverage

| Controller | Endpoints | UUID | Pagination | Sanitize | Search | Email | Required | Amount | Date |
|---|---|---|---|---|---|---|---|---|---|
| accommodation.controller.js | 7 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| activity-log.controller.js | 3 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| assignmentRule.controller.js | 6 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| auth.controller.js | 4 | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| calendar.controller.js | 10 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| category.controller.js | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| chatbot.controller.js | 33 | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| contractor.controller.js | 6 | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| costCenter.controller.js | 23 | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| dashboard.controller.js | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| document.controller.js | 6 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| email-template.controller.js | 10 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| emailInbox.controller.js | 13 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| employee-document.controller.js | 4 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| employee.controller.js | 15 | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| export.controller.js | 6 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| google-calendar.controller.js | 6 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| invoice.controller.js | 5 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| invoiceDraft.controller.js | 10 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| invoiceReport.controller.js | 2 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| notification-center.controller.js | 4 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| notification.controller.js | 11 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| occupancy.controller.js | 3 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| payment.controller.js | 6 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| permission.controller.js | 6 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| preferences.controller.js | 2 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| priority.controller.js | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| project.controller.js | 10 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| report.controller.js | 5 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| room.controller.js | 4 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| salary.controller.js | 13 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| scheduled-report.controller.js | 7 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| search.controller.js | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| sla.controller.js | 5 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| status.controller.js | 1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| task.controller.js | 12 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| ticket.controller.js | 5 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| timesheet.controller.js | 4 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| user.controller.js | 6 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| userWorkload.controller.js | 6 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| video.controller.js | 7 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

## Validation Utilities Available

Location: `src/utils/validation.js`

| Function | Purpose |
|---|---|
| `isValidUUID()` | Validates UUID v4 format |
| `sanitizeString()` | Strips HTML, trims, limits length |
| `parsePositiveNumber()` | Validates positive numbers |
| `parsePagination()` | Validates page/limit with maxLimit |
| `parseSortOrder()` | Only allows ASC/DESC |
| `isAllowedValue()` | Checks value against allowlist |
| `sanitizeSearch()` | Validates search query length |
| `isValidDate()` | Validates YYYY-MM-DD format |
| `validateAmount()` | Validates financial amounts |
| `validateIdParam()` | Validates UUID with 400 response |

## Validation Middleware Available

Location: `src/middleware/validate.js`

| Middleware | Purpose |
|---|---|
| `validateUUID()` | Route-level UUID param validation |
| `validatePagination()` | Attaches safe pagination to req |
| `validateRequired()` | Checks required body fields |
| `sanitizeBody()` | Strips HTML from body fields |
| `validateEmailFields()` | Validates email format in body |
| `validateSearch` | Validates search query param |

## Summary

- **Total Controllers:** 41
- **With UUID Validation:** 7
- **With Pagination Validation:** 5
- **With String Sanitization:** 7
- **With Required Checks:** 31
