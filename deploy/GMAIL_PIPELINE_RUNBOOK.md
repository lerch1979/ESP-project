# Gmail invoice-OCR pipeline — runbook (re-auth · enable · pilot · verify)

The automated **cost-side** feed for the billing/margin model: supplier-invoice
emails → OCR → draft → human review → **`accommodation_expenses`** (the same table
the per-client margin calc reads). Revenue (nights × rate) is already automated;
this automates cost. Together → **true margin, automatically.**

- **Invoice inbox:** `housingsolutionsszamlazas@gmail.com` (dedicated; "szamlazas" = invoicing). Forward supplier invoices here.
- **Audience/flow:** poller (every 5 min, `is:unread`) → `claudeOCR.extractInvoiceData` (Claude, ~$0.01–0.02/page) → rule classifier (cost-center + confidence) → `invoice_drafts` → admin **Billing → Tab 2 "Beérkezett számlák"** → **Convert** → `expenseService.create()` → `INSERT INTO accommodation_expenses` (source `email_ocr`, PDF attached).
- **Human-in-the-loop:** only known vendors auto-classify; the rest land in `needs_review`. A human always **picks the accommodation** and confirms before Convert.

> ⚠️ **Use "Convert", NOT "Approve".** The legacy `approve()` endpoint (which wrote to
> the dormant `invoices` table) was retired 2026-06-21 → it now returns HTTP 410. Only
> **Convert** (`POST /invoice-drafts/:id/convert` → `accommodation_expenses`) is correct.

---

## A. Re-authenticate the Gmail token (fixes `invalid_grant`)
Google revokes refresh tokens on password change, ~6-month inactivity, or manual
revocation. Symptom: `Gmail universal poll error: invalid_grant — Token has been
expired or revoked` every 5 min in the logs.

Run **in your own Terminal** (interactive: browser sign-in + sudo for port 80):
```
cd "/Users/lerchbalazs/dev/HR-ERP-PROJECT/hr-erp backend/hr-erp-backend"
sudo node scripts/get-gmail-token.js          # sudo: GMAIL_REDIRECT_URI=http://localhost (port 80)
```
1. It prints a **Google consent URL** and listens on port 80.
2. Open the URL → **sign in as `housingsolutionsszamlazas@gmail.com`** (the invoicing account, NOT a personal one — whichever account you consent as becomes the polled inbox) → grant **gmail.modify + gmail.send**.
3. Browser redirects to `http://localhost/?code=…`; the script exchanges it, **prints `GMAIL_REFRESH_TOKEN=…`**, exits.
4. Copy the token value.

**No-sudo alternative:** add `http://localhost:8080` to the OAuth client's Authorized
redirect URIs in Google Cloud Console, set `GMAIL_REDIRECT_URI=http://localhost:8080`
in the local `.env`, then run `node scripts/get-gmail-token.js` (no sudo).

Prereqs (already present in the local `.env`): `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REDIRECT_URI`. Prod has `GMAIL_CLIENT_ID`/`SECRET` + `ANTHROPIC_API_KEY` (for OCR).

---

## B. Install the token + OAuth creds on prod + store the secrets
⚠️ **Prod `.env.production` needs the FULL Gmail set, not just the token.** When the
pipeline was first enabled (2026-06-21) prod had only `GMAIL_REFRESH_TOKEN` and the
poll returned **"Gmail not configured"** because `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`
/ `GMAIL_REDIRECT_URI` were missing (they had only ever lived in the laptop `.env`).
Required keys on prod: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`,
`GMAIL_REFRESH_TOKEN` (+ `ANTHROPIC_API_KEY` for OCR).

1. **Bitwarden:** save **all** of `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` /
   `GMAIL_REDIRECT_URI` / `GMAIL_REFRESH_TOKEN` in the "HR-ERP prod .env" item (the
   client creds were previously only on the laptop — DR risk).
2. **Server `.env.production`** — set/replace `GMAIL_REFRESH_TOKEN=`, and ensure the
   3 OAuth client vars are present:
   ```
   ssh deploy@167.233.122.3
   cd ~/hr-erp && nano .env.production
   # GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_REDIRECT_URI=http://localhost
   # GMAIL_REFRESH_TOKEN=<new>
   ```
   *(`.env.production` is read via `env_file` at container start — picked up on restart.
   sed: it's appended/parsed fresh, so a new inode is fine here, unlike the bind-mounted Caddyfile.)*

---

## C. Enable the poller
In `~/hr-erp/.env.production` set:
```
GMAIL_POLLING_ENABLED=true
```
Then restart the backend so it re-reads env + schedules the cron:
```
ssh deploy@167.233.122.3 'cd ~/hr-erp && docker compose -f docker-compose.prod.yml up -d backend'
```
Confirm in logs: `📧 Gmail universal polling started (every 5 min)` (not "held off").
The cron lives in `server.js` (gated on `GMAIL_POLLING_ENABLED===true && GMAIL_REFRESH_TOKEN`).

**Manual one-off poll (no waiting for the 5-min cron):**
`POST /api/v1/invoice-drafts/poll-emails` (admin, settings.edit).

---

## D. Pilot — one invoice end-to-end
1. **Forward ONE real supplier invoice** (e.g. a utility/gas bill) to `housingsolutionsszamlazas@gmail.com`.
2. Within ~5 min (or trigger the manual poll), it OCRs into an `invoice_drafts` row.
   Verify server-side:
   ```
   docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d hr_erp -c \
     "SELECT status, vendor_name, gross_amount, email_subject FROM invoice_drafts ORDER BY created_at DESC LIMIT 3;"
   ```
3. **Admin → Billing → Tab 2 "Beérkezett számlák":** open the draft, fix anything, **pick the accommodation + category**, click **Konvertálás (Convert)**.
4. **Confirm it landed in `accommodation_expenses`:**
   ```
   ...psql -c "SELECT accommodation_id, billing_month, category, amount, vendor_name, source
               FROM accommodation_expenses WHERE source='email_ocr' ORDER BY created_at DESC LIMIT 3;"
   ```
5. **Confirm it feeds margin:** run a billing/margin **draft** for that month
   (Finance → Számlázási díjak → Vázlat futtatása) — the expense shows in the
   accommodation's **cost** (rent + expenses) and reduces **margin**. Loop closed:
   revenue (nights×rate) − auto-ingested cost = true margin.

---

## E. Troubleshooting
| Symptom | Fix |
|---|---|
| `invalid_grant` every 5 min | Re-auth (section A) — token revoked/expired. |
| `EACCES` binding port 80 | Run the script with `sudo`, or use the port-8080 alternative. |
| OCR returns null | `ANTHROPIC_API_KEY` missing/invalid on prod. |
| Draft created but won't Convert | Pick an accommodation + category first; Convert requires them. |
| Reviewer clicked "Approve" → 410 | Expected — Approve is retired; use **Convert**. |
| Junk emails creating drafts | The cheap pre-filter rejects newsletters; tune `invoice_classification_rules` / keywords for noisy senders. |

## Disable / pause
Set `GMAIL_POLLING_ENABLED=false` (or remove it) in `.env.production` + restart backend.
Logs: `📧 Gmail universal polling held off`. Nothing is deleted; drafts already
converted stay in `accommodation_expenses`.
