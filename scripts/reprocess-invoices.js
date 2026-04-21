#!/usr/bin/env node
/**
 * Re-extract invoice data for email_inbox rows that are missing amounts.
 *
 * Finds rows where:
 *   - document_type = 'invoice'
 *   - extracted_data->>'grossAmount' IS NULL (or similar key absences)
 *   - attachment_path points to a file that still exists on disk
 *
 * For each match:
 *   - Re-runs claudeOCR.extractInvoiceData(filePath) with the new Claude path
 *   - UPDATEs email_inbox.extracted_data with the result
 *   - Does NOT re-classify or re-route — only refreshes the structured data
 *
 * Usage (from repo root):
 *   cd "hr-erp backend/hr-erp-backend"
 *   node ../../scripts/reprocess-invoices.js                # process all missing
 *   node ../../scripts/reprocess-invoices.js --limit 1      # one at a time
 *   node ../../scripts/reprocess-invoices.js --dry-run      # show what would change
 *   node ../../scripts/reprocess-invoices.js --id <uuid>    # single row
 */

const path = require('path');

// Resolve modules from the backend (script lives outside backend/)
const BACKEND_ROOT = path.resolve(__dirname, '..', 'hr-erp backend', 'hr-erp-backend');
const BACKEND_MODULES = path.join(BACKEND_ROOT, 'node_modules');

// Point require() at backend's node_modules
require('module').Module._nodeModulePaths = (function (original) {
  return function (from) {
    return [BACKEND_MODULES, ...original.call(this, from)];
  };
})(require('module').Module._nodeModulePaths);

// Load backend dotenv so ANTHROPIC_API_KEY etc. are available
require(path.join(BACKEND_MODULES, 'dotenv')).config({ path: path.join(BACKEND_ROOT, '.env') });

const { query } = require(path.join(BACKEND_ROOT, 'src/database/connection'));
const claudeOCR = require(path.join(BACKEND_ROOT, 'src/services/claudeOCR.service'));
const { extractInvoiceColumns } = require(path.join(BACKEND_ROOT, 'src/controllers/emailInbox.controller'));

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const LIMIT = (() => {
  const i = argv.indexOf('--limit');
  return i >= 0 ? parseInt(argv[i + 1], 10) : null;
})();
const SINGLE_ID = (() => {
  const i = argv.indexOf('--id');
  return i >= 0 ? argv[i + 1] : null;
})();

function truncate(s, n = 60) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function findCandidates() {
  if (SINGLE_ID) {
    const res = await query(
      `SELECT id, email_subject, attachment_path, attachment_filename, extracted_data
       FROM email_inbox WHERE id = $1`,
      [SINGLE_ID]
    );
    return res.rows;
  }

  const limitClause = LIMIT ? `LIMIT ${LIMIT}` : '';
  const res = await query(
    `SELECT id, email_subject, attachment_path, attachment_filename, extracted_data
     FROM email_inbox
     WHERE document_type = 'invoice'
       AND attachment_path IS NOT NULL
       AND (
         extracted_data IS NULL
         OR extracted_data->>'grossAmount' IS NULL
         OR extracted_data->>'netAmount' IS NULL
       )
     ORDER BY created_at DESC
     ${limitClause}`
  );
  return res.rows;
}

async function reprocessOne(row) {
  const absolutePath = path.isAbsolute(row.attachment_path)
    ? row.attachment_path
    : path.join(BACKEND_ROOT, row.attachment_path);

  const fs = require('fs');
  if (!fs.existsSync(absolutePath)) {
    return { status: 'FILE_MISSING', path: absolutePath };
  }

  const result = await claudeOCR.extractInvoiceData(absolutePath);
  if (!result) {
    return { status: 'EXTRACTION_EMPTY' };
  }

  // Preserve any fields that were already populated by the old run
  const merged = { ...(row.extracted_data || {}), ...result };

  if (DRY_RUN) {
    return { status: 'DRY_RUN', before: row.extracted_data, after: merged };
  }

  const c = extractInvoiceColumns(merged);
  await query(
    `UPDATE email_inbox SET
       extracted_data = $1,
       invoice_number = COALESCE($2, invoice_number),
       invoice_date   = COALESCE($3, invoice_date),
       due_date       = COALESCE($4, due_date),
       vendor_name    = COALESCE($5, vendor_name),
       vendor_tax_number = COALESCE($6, vendor_tax_number),
       net_amount     = COALESCE($7, net_amount),
       vat_amount     = COALESCE($8, vat_amount),
       gross_amount   = COALESCE($9, gross_amount),
       currency       = COALESCE($10, currency),
       updated_at     = NOW()
     WHERE id = $11`,
    [JSON.stringify(merged), c.invoice_number, c.invoice_date, c.due_date,
     c.vendor_name, c.vendor_tax_number, c.net_amount, c.vat_amount, c.gross_amount,
     c.currency, row.id]
  );
  return { status: 'UPDATED', after: merged };
}

async function main() {
  console.log('\n================================================================');
  console.log('  Invoice re-extraction' + (DRY_RUN ? ' (DRY RUN — no writes)' : ''));
  console.log('================================================================\n');

  const candidates = await findCandidates();
  console.log(`  Candidates: ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log('  Nothing to do.\n');
    process.exit(0);
  }

  let updated = 0, empty = 0, missing = 0;

  for (const row of candidates) {
    const subj = truncate(row.email_subject, 60);
    console.log(`  ● ${row.id.slice(0, 8)}  ${subj}`);
    console.log(`     file: ${row.attachment_filename || '?'}`);

    try {
      const result = await reprocessOne(row);
      if (result.status === 'UPDATED') {
        updated++;
        const a = result.after;
        console.log(`     ✅ ${a.vendorName || '?'} — ${a.grossAmount ?? '?'} ${a.currency || ''} — #${a.invoiceNumber || '?'}`);
      } else if (result.status === 'DRY_RUN') {
        const a = result.after;
        console.log(`     [dry] would set: ${a.vendorName || '?'} — ${a.grossAmount ?? '?'} ${a.currency || ''} — #${a.invoiceNumber || '?'}`);
      } else if (result.status === 'FILE_MISSING') {
        missing++;
        console.log(`     ❌ file missing: ${result.path}`);
      } else {
        empty++;
        console.log(`     ⚠️  extraction returned empty`);
      }
    } catch (err) {
      console.log(`     ❌ error: ${err.message}`);
      empty++;
    }
    console.log('');
  }

  console.log('================================================================');
  console.log(`  Summary: ${updated} updated · ${empty} empty · ${missing} file-missing`);
  console.log('================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Script error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
