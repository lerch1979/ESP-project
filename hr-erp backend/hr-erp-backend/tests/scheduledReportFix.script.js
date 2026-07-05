/**
 * Regression: scheduled-report fix (run against the SANDBOX DB).
 *  - cost_centers report type now generates (was "Unknown report type").
 *  - the output is STORED (file_path set + file on disk) — retrievable in admin.
 *  - delivery is TRUTHFUL: with SMTP unconfigured, delivered_count=0 and the
 *    run records a delivery error (no more silent "success" that never sent).
 *  - an unknown report type fails LOUDLY (status='failed' + error_message).
 *
 *   DB_NAME=hr_erp_sandbox node tests/scheduledReportFix.script.js
 */
require('dotenv').config();
// Deterministically reproduce the prod state (SMTP unconfigured → "Missing
// credentials for PLAIN") so the delivery-truth path is tested regardless of
// whatever local SMTP env happens to be set. Must run BEFORE requiring the
// services (the nodemailer transporter is built at emailService require-time).
for (const k of ['SMTP_USER','SMTP_PASS','EMAIL_USER','EMAIL_PASSWORD']) delete process.env[k];
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/database/connection');
const { executeReport } = require('../src/services/report-scheduler.service');
const storage = require('../src/services/storage.service');

if (!/sandbox/i.test(process.env.DB_NAME || '')) { console.error('Run against the sandbox: DB_NAME=hr_erp_sandbox'); process.exit(1); }

let failures = 0;
const check = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const one = async (s, p) => (await pool.query(s, p)).rows[0];

(async () => {
  const ids = [];
  const mkReport = async (name, type, recipients) => {
    const r = await one(
      `INSERT INTO scheduled_reports (name, report_type, schedule_type, recipients, is_active)
       VALUES ($1,$2,'monthly',$3,true) RETURNING *`, [name, type, recipients]);
    ids.push(r.id); return r;
  };
  const lastRun = (reportId) => one(
    `SELECT status, records_count, delivered_count, recipients_count, file_path, error_message
       FROM scheduled_report_runs WHERE scheduled_report_id=$1 ORDER BY started_at DESC LIMIT 1`, [reportId]);

  try {
    // 1) cost_centers report (the one that failed) — now generates from accommodation_expenses.
    const cost = await mkReport('SBX Havi költséghely összesítő', 'cost_centers', ['admin@sandbox.local']);
    await executeReport(cost);
    let run = await lastRun(cost.id);
    check('cost_centers run status = success (was "Unknown report type")', run.status === 'success');
    check('cost report has records (from accommodation_expenses)', run.records_count >= 1);
    check('output STORED — file_path set', !!run.file_path);
    check('output file actually exists on disk', run.file_path && fs.existsSync(path.join(storage.UPLOAD_ROOT, run.file_path)));

    // 2) delivery truth — SMTP unconfigured in the sandbox → 0 delivered, error recorded (not silent).
    check('recipients_count = 1', run.recipients_count === 1);
    check('delivered_count = 0 (SMTP unconfigured) — not silently claimed', run.delivered_count === 0);
    check('delivery failure RECORDED in error_message (loud)', /Kézbesítés: 0\/1/.test(run.error_message || ''));

    // 3) a report with NO recipients: generates + stores, no delivery error.
    const noRecip = await mkReport('SBX no-recipient', 'occupancy', []);
    await executeReport(noRecip);
    run = await lastRun(noRecip.id);
    check('no-recipient report success + stored, no delivery error', run.status === 'success' && run.file_path && !run.error_message);

    // 4) unknown report type → fails LOUDLY.
    const bad = await mkReport('SBX bad type', 'nonexistent_type', ['x@sandbox.local']);
    await executeReport(bad);
    run = await lastRun(bad.id);
    check('unknown type → status=failed', run.status === 'failed');
    check('unknown type → error_message set', /Unknown report type/.test(run.error_message || ''));
  } finally {
    for (const id of ids) {
      await pool.query('DELETE FROM scheduled_report_runs WHERE scheduled_report_id=$1', [id]).catch(()=>{});
      await pool.query('DELETE FROM scheduled_reports WHERE id=$1', [id]).catch(()=>{});
    }
    // clean any stored test report files
    try { for (const f of fs.readdirSync(path.join(storage.UPLOAD_ROOT, 'reports'))) { /* leave real ones; test runs use their runId */ } } catch {}
    await pool.end();
  }
  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
