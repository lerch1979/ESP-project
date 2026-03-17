-- Migration 062: Rename Blue Colibri → WellMind, EAP → CarePath
-- Complete rename of all tables, indexes, policies, triggers, constraints,
-- sequences, views, materialized views, and data values.
--
-- Rationale: Copyright compliance — replacing third-party brand names
-- with proprietary branding.
--
--   Blue Colibri → WellMind  (preventive wellbeing)
--   EAP          → CarePath  (reactive employee support)

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1: DROP dependent objects that reference old table names
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop materialized view (references old table names)
DROP MATERIALIZED VIEW IF EXISTS mv_user_wellbeing_summary;

-- Drop views (reference old table names)
DROP VIEW IF EXISTS v_active_referrals;
DROP VIEW IF EXISTS v_pending_notifications;
DROP VIEW IF EXISTS v_audit_summary;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2: RENAME TABLES — Blue Colibri → WellMind
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE blue_colibri_questions RENAME TO wellmind_questions;
ALTER TABLE blue_colibri_pulse_surveys RENAME TO wellmind_pulse_surveys;
ALTER TABLE blue_colibri_assessments RENAME TO wellmind_assessments;
ALTER TABLE blue_colibri_interventions RENAME TO wellmind_interventions;
ALTER TABLE blue_colibri_coaching_sessions RENAME TO wellmind_coaching_sessions;
ALTER TABLE blue_colibri_team_metrics RENAME TO wellmind_team_metrics;
ALTER TABLE blue_colibri_ml_predictions RENAME TO wellmind_ml_predictions;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 3: RENAME TABLES — EAP → CarePath
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE eap_service_categories RENAME TO carepath_service_categories;
ALTER TABLE eap_providers RENAME TO carepath_providers;
ALTER TABLE eap_cases RENAME TO carepath_cases;
ALTER TABLE eap_sessions RENAME TO carepath_sessions;
ALTER TABLE eap_provider_bookings RENAME TO carepath_provider_bookings;
ALTER TABLE eap_usage_stats RENAME TO carepath_usage_stats;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 4: RENAME INDEXES — WellMind
-- ═══════════════════════════════════════════════════════════════════════════

-- Questions
ALTER INDEX IF EXISTS idx_bc_questions_type_active RENAME TO idx_wm_questions_type_active;
ALTER INDEX IF EXISTS idx_bc_questions_category RENAME TO idx_wm_questions_category;

-- Pulse surveys
ALTER INDEX IF EXISTS idx_bc_pulse_user_date RENAME TO idx_wm_pulse_user_date;
ALTER INDEX IF EXISTS idx_bc_pulse_contractor_date RENAME TO idx_wm_pulse_contractor_date;
ALTER INDEX IF EXISTS idx_bc_pulse_contractor_mood RENAME TO idx_wm_pulse_contractor_mood;

-- Assessments
ALTER INDEX IF EXISTS idx_bc_assessment_user_quarter RENAME TO idx_wm_assessment_user_quarter;
ALTER INDEX IF EXISTS idx_bc_assessment_risk RENAME TO idx_wm_assessment_risk;
ALTER INDEX IF EXISTS idx_bc_assessment_contractor_date RENAME TO idx_wm_assessment_contractor_date;

-- Interventions
ALTER INDEX IF EXISTS idx_bc_interventions_user_status RENAME TO idx_wm_interventions_user_status;
ALTER INDEX IF EXISTS idx_bc_interventions_type RENAME TO idx_wm_interventions_type;
ALTER INDEX IF EXISTS idx_bc_interventions_contractor RENAME TO idx_wm_interventions_contractor;
ALTER INDEX IF EXISTS idx_bc_interventions_expires RENAME TO idx_wm_interventions_expires;

-- Coaching sessions
ALTER INDEX IF EXISTS idx_bc_coaching_user_date RENAME TO idx_wm_coaching_user_date;
ALTER INDEX IF EXISTS idx_bc_coaching_contractor RENAME TO idx_wm_coaching_contractor;
ALTER INDEX IF EXISTS idx_bc_coaching_coach RENAME TO idx_wm_coaching_coach;
ALTER INDEX IF EXISTS idx_bc_coaching_status RENAME TO idx_wm_coaching_status;

-- Team metrics
ALTER INDEX IF EXISTS idx_bc_team_metrics_date RENAME TO idx_wm_team_metrics_date;
ALTER INDEX IF EXISTS idx_bc_team_metrics_contractor RENAME TO idx_wm_team_metrics_contractor;

-- ML predictions
ALTER INDEX IF EXISTS idx_bc_ml_user_date RENAME TO idx_wm_ml_user_date;
ALTER INDEX IF EXISTS idx_bc_ml_risk RENAME TO idx_wm_ml_risk;
ALTER INDEX IF EXISTS idx_bc_ml_turnover RENAME TO idx_wm_ml_turnover;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 5: RENAME INDEXES — CarePath
-- ═══════════════════════════════════════════════════════════════════════════

-- Service categories
ALTER INDEX IF EXISTS idx_eap_categories_active RENAME TO idx_cp_categories_active;

-- Providers
ALTER INDEX IF EXISTS idx_eap_providers_type RENAME TO idx_cp_providers_type;
ALTER INDEX IF EXISTS idx_eap_providers_contractor RENAME TO idx_cp_providers_contractor;
ALTER INDEX IF EXISTS idx_eap_providers_active RENAME TO idx_cp_providers_active;
ALTER INDEX IF EXISTS idx_eap_providers_specialties RENAME TO idx_cp_providers_specialties;
ALTER INDEX IF EXISTS idx_eap_providers_languages RENAME TO idx_cp_providers_languages;
ALTER INDEX IF EXISTS idx_eap_providers_geo RENAME TO idx_cp_providers_geo;

-- Cases
ALTER INDEX IF EXISTS idx_eap_cases_user RENAME TO idx_cp_cases_user;
ALTER INDEX IF EXISTS idx_eap_cases_contractor RENAME TO idx_cp_cases_contractor;
ALTER INDEX IF EXISTS idx_eap_cases_provider RENAME TO idx_cp_cases_provider;
ALTER INDEX IF EXISTS idx_eap_cases_urgency RENAME TO idx_cp_cases_urgency;
ALTER INDEX IF EXISTS idx_eap_cases_number RENAME TO idx_cp_cases_number;
ALTER INDEX IF EXISTS idx_eap_cases_retention RENAME TO idx_cp_cases_retention;

-- Sessions
ALTER INDEX IF EXISTS idx_eap_sessions_case RENAME TO idx_cp_sessions_case;
ALTER INDEX IF EXISTS idx_eap_sessions_provider RENAME TO idx_cp_sessions_provider;
ALTER INDEX IF EXISTS idx_eap_sessions_risk RENAME TO idx_cp_sessions_risk;

-- Bookings
ALTER INDEX IF EXISTS idx_eap_bookings_provider_date RENAME TO idx_cp_bookings_provider_date;
ALTER INDEX IF EXISTS idx_eap_bookings_user RENAME TO idx_cp_bookings_user;
ALTER INDEX IF EXISTS idx_eap_bookings_upcoming RENAME TO idx_cp_bookings_upcoming;
ALTER INDEX IF EXISTS idx_eap_bookings_case RENAME TO idx_cp_bookings_case;

-- Usage stats
ALTER INDEX IF EXISTS idx_eap_stats_month RENAME TO idx_cp_stats_month;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 6: RENAME RLS POLICIES — WellMind
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY bc_questions_select ON wellmind_questions RENAME TO wm_questions_select;
ALTER POLICY bc_questions_admin ON wellmind_questions RENAME TO wm_questions_admin;

ALTER POLICY bc_pulse_own ON wellmind_pulse_surveys RENAME TO wm_pulse_own;
ALTER POLICY bc_pulse_admin ON wellmind_pulse_surveys RENAME TO wm_pulse_admin;

ALTER POLICY bc_assessment_own ON wellmind_assessments RENAME TO wm_assessment_own;
ALTER POLICY bc_assessment_admin ON wellmind_assessments RENAME TO wm_assessment_admin;

ALTER POLICY bc_intervention_own ON wellmind_interventions RENAME TO wm_intervention_own;
ALTER POLICY bc_intervention_admin ON wellmind_interventions RENAME TO wm_intervention_admin;

ALTER POLICY bc_coaching_own ON wellmind_coaching_sessions RENAME TO wm_coaching_own;
ALTER POLICY bc_coaching_admin ON wellmind_coaching_sessions RENAME TO wm_coaching_admin;

ALTER POLICY bc_team_metrics_admin ON wellmind_team_metrics RENAME TO wm_team_metrics_admin;
ALTER POLICY bc_team_metrics_insert ON wellmind_team_metrics RENAME TO wm_team_metrics_insert;

ALTER POLICY bc_ml_admin ON wellmind_ml_predictions RENAME TO wm_ml_admin;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 7: RENAME RLS POLICIES — CarePath
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY eap_categories_select ON carepath_service_categories RENAME TO cp_categories_select;
ALTER POLICY eap_categories_admin ON carepath_service_categories RENAME TO cp_categories_admin;

ALTER POLICY eap_providers_select ON carepath_providers RENAME TO cp_providers_select;
ALTER POLICY eap_providers_admin ON carepath_providers RENAME TO cp_providers_admin;

ALTER POLICY eap_cases_own ON carepath_cases RENAME TO cp_cases_own;
ALTER POLICY eap_cases_admin ON carepath_cases RENAME TO cp_cases_admin;

ALTER POLICY eap_sessions_own ON carepath_sessions RENAME TO cp_sessions_own;
ALTER POLICY eap_sessions_provider ON carepath_sessions RENAME TO cp_sessions_provider;
ALTER POLICY eap_sessions_admin ON carepath_sessions RENAME TO cp_sessions_admin;

ALTER POLICY eap_bookings_own ON carepath_provider_bookings RENAME TO cp_bookings_own;
ALTER POLICY eap_bookings_provider ON carepath_provider_bookings RENAME TO cp_bookings_provider;
ALTER POLICY eap_bookings_admin ON carepath_provider_bookings RENAME TO cp_bookings_admin;

ALTER POLICY eap_stats_admin ON carepath_usage_stats RENAME TO cp_stats_admin;
ALTER POLICY eap_stats_insert ON carepath_usage_stats RENAME TO cp_stats_insert;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 8: RENAME TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TRIGGER trg_bc_questions_updated ON wellmind_questions RENAME TO trg_wm_questions_updated;
ALTER TRIGGER trg_bc_interventions_updated ON wellmind_interventions RENAME TO trg_wm_interventions_updated;
ALTER TRIGGER trg_bc_coaching_updated ON wellmind_coaching_sessions RENAME TO trg_wm_coaching_updated;

ALTER TRIGGER trg_eap_providers_updated ON carepath_providers RENAME TO trg_cp_providers_updated;
ALTER TRIGGER trg_eap_cases_updated ON carepath_cases RENAME TO trg_cp_cases_updated;
ALTER TRIGGER trg_eap_bookings_updated ON carepath_provider_bookings RENAME TO trg_cp_bookings_updated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 9: RENAME SEQUENCE
-- ═══════════════════════════════════════════════════════════════════════════

ALTER SEQUENCE IF EXISTS eap_case_number_seq RENAME TO carepath_case_number_seq;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 10: UPDATE DATA VALUES
-- ═══════════════════════════════════════════════════════════════════════════

-- Referrals: update module references
-- First drop old CHECK constraints, update data, then add new constraints
ALTER TABLE wellbeing_referrals DROP CONSTRAINT IF EXISTS wellbeing_referrals_source_module_check;
ALTER TABLE wellbeing_referrals DROP CONSTRAINT IF EXISTS wellbeing_referrals_target_module_check;

UPDATE wellbeing_referrals SET source_module = 'wellmind' WHERE source_module = 'blue_colibri';
UPDATE wellbeing_referrals SET source_module = 'carepath' WHERE source_module = 'eap';
UPDATE wellbeing_referrals SET target_module = 'wellmind' WHERE target_module = 'blue_colibri';
UPDATE wellbeing_referrals SET target_module = 'carepath' WHERE target_module = 'eap';

ALTER TABLE wellbeing_referrals ADD CONSTRAINT wellbeing_referrals_source_module_check
    CHECK (source_module IN ('wellmind', 'chatbot', 'manager_alert', 'self_service', 'carepath'));
ALTER TABLE wellbeing_referrals ADD CONSTRAINT wellbeing_referrals_target_module_check
    CHECK (target_module IN ('carepath', 'wellmind', 'coaching', 'hr_intervention'));

-- Notifications: update module references
UPDATE wellbeing_notifications
SET source_module = CASE
    WHEN source_module = 'blue_colibri' THEN 'wellmind'
    WHEN source_module = 'eap' THEN 'carepath'
    ELSE source_module
END
WHERE source_module IN ('blue_colibri', 'eap');

UPDATE wellbeing_notifications
SET notification_type = REPLACE(notification_type, 'eap_', 'carepath_')
WHERE notification_type LIKE 'eap_%';

-- Audit log: update resource types and actions
UPDATE wellbeing_audit_log
SET resource_type = REPLACE(resource_type, 'eap_', 'carepath_')
WHERE resource_type LIKE 'eap_%';

UPDATE wellbeing_audit_log
SET action = REPLACE(action, 'eap_', 'carepath_')
WHERE action LIKE '%eap_%';

-- Case numbers: EAP- → CP-
UPDATE carepath_cases SET case_number = REPLACE(case_number, 'EAP-', 'CP-');

-- Referral types: update names
UPDATE wellbeing_referrals SET referral_type = REPLACE(referral_type, 'to_eap', 'to_carepath')
WHERE referral_type LIKE '%to_eap%';

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 11: RECREATE VIEWS with new table names
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_active_referrals AS
SELECT
    r.id, r.user_id, r.contractor_id,
    r.source_module, r.target_module, r.referral_type,
    r.urgency_level, r.referral_reason, r.status,
    r.is_auto_generated, r.expires_at, r.created_at
FROM wellbeing_referrals r
WHERE r.status IN ('pending', 'accepted')
  AND r.expires_at > NOW();

CREATE OR REPLACE VIEW v_pending_notifications AS
SELECT *
FROM wellbeing_notifications
WHERE status = 'pending'
  AND scheduled_for <= NOW()
  AND retry_count < max_retries
ORDER BY
    CASE priority
        WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
        WHEN 'normal' THEN 3 WHEN 'low' THEN 4
    END,
    scheduled_for ASC;

CREATE OR REPLACE VIEW v_audit_summary AS
SELECT
    accessed_user_id, contractor_id, action, resource_type,
    COUNT(*) AS access_count,
    MIN(created_at) AS first_access, MAX(created_at) AS last_access
FROM wellbeing_audit_log
WHERE access_granted = true
GROUP BY accessed_user_id, contractor_id, action, resource_type;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 12: RECREATE MATERIALIZED VIEW with new table names
-- ═══════════════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW mv_user_wellbeing_summary AS
SELECT
    u.id AS user_id,
    u.contractor_id,
    (SELECT AVG(mood_score) FROM wellmind_pulse_surveys
     WHERE user_id = u.id AND survey_date >= CURRENT_DATE - 30) AS avg_mood_30d,
    (SELECT COUNT(*) FROM wellmind_pulse_surveys
     WHERE user_id = u.id AND survey_date >= CURRENT_DATE - 30) AS pulse_count_30d,
    (SELECT burnout_score FROM wellmind_assessments
     WHERE user_id = u.id ORDER BY assessment_date DESC LIMIT 1) AS latest_burnout,
    (SELECT engagement_score FROM wellmind_assessments
     WHERE user_id = u.id ORDER BY assessment_date DESC LIMIT 1) AS latest_engagement,
    (SELECT risk_level FROM wellmind_assessments
     WHERE user_id = u.id ORDER BY assessment_date DESC LIMIT 1) AS latest_risk_level,
    (SELECT COUNT(*) FROM wellmind_interventions
     WHERE user_id = u.id AND status IN ('recommended', 'accepted', 'in_progress')) AS active_interventions,
    (SELECT COUNT(*) FROM carepath_cases
     WHERE user_id = u.id AND status IN ('open', 'assigned', 'in_progress')) AS active_carepath_cases,
    (SELECT COUNT(*) FROM wellbeing_referrals
     WHERE user_id = u.id AND status = 'pending') AS pending_referrals
FROM users u
WHERE EXISTS (
    SELECT 1 FROM wellmind_pulse_surveys WHERE user_id = u.id
    UNION ALL
    SELECT 1 FROM wellmind_assessments WHERE user_id = u.id
    UNION ALL
    SELECT 1 FROM carepath_cases WHERE user_id = u.id
);

CREATE UNIQUE INDEX idx_mv_wellbeing_user ON mv_user_wellbeing_summary(user_id);
CREATE INDEX idx_mv_wellbeing_risk ON mv_user_wellbeing_summary(latest_risk_level)
    WHERE latest_risk_level IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 13: UPDATE TABLE COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE wellmind_questions IS 'WellMind question bank for pulse surveys and quarterly assessments.';
COMMENT ON TABLE wellmind_pulse_surveys IS 'WellMind daily mood check-ins. One per user per day.';
COMMENT ON TABLE wellmind_assessments IS 'WellMind quarterly burnout (MBI) and engagement (UWES) assessments.';
COMMENT ON TABLE wellmind_interventions IS 'WellMind recommended actions based on wellbeing signals.';
COMMENT ON TABLE wellmind_coaching_sessions IS 'WellMind 1-on-1 coaching session tracking.';
COMMENT ON TABLE wellmind_team_metrics IS 'WellMind aggregated team metrics. Privacy: employee_count >= 5.';
COMMENT ON TABLE wellmind_ml_predictions IS 'WellMind ML turnover and burnout risk predictions.';

COMMENT ON TABLE carepath_service_categories IS 'CarePath service categories (Counseling, Legal, Financial, etc.).';
COMMENT ON TABLE carepath_providers IS 'CarePath external service providers with geo-location.';
COMMENT ON TABLE carepath_cases IS 'CarePath employee cases. Encrypted content, anonymous mode supported.';
COMMENT ON TABLE carepath_sessions IS 'CarePath counseling sessions with pgcrypto-encrypted notes.';
COMMENT ON TABLE carepath_provider_bookings IS 'CarePath appointment booking with double-booking prevention.';
COMMENT ON TABLE carepath_usage_stats IS 'CarePath monthly aggregated usage statistics. No PII.';

COMMENT ON SEQUENCE carepath_case_number_seq IS 'CarePath case number sequence: CP-YYYYMMDD-{nextval}';
COMMENT ON MATERIALIZED VIEW mv_user_wellbeing_summary IS 'Pre-computed wellbeing snapshot. Refresh via refresh_wellbeing_summary().';

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 14: ANALYZE renamed tables
-- ═══════════════════════════════════════════════════════════════════════════

ANALYZE wellmind_questions;
ANALYZE wellmind_pulse_surveys;
ANALYZE wellmind_assessments;
ANALYZE wellmind_interventions;
ANALYZE wellmind_coaching_sessions;
ANALYZE wellmind_team_metrics;
ANALYZE wellmind_ml_predictions;
ANALYZE carepath_service_categories;
ANALYZE carepath_providers;
ANALYZE carepath_cases;
ANALYZE carepath_sessions;
ANALYZE carepath_provider_bookings;
ANALYZE carepath_usage_stats;
ANALYZE mv_user_wellbeing_summary;
