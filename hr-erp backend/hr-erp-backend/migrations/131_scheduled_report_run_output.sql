-- 131: store the generated report file + true delivery count per run, so outputs
-- are retrievable from the admin (email delivery is flaky) and "success" reflects
-- whether emails actually went out — not just that the job didn't throw.
ALTER TABLE scheduled_report_runs
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS delivered_count INTEGER DEFAULT 0;
