-- Migration 072: Production Performance Indexes
-- Ensures key lookup paths are indexed for 1000+ user scale.

BEGIN;

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_contractor ON users(contractor_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Pulse surveys (heaviest table — daily writes)
CREATE INDEX IF NOT EXISTS idx_pulse_user_date ON wellmind_pulse_surveys(user_id, survey_date DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_contractor_date ON wellmind_pulse_surveys(contractor_id, survey_date DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_date ON wellmind_pulse_surveys(survey_date DESC);

-- Assessments
CREATE INDEX IF NOT EXISTS idx_assessments_user ON wellmind_assessments(user_id, assessment_date DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_risk ON wellmind_assessments(risk_level);

-- Interventions
CREATE INDEX IF NOT EXISTS idx_interventions_user_status ON wellmind_interventions(user_id, status);

-- Coaching sessions
CREATE INDEX IF NOT EXISTS idx_coaching_user ON wellmind_coaching_sessions(user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_status ON wellmind_coaching_sessions(status);

-- CarePath cases
CREATE INDEX IF NOT EXISTS idx_cases_user ON carepath_cases(user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_status ON carepath_cases(status);

-- Bookings
CREATE INDEX IF NOT EXISTS idx_bookings_user ON carepath_bookings(user_id, appointment_datetime DESC);

-- Notifications (frequent reads)
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON wellbeing_notifications(user_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_user_date ON wellbeing_notifications(user_id, scheduled_for DESC);

-- Audit log (large table, needs date range queries)
CREATE INDEX IF NOT EXISTS idx_audit_user ON wellbeing_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON wellbeing_audit_log(created_at DESC);

-- Referrals
CREATE INDEX IF NOT EXISTS idx_referrals_user ON wellbeing_referrals(user_id, status);

-- Gamification
CREATE INDEX IF NOT EXISTS idx_gam_points_user ON wellbeing_points(user_id);
CREATE INDEX IF NOT EXISTS idx_gam_badges_user ON wellbeing_badges(user_id);

-- Tickets (used in conflict correlation)
CREATE INDEX IF NOT EXISTS idx_tickets_contractor_date ON tickets(contractor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by);

-- Housing inspections
CREATE INDEX IF NOT EXISTS idx_housing_user ON housing_cleanliness_inspections(user_id, inspection_date DESC);

-- Leave requests
CREATE INDEX IF NOT EXISTS idx_leave_user_type ON leave_requests(user_id, leave_type, start_date DESC);

-- Timesheets
CREATE INDEX IF NOT EXISTS idx_timesheet_user_date ON timesheets(user_id, work_date DESC);

COMMIT;
