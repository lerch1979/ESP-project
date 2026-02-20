-- ============================================================
-- Scheduled Reports (Ütemezett Riportok)
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  report_type VARCHAR(50) NOT NULL,  -- employees, accommodations, tickets, contractors, occupancy
  schedule_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly
  schedule_time TIME NOT NULL DEFAULT '08:00',
  day_of_week INTEGER,               -- 0=Sunday .. 6=Saturday (for weekly)
  day_of_month INTEGER,              -- 1-31 (for monthly)
  recipients TEXT[] NOT NULL DEFAULT '{}',
  filters JSONB DEFAULT '[]',
  format VARCHAR(10) NOT NULL DEFAULT 'excel',
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_report_runs (
  id SERIAL PRIMARY KEY,
  scheduled_report_id INTEGER NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'running',  -- running, success, failed
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_count INTEGER DEFAULT 0,
  file_size INTEGER DEFAULT 0,
  recipients_count INTEGER DEFAULT 0,
  error_message TEXT
);

-- Index for the scheduler query: find due active reports
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run
  ON scheduled_reports (next_run_at)
  WHERE is_active = true;

-- Index for run history lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_report_runs_started
  ON scheduled_report_runs (scheduled_report_id, started_at DESC);
