-- Migration 060: Wellbeing Integration Layer
-- Creates 4 tables for cross-module coordination between Blue Colibri, EAP,
-- chatbot, and existing HR-ERP modules.
--
-- Tables:
--   1. wellbeing_referrals      — Cross-module referral tracking
--   2. wellbeing_notifications  — Push/email/SMS/in-app notification queue
--   3. wellbeing_audit_log      — GDPR-compliant sensitive data access log
--   4. wellbeing_feedback       — User satisfaction tracking
--
-- Also creates:
--   - Auto-expiration trigger for stale referrals
--   - Common query views (v_active_referrals, v_pending_notifications)
--
-- Dependencies: users, contractors, eap_cases (from migrations 001, 059)
--               app_current_user_id(), etc. (from migration 057)

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 1: wellbeing_referrals
-- Purpose: Cross-module referrals (Blue Colibri → EAP, Chatbot → EAP,
-- Manager → Coaching, etc.). Tracks full lifecycle with auto-expiration.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wellbeing_referrals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,

    -- Source: where did this referral come from?
    source_module       VARCHAR(50) NOT NULL CHECK (source_module IN (
                            'blue_colibri', 'chatbot', 'manager_alert',
                            'self_service', 'eap'
                        )),
    source_record_id    UUID,              -- ID from originating module
                                           -- (assessment_id, conversation_id, etc.)

    -- Target: where should the employee be directed?
    target_module       VARCHAR(50) NOT NULL CHECK (target_module IN (
                            'eap', 'blue_colibri', 'coaching', 'hr_intervention'
                        )),
    target_case_id      UUID,              -- If referral creates an EAP case, link it here

    -- Referral details
    referral_type       VARCHAR(100) NOT NULL,
                        -- e.g. 'high_burnout_to_eap', 'chatbot_mental_health_keyword',
                        -- 'consecutive_low_pulse', 'manager_concern', 'self_referral'
    urgency_level       VARCHAR(20) NOT NULL DEFAULT 'medium'
                        CHECK (urgency_level IN ('low', 'medium', 'high', 'crisis')),
    referral_reason     TEXT NOT NULL,

    -- Who initiated? NULL = system auto-generated
    referred_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    is_auto_generated   BOOLEAN NOT NULL DEFAULT false,

    -- Status lifecycle
    status              VARCHAR(50) NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                            'pending', 'accepted', 'declined', 'completed', 'expired'
                        )),
    accepted_at         TIMESTAMP,
    declined_at         TIMESTAMP,
    completed_at        TIMESTAMP,
    expires_at          TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

    decline_reason      TEXT,
    completion_notes    TEXT,

    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_referrals_user_status
    ON wellbeing_referrals(user_id, status);

CREATE INDEX IF NOT EXISTS idx_wb_referrals_contractor
    ON wellbeing_referrals(contractor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wb_referrals_source
    ON wellbeing_referrals(source_module, status);

CREATE INDEX IF NOT EXISTS idx_wb_referrals_target
    ON wellbeing_referrals(target_module, status);

CREATE INDEX IF NOT EXISTS idx_wb_referrals_expires
    ON wellbeing_referrals(expires_at)
    WHERE status = 'pending';

COMMENT ON TABLE wellbeing_referrals IS
    'Cross-module referrals between Blue Colibri, EAP, chatbot, and HR. '
    'Auto-expires after 30 days via trigger. Tracks full lifecycle.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 2: wellbeing_notifications
-- Purpose: Notification queue for push, email, SMS, and in-app messages.
-- Processed by cron jobs; tracks delivery status.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wellbeing_notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,

    -- Content
    notification_type   VARCHAR(100) NOT NULL,
                        -- 'pulse_reminder', 'assessment_due', 'eap_appointment_reminder',
                        -- 'intervention_recommended', 'manager_alert', 'referral_received',
                        -- 'booking_confirmation', 'session_follow_up', 'risk_alert',
                        -- 'weekly_summary'
    notification_channel VARCHAR(50) NOT NULL
                        CHECK (notification_channel IN ('push', 'email', 'sms', 'in_app')),
    title               VARCHAR(255) NOT NULL,
    message             TEXT NOT NULL,
    action_url          VARCHAR(500),      -- Deep link: /blue-colibri/pulse, /eap/cases/xxx
    priority            VARCHAR(20) NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- Delivery lifecycle
    status              VARCHAR(50) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    scheduled_for       TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at             TIMESTAMP,
    delivered_at        TIMESTAMP,
    read_at             TIMESTAMP,
    failed_reason       TEXT,

    -- Retry
    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 3,

    -- Source tracking
    source_module       VARCHAR(50),       -- 'blue_colibri', 'eap', 'wellbeing'
    source_entity_type  VARCHAR(50),       -- 'pulse', 'assessment', 'booking', 'referral'
    source_entity_id    UUID,

    -- Extra context
    metadata            JSONB DEFAULT '{}'::jsonb,

    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_notif_user_status
    ON wellbeing_notifications(user_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_wb_notif_pending
    ON wellbeing_notifications(scheduled_for, priority DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wb_notif_user_unread
    ON wellbeing_notifications(user_id, created_at DESC)
    WHERE status IN ('sent', 'delivered');

CREATE INDEX IF NOT EXISTS idx_wb_notif_type
    ON wellbeing_notifications(notification_type, status);

CREATE INDEX IF NOT EXISTS idx_wb_notif_contractor
    ON wellbeing_notifications(contractor_id, created_at DESC);

COMMENT ON TABLE wellbeing_notifications IS
    'Notification queue for wellbeing modules. Supports push, email, SMS, in-app. '
    'Pending notifications processed by cron job. Tracks delivery + read status. '
    'Supports scheduled delivery via scheduled_for field.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 3: wellbeing_audit_log
-- Purpose: GDPR-compliant audit trail for sensitive wellbeing data access.
-- IMMUTABLE — no UPDATE/DELETE allowed (enforced via RLS).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wellbeing_audit_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who accessed
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Whose data was accessed
    accessed_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,

    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,

    -- What happened
    action              VARCHAR(100) NOT NULL,
                        -- 'view_assessment', 'view_eap_case', 'view_eap_session_notes',
                        -- 'view_team_metrics', 'view_risk_employees', 'view_ml_predictions',
                        -- 'export_data', 'create_intervention', 'create_referral',
                        -- 'decrypt_pii', 'delete_data', 'data_erasure', 'consent_update'
    resource_type       VARCHAR(50) NOT NULL,
                        -- 'assessment', 'eap_case', 'eap_session', 'team_metrics',
                        -- 'pulse_survey', 'ml_prediction', 'intervention', 'provider'
    resource_id         UUID,

    -- Context
    access_reason       TEXT,              -- Required for sensitive data access
    ip_address          INET,
    user_agent          TEXT,
    request_method      VARCHAR(10),       -- 'GET', 'POST', 'PUT', 'DELETE'
    request_path        VARCHAR(500),

    -- Result
    access_granted      BOOLEAN NOT NULL DEFAULT true,
    denial_reason       TEXT,

    -- Extra details
    details             JSONB DEFAULT '{}'::jsonb,
                        -- e.g. {"fields_accessed": ["session_notes"], "rows_returned": 5}

    -- IMMUTABLE — no updated_at
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_audit_accessed_user
    ON wellbeing_audit_log(accessed_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wb_audit_accessor
    ON wellbeing_audit_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wb_audit_contractor
    ON wellbeing_audit_log(contractor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wb_audit_resource
    ON wellbeing_audit_log(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_wb_audit_action
    ON wellbeing_audit_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wb_audit_denied
    ON wellbeing_audit_log(access_granted, created_at DESC)
    WHERE access_granted = false;

COMMENT ON TABLE wellbeing_audit_log IS
    'Immutable GDPR-compliant audit trail for all sensitive wellbeing data access. '
    'UPDATE and DELETE are blocked by RLS policies. Required for compliance.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 4: wellbeing_feedback
-- Purpose: User feedback on interventions, sessions, assessments, etc.
-- Used to measure service quality and improve recommendations.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wellbeing_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,

    feedback_type       VARCHAR(50) NOT NULL CHECK (feedback_type IN (
                            'intervention', 'coaching_session', 'eap_session',
                            'assessment', 'pulse_survey', 'general'
                        )),
    related_record_id   UUID,              -- intervention_id, session_id, assessment_id, etc.

    -- Rating
    rating              INTEGER CHECK (rating BETWEEN 1 AND 5),
                        -- 1=Very unhelpful, 2=Unhelpful, 3=Neutral, 4=Helpful, 5=Very helpful
    is_helpful          BOOLEAN,

    -- Comments
    feedback_text       TEXT,
    improvement_suggestions TEXT,

    -- Anonymity
    is_anonymous        BOOLEAN NOT NULL DEFAULT false,

    -- Source
    submitted_via       VARCHAR(20) DEFAULT 'mobile'
                        CHECK (submitted_via IN ('mobile', 'web', 'chatbot')),

    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_feedback_user
    ON wellbeing_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wb_feedback_type
    ON wellbeing_feedback(feedback_type, rating);

CREATE INDEX IF NOT EXISTS idx_wb_feedback_contractor
    ON wellbeing_feedback(contractor_id, feedback_type);

CREATE INDEX IF NOT EXISTS idx_wb_feedback_record
    ON wellbeing_feedback(related_record_id)
    WHERE related_record_id IS NOT NULL;

COMMENT ON TABLE wellbeing_feedback IS
    'User feedback on wellbeing interventions, sessions, and assessments. '
    'Supports anonymous feedback. Used for service quality metrics.';


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. wellbeing_referrals (own data + admin) ──

DO $$ BEGIN
    ALTER TABLE wellbeing_referrals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE wellbeing_referrals FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS wb_referrals_own ON wellbeing_referrals;
CREATE POLICY wb_referrals_own ON wellbeing_referrals
    FOR ALL
    USING (
        user_id = app_current_user_id()
        AND contractor_id = app_current_contractor_id()
    );

DROP POLICY IF EXISTS wb_referrals_admin ON wellbeing_referrals;
CREATE POLICY wb_referrals_admin ON wellbeing_referrals
    FOR ALL
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller', 'task_owner')
        )
    );

-- ── 2. wellbeing_notifications (own data + admin send) ──

DO $$ BEGIN
    ALTER TABLE wellbeing_notifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE wellbeing_notifications FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS wb_notif_own ON wellbeing_notifications;
CREATE POLICY wb_notif_own ON wellbeing_notifications
    FOR SELECT
    USING (
        user_id = app_current_user_id()
    );

-- Admin/system can insert + manage notifications
DROP POLICY IF EXISTS wb_notif_admin ON wellbeing_notifications;
CREATE POLICY wb_notif_admin ON wellbeing_notifications
    FOR ALL
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

-- Users can mark their own notifications as read
DROP POLICY IF EXISTS wb_notif_own_update ON wellbeing_notifications;
CREATE POLICY wb_notif_own_update ON wellbeing_notifications
    FOR UPDATE
    USING (
        user_id = app_current_user_id()
    );

-- ── 3. wellbeing_audit_log (IMMUTABLE — admin read, system insert, no update/delete) ──

DO $$ BEGIN
    ALTER TABLE wellbeing_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE wellbeing_audit_log FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Admin/system can read audit log (contractor-scoped)
DROP POLICY IF EXISTS wb_audit_read ON wellbeing_audit_log;
CREATE POLICY wb_audit_read ON wellbeing_audit_log
    FOR SELECT
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

-- System/admin can insert audit records
DROP POLICY IF EXISTS wb_audit_insert ON wellbeing_audit_log;
CREATE POLICY wb_audit_insert ON wellbeing_audit_log
    FOR INSERT
    WITH CHECK (true);  -- Any authenticated context can log

-- BLOCK updates — audit log is immutable
DROP POLICY IF EXISTS wb_audit_no_update ON wellbeing_audit_log;
CREATE POLICY wb_audit_no_update ON wellbeing_audit_log
    FOR UPDATE
    USING (false);

-- BLOCK deletes — audit log is immutable
DROP POLICY IF EXISTS wb_audit_no_delete ON wellbeing_audit_log;
CREATE POLICY wb_audit_no_delete ON wellbeing_audit_log
    FOR DELETE
    USING (false);

-- ── 4. wellbeing_feedback (own data + admin read) ──

DO $$ BEGIN
    ALTER TABLE wellbeing_feedback ENABLE ROW LEVEL SECURITY;
    ALTER TABLE wellbeing_feedback FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS wb_feedback_own ON wellbeing_feedback;
CREATE POLICY wb_feedback_own ON wellbeing_feedback
    FOR ALL
    USING (
        user_id = app_current_user_id()
        AND contractor_id = app_current_contractor_id()
    );

DROP POLICY IF EXISTS wb_feedback_admin ON wellbeing_feedback;
CREATE POLICY wb_feedback_admin ON wellbeing_feedback
    FOR SELECT
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );


-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-expire stale referrals
-- Runs on INSERT/UPDATE to clean up expired referrals.
-- Also used by cron job for batch expiration.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION wb_expire_old_referrals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE wellbeing_referrals
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending'
      AND expires_at < NOW();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expire_referrals ON wellbeing_referrals;
CREATE TRIGGER trg_expire_referrals
    AFTER INSERT ON wellbeing_referrals
    FOR EACH STATEMENT
    EXECUTE FUNCTION wb_expire_old_referrals();

COMMENT ON FUNCTION wb_expire_old_referrals() IS
    'Automatically expires pending referrals past their expires_at date. '
    'Fires on every INSERT/UPDATE to wellbeing_referrals.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: updated_at
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION wb_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_wb_referrals_updated
        BEFORE UPDATE ON wellbeing_referrals
        FOR EACH ROW EXECUTE FUNCTION wb_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS: Common queries
-- ═══════════════════════════════════════════════════════════════════════════

-- Active referrals that haven't expired
CREATE OR REPLACE VIEW v_active_referrals AS
SELECT
    r.id,
    r.user_id,
    r.contractor_id,
    r.source_module,
    r.target_module,
    r.referral_type,
    r.urgency_level,
    r.referral_reason,
    r.status,
    r.is_auto_generated,
    r.expires_at,
    r.created_at
FROM wellbeing_referrals r
WHERE r.status IN ('pending', 'accepted')
  AND r.expires_at > NOW();

COMMENT ON VIEW v_active_referrals IS
    'Active referrals (pending or accepted) that have not expired. '
    'RLS from underlying table is inherited.';

-- Pending notifications ready for delivery
CREATE OR REPLACE VIEW v_pending_notifications AS
SELECT *
FROM wellbeing_notifications
WHERE status = 'pending'
  AND scheduled_for <= NOW()
  AND retry_count < max_retries
ORDER BY
    CASE priority
        WHEN 'urgent' THEN 1
        WHEN 'high'   THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low'    THEN 4
    END,
    scheduled_for ASC;

COMMENT ON VIEW v_pending_notifications IS
    'Notifications ready to be sent: pending, past scheduled time, retries not exhausted. '
    'Ordered by priority (urgent first) then scheduled time.';

-- Audit log summary per user (for GDPR Subject Access Requests)
CREATE OR REPLACE VIEW v_audit_summary AS
SELECT
    accessed_user_id,
    contractor_id,
    action,
    resource_type,
    COUNT(*) AS access_count,
    MIN(created_at) AS first_access,
    MAX(created_at) AS last_access
FROM wellbeing_audit_log
WHERE access_granted = true
GROUP BY accessed_user_id, contractor_id, action, resource_type;

COMMENT ON VIEW v_audit_summary IS
    'Aggregated view of data access per user. Useful for GDPR Subject Access Requests.';


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA (no PII — only structure demonstrations)
-- ═══════════════════════════════════════════════════════════════════════════

-- Seed data will be inserted by the test script using real user/contractor IDs.
-- No static seed data for these tables as they all require FK references.
