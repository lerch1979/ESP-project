-- Migration 064: Overtime Analytics Views
-- Tracks overtime from timesheets and correlates with burnout/engagement

BEGIN;

-- ── Employee Overtime View ──────────────────────────────────────────

CREATE OR REPLACE VIEW v_employee_overtime AS
SELECT
  t.user_id,
  u.contractor_id,
  DATE_TRUNC('month', t.work_date)::DATE AS month,
  SUM(t.hours) AS total_hours,
  COUNT(DISTINCT t.work_date) AS days_worked,
  GREATEST(SUM(t.hours) - COUNT(DISTINCT t.work_date) * 8, 0) AS overtime_hours,
  CASE
    WHEN GREATEST(SUM(t.hours) - COUNT(DISTINCT t.work_date) * 8, 0) > 40 THEN 'Heavy'
    WHEN GREATEST(SUM(t.hours) - COUNT(DISTINCT t.work_date) * 8, 0) > 20 THEN 'Moderate'
    ELSE 'Normal'
  END AS overtime_category
FROM timesheets t
JOIN users u ON t.user_id = u.id
WHERE t.work_date >= CURRENT_DATE - 365
GROUP BY t.user_id, u.contractor_id, DATE_TRUNC('month', t.work_date);

-- ── Overtime vs Burnout Correlation (privacy: min 5) ────────────────

CREATE OR REPLACE VIEW v_overtime_burnout_correlation AS
SELECT
  ot.contractor_id,
  ot.overtime_category,
  ROUND(AVG(wa.burnout_score)::numeric, 1) AS avg_burnout,
  ROUND(AVG(wa.engagement_score)::numeric, 1) AS avg_engagement,
  COUNT(DISTINCT ot.user_id) AS employee_count
FROM v_employee_overtime ot
JOIN wellmind_assessments wa
  ON ot.user_id = wa.user_id
  AND wa.quarter = CONCAT(
    EXTRACT(YEAR FROM ot.month), '-Q',
    EXTRACT(QUARTER FROM ot.month)
  )
GROUP BY ot.contractor_id, ot.overtime_category
HAVING COUNT(DISTINCT ot.user_id) >= 5;

COMMIT;
