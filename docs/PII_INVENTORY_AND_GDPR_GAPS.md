# PII Inventory & GDPR Erasure Gap List (Task 1)

**Date:** 2026-07-04 · **Method:** live schema introspection (every column matching name/email/phone/signature/salary/photo/health patterns) + a full code trace of the single erasure engine (`gdprAnonymization.service.js`). Founds the #5 fix (Task 2).

**One erasure engine exists:** `services/gdprAnonymization.service.js` (+ controller/route + an 08:00 propose-only reminder cron). No other code path deletes/anonymizes person data. Lifecycle is propose-only: cron notifies → superadmin `POST /preview` (dry-run) → `POST /execute` (`confirm:true`, irreversible). DB portion is one atomic transaction; **file unlinks happen after commit, outside the txn.**

---

## A. PII INVENTORY (where personal data lives)

### Core identity — `employees` (crown jewels; some field-encrypted via `pii_encrypted`+`encryption_key_version`)
`first_name, last_name, gender, birth_date, birth_place, mothers_name, marital_status, nationality, tax_id, passport_number, social_security_number, bank_account, visa_expiry, permanent_address_{zip,country,county,city,street,number}, personal_email, personal_phone, company_email, company_phone, company_name, room_number, profile_photo_url`. Anonymization marker: `anonymized_at`.

### Auth — `users`
`email, first_name, last_name, phone, password_hash` (+ `encryption_key_version`).

### Financial / salary
`employee_salaries` (gross_salary, net_salary, notes), `compensations` (responsible_name/email/phone, notes), `compensation_residents` (resident_name/email/phone, salary_deduction_*, **signature_data**, notes), `salary_deductions` (employee_name), `damage_reports.employee_salary`.

### Biometric / signatures (Art-9-adjacent)
`damage_reports.employee_signature_data`, `.manager_signature_data`, `.witness_signature_data` (+ dates, `witness_name`); `compensation_residents.signature_data`.

### Health / wellbeing (Art-9 special category)
`wellmind_*` (assessments, pulse_surveys, coaching_sessions, interventions, ml_predictions), `wellbeing_sentiment_analysis`, `wellbeing_feedback/points/streaks/referrals/notifications`, `carepath_cases` (issue_description, resolution_notes), `carepath_provider_bookings` (employee_notes), `carepath_sessions.session_notes_encrypted`, `medical_appointments`, `pulse_question_history`, `user_nlp_consent`.

### Free-text authored by the person
`ticket_messages.message`, `ticket_comments`, `chatbot_messages.content`/`translated_content`, `employee_notes.content`, `ai_assistant_messages.user_message`, `email_assistant_interactions.email_body/email_from`.

### Contact / operational
`contractors` (name/email/phone/address), `carepath_providers` (full_name/email/phone/address/photo_url), `notifications`, `user_push_tokens` (expo_push_token, device_name), slack identity mapping, `activity_logs.ip_address` + JSONB `changes`/`metadata` (embed PII), `translation_cache.source_text/translated_text` (caches the person's message text).

### Files (local disk `uploads/`, + generated + backups)
`uploads/{documents, employee-documents, employees (profile photos), expenses, inspections, invoices, tasks, tickets, accountant(_packages), orphans}`; generated **damage-report PDFs** (`damageReportPdf.service.js`); **accountant ZIPs**; the **daily backups** (`db-*.dump` + `uploads-*.tgz`) contain pre-erasure PII.

---

## B. GAP LIST — what erasure REACHES vs MISSES

### ✅ REACHED (works today, atomically)
- `employees` — pseudonymize last_name → `TÖRÖLT-<id8>`, null ~25 PII fields, stamp `anonymized_at`.
- `users` — deactivate, email → `torolt-<id8>@anonymized.invalid`, password_hash → random, name → pseudonym.
- Health/wellbeing set — **hard DELETE** of 17 wellbeing/carepath tables + `medical_appointments`.
- Financial denormalized names — `compensations`/`compensation_residents`/`salary_deductions` names → pseudonym, contacts + `compensation_residents.signature_data` nulled.
- `notifications` — deleted.
- `employee_documents` — non-statutory rows deleted + their files unlinked (statutory KEPT by design).
- `employees.profile_photo_url` file — unlinked.

### 🔴 MISSED — PII that survives erasure
| # | Area | What survives | Severity |
|---|---|---|---|
| G1 | **damage_reports** | `employee_signature_data` (BIOMETRIC), `manager/witness_signature_data`, `employee_salary` snapshot, `photo_urls` (files), `witness_name`, `notes`, `description` — table never touched | **CRITICAL** (biometric + salary) |
| G2 | **damage-report PDFs** | rendered PDFs on disk (contain name/salary/signature) never enumerated/unlinked | **CRITICAL** |
| G3 | **Uploaded files** (except employee-docs/profile) | `uploads/{tickets, tasks, inspections, expenses, accountant}` files the person uploaded/about them — never deleted | **HIGH** |
| G4 | **ticket_attachments** | rows + files under `uploads/tickets/…` — only `uploaded_by` name cascades | **HIGH** |
| G5 | **chatbot_messages.content** | verbatim free text; `chatbot_messages` has NO user FK (sender_type only) so nothing cascades — content stays keyed to `conversation.user_id` | **HIGH** |
| G6 | **ticket_messages / ticket_comments free text** | the message BODY the person wrote stays verbatim (KEEP-intact was authorship-only) | **MEDIUM (policy)** |
| G7 | **activity_logs** | JSONB `changes`/`metadata` embed old PII values; `ip_address` — explicitly deferred to "v2" | **HIGH** |
| G8 | **translation_cache** | `source_text`/`translated_text` cache the person's ticket-message text — deferred to "v2" | **MEDIUM** |
| G9 | **user_push_tokens** | expo token + device name, keyed by user_id — never touched | **MEDIUM** |
| G10 | **slack identity mapping** | user↔slack-id row survives (only `slack_checkin_messages` deleted) | **MEDIUM** |
| G11 | **non-wellbeing gamification** | point-ledger/leaderboard tables (mig 069) not in HEALTH_DELETE | **LOW-MED** |
| G12 | **employee_notes** | `content` free text keyed to employee — never touched | **MEDIUM** |
| G13 | **backups** | pre-erasure PII in `db-*.dump` + `uploads-*.tgz`; `backup_retention_days` config knob exists but **nothing reads it** — no aging logic | **MEDIUM** (GDPR "ages-out" accepted IF retention actually enforced) |
| G14 | **no-user_id employees** | if `user_id` is null, every user_id-keyed step is skipped → those rows survive | **MEDIUM** |

### ⚙️ MECHANISM BUGS (the "lies success" core of #5)
- **M1 — Reports success while files survive.** Failed `storage.delete` is caught + only `logger.error`'d; `anonymizeEmployee` still returns `{ok:true}`; controller returns `success:true`. SPA shows green. (`service:281-286` → `controller:64`) **CRITICAL**
- **M2 — TOCTOU orphans files.** `filesToDelete` computed by `buildPlan` BEFORE the txn; a document inserted between plan and commit has its row DELETEd but its file never enumerated → orphaned forever. (`service:196` vs `214-276`) **HIGH**
- **M3 — safeExec swallows schema drift.** Every step except employees/employee_documents swallows `42P01`/`42703` (undefined table/column) → a renamed table becomes a silent no-op, PII survives, no error. (`service:67-70`) **HIGH**
- **M4 — Audit log understates.** `summaryOf` records the PLANNED `files_to_delete` count, not actual `filesDeleted`. (`service:297`) **MEDIUM**
- **M5 — No erasure receipt.** `anonymization_log` stores counts, but there's no per-run itemized receipt of what was reached (tables touched, rows affected, files deleted vs failed). **MEDIUM**

---

## C. Disposition decisions (policy — needed before Task 2 build)
1. **Ticket/chatbot free-text content (G5/G6):** scrub the message BODIES the person wrote, or keep (operational history, authorship-only)? Biometric/health is clear-delete; free-text prose is a judgment call. *Recommend: scrub content, keep the row skeleton.*
2. **activity_logs (G7):** scrub JSONB PII + null ip_address for the person, or accept the documented "v2 deferral"? *Recommend: at minimum null ip_address + redact known PII keys in the person's own rows.*
3. **Backups (G13):** wire `backup_retention_days` to actually age out dumps containing the person, or document reliance on the existing 30-day retention as the "ages-out" guarantee? *Recommend: document + verify retention enforces it (it does — `backup.sh` deletes >30d); no per-person backup edit.*

Everything else (G1-G4, G9-G12, G14, M1-M5) is unambiguous — should be fixed to reach the data and fail loudly.
