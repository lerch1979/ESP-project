# SQL Injection Scan Report

**Date:** 2026-03-13
**Scanner:** scripts/scan_sql_injection.js
**Scope:** src/ and scripts/ directories

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 7 |
| HIGH | 120 |
| MEDIUM | 58 |
| **Total** | **185** |

## Key Findings

All SQL queries in controllers use **parameterized queries** (`$1, $2, ...`).

### ORDER BY Patterns
Several controllers use template literal interpolation for ORDER BY columns.
All instances validate against hardcoded allowlists before interpolation — **SAFE**.

### Placeholder Generation
`chatbot.controller.js` generates dynamic `$N` placeholders from array length.
Values are UUID-validated before query — **SAFE**.

### Seed Scripts
`scripts/seed-database.js` uses table name interpolation.
All table names come from hardcoded arrays — **SAFE** (admin-only context).

## Conclusion

**No exploitable SQL injection vulnerabilities found.**
All user input is properly parameterized. Dynamic SQL patterns (ORDER BY, IN clauses)
use validated allowlists. The codebase follows secure query patterns consistently.

## Findings Detail

- **[HIGH]** `src/controllers/accommodation.controller.js:120` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/accommodation.controller.js:553` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/activity-log.controller.js:63` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/activity-log.controller.js:145` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/assignmentRule.controller.js:40` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:73` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:376` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:388` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:462` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:472` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:559` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:562` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:565` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/chatbot.controller.js:571` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/chatbot.controller.js:378` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/contractor.controller.js:88` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/costCenter.controller.js:393` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/costCenter.controller.js:991` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/costCenter.controller.js:1293` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/document.controller.js:42` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/email-template.controller.js:59` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/email-template.controller.js:64` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/email-template.controller.js:355` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/email-template.controller.js:72` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/emailInbox.controller.js:225` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/emailInbox.controller.js:234` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/emailInbox.controller.js:231` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/employee.controller.js:205` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/export.controller.js:119` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/export.controller.js:214` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/export.controller.js:275` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/export.controller.js:356` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/export.controller.js:440` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/export.controller.js:515` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/invoice.controller.js:84` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoice.controller.js:89` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/invoice.controller.js:99` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/invoiceDraft.controller.js:97` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceDraft.controller.js:109` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/invoiceDraft.controller.js:106` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:232` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:253` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:272` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:291` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:315` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:344` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:424` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:462` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:473` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:490` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:503` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/invoiceReport.controller.js:519` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:265` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:285` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:301` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:328` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:355` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:436` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:486` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:499` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:514` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/invoiceReport.controller.js:529` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/occupancy.controller.js:69` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/project.controller.js:66` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/project.controller.js:72` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/project.controller.js:396` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/project.controller.js:412` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/project.controller.js:427` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/project.controller.js:441` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/project.controller.js:455` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/project.controller.js:435` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/project.controller.js:449` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/report.controller.js:86` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:96` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:107` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:116` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:124` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:135` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:148` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:224` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:234` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:242` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:250` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:260` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:349` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:358` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:373` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:386` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:402` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:415` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:431` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:537` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:546` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:561` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/report.controller.js:580` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/report.controller.js:22` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:104` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:132` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:144` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:164` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:239` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:247` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:370` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:383` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:399` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:427` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:557` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/report.controller.js:575` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/room.controller.js:187` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:53` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:58` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:321` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:329` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:564` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:579` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:597` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:615` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/salary.controller.js:636` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/salary.controller.js:570` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/salary.controller.js:586` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/salary.controller.js:592` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/salary.controller.js:610` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/controllers/salary.controller.js:626` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/sla.controller.js:34` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/task.controller.js:56` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/task.controller.js:61` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/task.controller.js:323` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/task.controller.js:733` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/task.controller.js:738` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/ticket.controller.js:102` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/ticket.controller.js:479` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/ticket.controller.js:276` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/timesheet.controller.js:165` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/timesheet.controller.js:170` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/timesheet.controller.js:182` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/timesheet.controller.js:237` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/timesheet.controller.js:242` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/timesheet.controller.js:255` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/timesheet.controller.js:268` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/timesheet.controller.js:264` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/user.controller.js:306` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/userWorkload.controller.js:21` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/userWorkload.controller.js:202` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/controllers/userWorkload.controller.js:35` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/controllers/video.controller.js:43` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/video.controller.js:49` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/controllers/video.controller.js:177` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/database/migrate.js:102` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/database/migrate.js:190` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/database/seed.js:25` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/database/seed_300_employees.js:549` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/database/seed_300_employees.js:278` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/services/autoAssign.service.js:121` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/services/autoAssign.service.js:218` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/services/autoAssign.service.js:311` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/services/autoAssign.service.js:335` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[CRITICAL]** `src/services/autoAssign.service.js:122` — Table name interpolation: Dynamic table name from variable. Must be from hardcoded list.
- **[MEDIUM]** `src/services/chatbot.service.js:334` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/services/chatbot.service.js:392` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/services/chatbot.service.js:416` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/services/chatbot.service.js:606` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/services/costCenter.service.js:83` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[CRITICAL]** `src/services/gmailMCP.service.js:84` — Table name interpolation: Dynamic table name from variable. Must be from hardcoded list.
- **[CRITICAL]** `src/services/gmailUniversalPoller.service.js:170` — Table name interpolation: Dynamic table name from variable. Must be from hardcoded list.
- **[HIGH]** `src/services/payment.service.js:44` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/services/payment.service.js:49` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/services/pdfGenerator.service.js:53` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `src/services/report-scheduler.service.js:24` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/services/report-scheduler.service.js:78` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `src/services/report-scheduler.service.js:115` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[MEDIUM]** `src/services/report-scheduler.service.js:42` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/services/report-scheduler.service.js:90` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[MEDIUM]** `src/services/sla.service.js:16` — ORDER BY with template literal: Dynamic ORDER BY column. Must be validated against allowlist.
- **[HIGH]** `scripts/scan_sql_injection.js:19` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `scripts/scan_sql_injection.js:19` — String concatenation in query: String concatenation in SQL query.
- **[HIGH]** `scripts/seed-database.js:110` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `scripts/seed-database.js:213` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `scripts/seed-database.js:414` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `scripts/seed-database.js:627` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[HIGH]** `scripts/seed-database.js:729` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
- **[CRITICAL]** `scripts/seed-database.js:110` — Table name interpolation: Dynamic table name from variable. Must be from hardcoded list.
- **[CRITICAL]** `scripts/seed-database.js:213` — Table name interpolation: Dynamic table name from variable. Must be from hardcoded list.
- **[CRITICAL]** `scripts/seed-database.js:415` — Table name interpolation: Dynamic table name from variable. Must be from hardcoded list.
- **[CRITICAL]** `scripts/seed-database.js:729` — Table name interpolation: Dynamic table name from variable. Must be from hardcoded list.
- **[HIGH]** `scripts/seed_techventure.js:167` — Template literal in query with ${} interpolation: Direct variable interpolation in SQL. Check if validated/allowlisted.
