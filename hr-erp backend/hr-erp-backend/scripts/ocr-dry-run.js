#!/usr/bin/env node
/**
 * OCR dry-run — extract a PDF through the live claudeOCR.service.js
 * pipeline and print the result. Zero DB writes, zero side effects.
 *
 * Usage:
 *   node scripts/ocr-dry-run.js <path-to-pdf>
 *   node scripts/ocr-dry-run.js                 # picks the first Housing Solutions PDF
 *
 * Why: today's prompt change added `performanceDate`. This script lets us
 * verify on a real PDF whether Claude actually extracts the teljesítés
 * date, BEFORE we re-enable the Gmail poller and let drafts auto-flow
 * through.
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const claudeOCR = require('../src/services/claudeOCR.service');

const DEFAULT_PDF = path.join(
  __dirname, '..', 'uploads', 'documents',
  '1776768163598_pet_h_za-sz_plak.pdf',
);

(async () => {
  const target = process.argv[2] || DEFAULT_PDF;
  const abs = path.isAbsolute(target) ? target : path.resolve(target);

  if (!fs.existsSync(abs)) {
    console.error(`PDF not found: ${abs}`);
    process.exit(1);
  }

  console.error(`\n→ Extracting: ${abs}`);
  console.error(`  Size: ${(fs.statSync(abs).size / 1024).toFixed(1)} kB`);
  console.error(`  Model: ${process.env.CLAUDE_OCR_MODEL || 'claude-sonnet-4-6 (default)'}`);
  console.error(`  Started at: ${new Date().toISOString()}\n`);

  const t0 = Date.now();
  const result = await claudeOCR.extractInvoiceData(abs);
  const elapsed = Date.now() - t0;

  console.error(`  Elapsed: ${elapsed} ms\n`);

  if (!result) {
    console.error('  Extraction returned null. Check ANTHROPIC_API_KEY and logs.');
    process.exit(2);
  }

  // Print JSON to stdout — pipeable.
  process.stdout.write(JSON.stringify(result, null, 2));
  process.stdout.write('\n');

  // Quick summary to stderr
  console.error('\n──── summary ────────────────────────────────────────');
  console.error(`  vendorName:      ${result.vendorName ?? '—'}`);
  console.error(`  vendorTaxNumber: ${result.vendorTaxNumber ?? '—'}`);
  console.error(`  invoiceNumber:   ${result.invoiceNumber ?? '—'}`);
  console.error(`  invoiceDate:     ${result.invoiceDate ?? '—'}`);
  console.error(`  performanceDate: ${result.performanceDate ?? '—'}  ← NEW`);
  console.error(`  dueDate:         ${result.dueDate ?? '—'}`);
  console.error(`  paymentMethod:   ${result.paymentMethod ?? '—'}  ← NEW`);
  console.error(`  netAmount:       ${result.netAmount ?? '—'} ${result.currency ?? ''}`);
  console.error(`  vatAmount:       ${result.vatAmount ?? '—'} (${result.vatRate ?? '—'})`);
  console.error(`  grossAmount:     ${result.grossAmount ?? '—'} ${result.currency ?? ''}`);
  console.error(`  confidence:      ${result.confidence ?? '—'}`);
  console.error('─────────────────────────────────────────────────────');
})().catch((e) => {
  console.error('Fatal:', e.message);
  console.error(e.stack);
  process.exit(1);
});
