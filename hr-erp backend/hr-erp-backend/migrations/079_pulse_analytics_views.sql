-- Migration 079: Pulse Analytics Views
-- Category aggregates, user trends, alerts, housing insights

BEGIN;

-- User trends (30 days) — per category averages
CREATE OR REPLACE VIEW v_pulse_user_category_30d AS
SELECT
  ps.user_id,
  u.contractor_id,
  q.category,
  ROUND(AVG(ps.mood_score)::numeric, 2) AS avg_score,
  COUNT(*) AS response_count,
  MIN(ps.survey_date) AS first_date,
  MAX(ps.survey_date) AS last_date
FROM wellmind_pulse_surveys ps
JOIN users u ON ps.user_id = u.id
LEFT JOIN pulse_question_library q ON q.is_core = TRUE AND q.category = 'mental_wellbeing'
WHERE ps.survey_date >= CURRENT_DATE - 30
GROUP BY ps.user_id, u.contractor_id, q.category;

-- Contractor daily averages
CREATE OR REPLACE VIEW v_pulse_contractor_daily AS
SELECT
  contractor_id,
  survey_date,
  ROUND(AVG(mood_score)::numeric, 2) AS avg_mood,
  ROUND(AVG(stress_level)::numeric, 2) AS avg_stress,
  ROUND(AVG(sleep_quality)::numeric, 2) AS avg_sleep,
  ROUND(AVG(workload_level)::numeric, 2) AS avg_workload,
  COUNT(DISTINCT user_id) AS respondents
FROM wellmind_pulse_surveys
WHERE survey_date >= CURRENT_DATE - 90
GROUP BY contractor_id, survey_date
ORDER BY survey_date DESC;

-- User wellbeing alerts (low scores or declining trends)
CREATE OR REPLACE VIEW v_pulse_alerts AS
SELECT
  ps.user_id,
  u.first_name,
  u.last_name,
  u.contractor_id,
  ROUND(AVG(ps.mood_score)::numeric, 2) AS avg_mood_30d,
  ROUND(AVG(ps.stress_level)::numeric, 2) AS avg_stress_30d,
  COUNT(*) AS pulse_count_30d,
  CASE
    WHEN AVG(ps.mood_score) < 2.0 THEN 'critical'
    WHEN AVG(ps.mood_score) < 2.5 THEN 'warning'
    WHEN AVG(ps.stress_level) > 8.0 THEN 'warning'
    ELSE 'normal'
  END AS alert_level
FROM wellmind_pulse_surveys ps
JOIN users u ON ps.user_id = u.id
WHERE ps.survey_date >= CURRENT_DATE - 30
GROUP BY ps.user_id, u.first_name, u.last_name, u.contractor_id
HAVING AVG(ps.mood_score) < 2.5 OR AVG(ps.stress_level) > 8.0
ORDER BY AVG(ps.mood_score) ASC;

-- Housing wellbeing insights (from housing inspections + pulse correlation)
CREATE OR REPLACE VIEW v_pulse_housing_daily AS
SELECT
  hi.contractor_id,
  hi.inspection_date,
  ROUND(AVG(hi.overall_score)::numeric, 2) AS avg_housing_score,
  COUNT(DISTINCT hi.user_id) AS inspections,
  COUNT(DISTINCT hi.user_id) FILTER (WHERE hi.overall_score < 5) AS low_score_count
FROM housing_cleanliness_inspections hi
WHERE hi.inspection_date >= CURRENT_DATE - 90
GROUP BY hi.contractor_id, hi.inspection_date
ORDER BY hi.inspection_date DESC;

-- Category question response stats (from pulse_question_library + history)
CREATE OR REPLACE VIEW v_pulse_category_stats AS
SELECT
  q.category,
  COUNT(DISTINCT q.id) AS question_count,
  COUNT(DISTINCT h.user_id) AS users_answered,
  COUNT(h.id) AS total_shown,
  COUNT(h.id) FILTER (WHERE h.answered = TRUE) AS total_answered,
  CASE WHEN COUNT(h.id) > 0
    THEN ROUND((COUNT(h.id) FILTER (WHERE h.answered = TRUE)::numeric / COUNT(h.id)) * 100, 1)
    ELSE 0
  END AS answer_rate
FROM pulse_question_library q
LEFT JOIN pulse_question_history h ON q.id = h.question_id
WHERE q.is_active = TRUE
GROUP BY q.category
ORDER BY question_count DESC;

COMMIT;
