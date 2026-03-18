-- Migration 065: Sick Leave Triggers & Correlation Analytics

BEGIN;

-- ── Create leave_requests table first ───────────────────────────────

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type VARCHAR(50) NOT NULL DEFAULT 'annual',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  start_date DATE NOT NULL,
  end_date DATE,
  reason TEXT,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_sick ON leave_requests(user_id, leave_type, status) WHERE leave_type = 'sick';

-- ── Sick Leave Correlation View (privacy: min 5) ────────────────────

CREATE OR REPLACE VIEW v_sick_leave_correlation AS
WITH sick_counts AS (
  SELECT
    user_id,
    contractor_id,
    COUNT(*) AS sick_count_90d,
    SUM(COALESCE(duration_days, 1)) AS total_sick_days
  FROM (
    SELECT lr.user_id, u.contractor_id,
      COALESCE(lr.end_date - lr.start_date + 1, 1) AS duration_days
    FROM leave_requests lr
    JOIN users u ON lr.user_id = u.id
    WHERE lr.leave_type = 'sick'
      AND lr.status = 'approved'
      AND lr.start_date >= CURRENT_DATE - 90
  ) sub
  GROUP BY user_id, contractor_id
)
SELECT
  wa.risk_level,
  sc.contractor_id,
  ROUND(AVG(sc.sick_count_90d)::numeric, 1) AS avg_sick_leaves,
  ROUND(AVG(sc.total_sick_days)::numeric, 1) AS avg_sick_days,
  COUNT(DISTINCT sc.user_id) AS employee_count
FROM sick_counts sc
LEFT JOIN LATERAL (
  SELECT risk_level FROM wellmind_assessments
  WHERE user_id = sc.user_id
  ORDER BY assessment_date DESC LIMIT 1
) wa ON TRUE
GROUP BY wa.risk_level, sc.contractor_id
HAVING COUNT(DISTINCT sc.user_id) >= 5;

COMMIT;
