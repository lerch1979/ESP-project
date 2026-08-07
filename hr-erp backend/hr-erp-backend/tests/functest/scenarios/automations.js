/**
 * AUTOMATIONS — the scheduled/cron paths, driven directly so nothing waits on a clock.
 *
 * These call the same functions the crons call (`executeReport`, `recordDailySnapshot`,
 * `calculateMonthlyBilling`), so a break here is a break in production's nightly work.
 *
* AUTO-02 and AUTO-05 force failures and prove they are LOUD: before 2026-07-05 a scheduled report
 * could fail (or silently deliver nothing) and still be recorded as a success.
 */
module.exports = {
  area: 'AUTOMATIONS',
  title: 'scheduled report run + storage · alertOps on failure · billing draft · snapshot cron',

  async setup(ctx) {
    const scheduler = require('../../../src/services/report-scheduler.service');
    const storage = require('../../../src/services/storage.service');
    const { logger } = require('../../../src/utils/logger');

    const created = [];
    const mkReport = async (name, type, recipients) => {
      const r = (await ctx.query(
        `INSERT INTO scheduled_reports (name, report_type, schedule_type, recipients, is_active)
         VALUES ($1,$2,'monthly',$3,true) RETURNING *`, [`${ctx.tag} ${name}`, type, recipients])).rows[0];
      created.push(r.id);
      return r;
    };
    const lastRun = async (id) => (await ctx.query(
      `SELECT status, records_count, delivered_count, recipients_count, file_path, error_message
         FROM scheduled_report_runs WHERE scheduled_report_id=$1 ORDER BY started_at DESC LIMIT 1`, [id])).rows[0];

    return { scheduler, storage, logger, mkReport, lastRun, created };
  },

  cases: [
    {
      id: 'AUTO-01',
      name: 'scheduled report run — generates, STORES the xlsx, and accounts for delivery truthfully',
      expected: { status: 'success', has_records: true, file_path_set: true, file_on_disk: true,
                  recipients_count: 1, delivery_accounting_honest: true },
      hint: 'the 2026-07-05 fix: output is ALWAYS stored + downloadable, and a shortfall in delivery is recorded rather than reported as success',
      run: async (ctx, st) => {
        const fs = require('fs'); const path = require('path');
        const rep = await st.mkReport('Havi kihasználtság', 'occupancy', ['admin@sandbox.local']);
        await st.scheduler.executeReport(rep);
        const run = await st.lastRun(rep.id);
        // Environment-independent invariant: delivered never exceeds recipients, and a
        // shortfall is ALWAYS written to error_message (the old bug was a silent success).
        const short = run.delivered_count < run.recipients_count;
        return {
          status: run.status, has_records: run.records_count > 0, file_path_set: !!run.file_path,
          file_on_disk: !!run.file_path && fs.existsSync(path.join(st.storage.UPLOAD_ROOT, run.file_path)),
          recipients_count: run.recipients_count,
          delivery_accounting_honest: run.delivered_count <= run.recipients_count && (short === /Kézbesítés: \d+\/\d+/.test(run.error_message || '')),
          _delivered: run.delivered_count, _error: run.error_message,
        };
      },
    },
    {
      id: 'AUTO-02',
      name: 'FORCED delivery failure — 0/1 recorded on the run and an ops alert raised (never a silent success)',
      expected: { status: 'success', delivered_count: 0, error_recorded: /Kézbesítés: 0\/1/, ops_alert_emitted: true, file_still_stored: true },
      hint: 'stubs utils/emailService.sendEmail to fail, so this is deterministic regardless of local SMTP config',
      run: async (ctx, st) => {
        const fs = require('fs'); const path = require('path');
        // report-scheduler destructures sendEmail at require-time, so the stub has to be
        // installed BEFORE the module is (re)loaded — drop both from the cache and rebuild.
        const emailPath = require.resolve('../../../src/utils/emailService');
        const schedPath = require.resolve('../../../src/services/report-scheduler.service');
        require(emailPath);
        const realSend = require.cache[emailPath].exports.sendEmail;
        require.cache[emailPath].exports.sendEmail = async () => ({ success: false, error: 'FUNCTEST forced delivery failure' });
        delete require.cache[schedPath];
        const patched = require(schedPath);

        const captured = [];
        const orig = st.logger.error;
        st.logger.error = (...a) => { captured.push(a.map(String).join(' ')); return orig.apply(st.logger, a); };
        let run;
        try {
          const rep = await st.mkReport('Kézbesítési hiba', 'occupancy', ['nobody@functest.local']);
          await patched.executeReport(rep);
          run = await st.lastRun(rep.id);
        } finally {
          st.logger.error = orig;
          require.cache[emailPath].exports.sendEmail = realSend;
          delete require.cache[schedPath];
          require(schedPath); // restore the unpatched module for anything later
        }
        return {
          status: run.status, delivered_count: run.delivered_count, error_recorded: run.error_message || '',
          ops_alert_emitted: captured.some((m) => m.includes('[ops-alert]') && m.includes('Kézbesítési hiba')),
          file_still_stored: !!run.file_path && fs.existsSync(path.join(st.storage.UPLOAD_ROOT, run.file_path)),
        };
      },
    },
    {
      id: 'AUTO-03',
      name: 'every configured report type executes and stores an output',
      expected: { failed_types: [], stored: 6 },
      run: async (ctx, st) => {
        const fs = require('fs'); const path = require('path');
        const failed = []; let stored = 0;
        for (const type of Object.keys(st.scheduler.DATA_GENERATORS)) {
          const rep = await st.mkReport(`Típus ${type}`, type, []);
          await st.scheduler.executeReport(rep);
          const run = await st.lastRun(rep.id);
          if (run.status !== 'success') failed.push(`${type}: ${run.status} ${run.error_message || ''}`);
          if (run.file_path && fs.existsSync(path.join(st.storage.UPLOAD_ROOT, run.file_path))) stored++;
        }
        return { failed_types: failed, stored };
      },
    },
    {
      id: 'AUTO-04',
      name: 'an unknown report type fails LOUDLY (status=failed + error_message), never silently',
      expected: { status: 'failed', error: /Unknown report type/ },
      run: async (ctx, st) => {
        const rep = await st.mkReport('Nem létező típus', 'ft_nonexistent_type', ['x@sandbox.local']);
        await st.scheduler.executeReport(rep);
        const run = await st.lastRun(rep.id);
        return { status: run.status, error: run.error_message || '' };
      },
    },
    {
      id: 'AUTO-05',
      name: 'alertOps fires on a forced failure (ops alert emitted, job does not crash)',
      expected: { ops_alert_emitted: true, mentions_report_name: true, threw: false },
      hint: 'utils/opsAlert.js always logs [ops-alert]; the Slack POST only happens when OPS_ALERT_WEBHOOK is set',
      run: async (ctx, st) => {
        const captured = [];
        const orig = st.logger.error;
        st.logger.error = (...a) => { captured.push(a.map(String).join(' ')); return orig.apply(st.logger, a); };
        let threw = false;
        try {
          const rep = await st.mkReport('Kényszerített hiba', 'ft_forced_failure', ['x@sandbox.local']);
          await st.scheduler.executeReport(rep);
        } catch { threw = true; }
        finally { st.logger.error = orig; }
        const alerts = captured.filter((m) => m.includes('[ops-alert]'));
        return {
          ops_alert_emitted: alerts.length > 0,
          mentions_report_name: alerts.some((m) => m.includes('Kényszerített hiba')),
          threw,
          _alerts: alerts.slice(0, 2),
        };
      },
    },
    {
      id: 'AUTO-06',
      name: 'billing draft run — the expected invoice set, all rows in draft status on one run',
      expected: { billings: 19, all_draft: true, run_status: 'calculated', rows_match_summary: true },
      hint: '19 (accommodation × megbízó) groups; the invoicing-off client contributes none',
      run: async (ctx) => {
        const rows = (await ctx.query(
          `SELECT ab.status, ab.billing_run_id FROM accommodation_billings ab
             JOIN billing_runs br ON br.id = ab.billing_run_id
            WHERE ab.billing_month=$1 AND br.status <> 'cancelled'`, [ctx.month])).rows;
        const run = (await ctx.query(
          `SELECT status FROM billing_runs WHERE billing_month=$1 AND status <> 'cancelled'`, [ctx.month])).rows[0];
        return {
          billings: rows.length, all_draft: rows.every((r) => r.status === 'draft'),
          run_status: run?.status, rows_match_summary: rows.length === ctx.billing.billing_count,
        };
      },
    },
    {
      id: 'AUTO-07',
      name: 'daily occupancy snapshot cron — the expected number of employee-days for the month',
      expected: { rows: 14175 },
      hint: 'sum of every fixture site\'s (headcount × covered days); see tests/functest/fixture.js',
      run: async (ctx) => ({
        rows: (await ctx.query(
          `SELECT COUNT(*)::int c FROM occupancy_snapshots WHERE TO_CHAR(snapshot_date,'YYYY-MM')=$1`, [ctx.month])).rows[0].c,
      }),
    },
    {
      id: 'AUTO-08',
      name: 'snapshot cron is idempotent — re-running the whole month duplicates nothing',
      expected: { rows_unchanged: true, duplicate_keys: 0 },
      hint: 'ON CONFLICT (snapshot_date, employee_id) DO UPDATE — a re-run corrects, never duplicates',
      run: async (ctx) => {
        const before = (await ctx.query(
          `SELECT COUNT(*)::int c FROM occupancy_snapshots WHERE TO_CHAR(snapshot_date,'YYYY-MM')=$1`, [ctx.month])).rows[0].c;
        await ctx.fixture.snapshotMonth(ctx.occ);
        const after = (await ctx.query(
          `SELECT COUNT(*)::int c FROM occupancy_snapshots WHERE TO_CHAR(snapshot_date,'YYYY-MM')=$1`, [ctx.month])).rows[0].c;
        const dup = (await ctx.query(
          `SELECT COUNT(*)::int c FROM (
             SELECT snapshot_date, employee_id FROM occupancy_snapshots
              WHERE TO_CHAR(snapshot_date,'YYYY-MM')=$1
              GROUP BY 1,2 HAVING COUNT(*) > 1) d`, [ctx.month])).rows[0].c;
        return { rows_unchanged: before === after, duplicate_keys: dup };
      },
    },
  ],
};
