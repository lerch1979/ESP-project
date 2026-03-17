-- Migration 058: Blue Colibri — Preventive Wellbeing Module
-- Creates 7 tables for employee wellbeing tracking, assessments, and interventions.
--
-- Tables:
--   1. blue_colibri_questions       — Pulse & assessment question bank
--   2. blue_colibri_pulse_surveys   — Daily mood check-ins
--   3. blue_colibri_assessments     — Quarterly burnout/engagement evaluations
--   4. blue_colibri_interventions   — Recommended actions for employees
--   5. blue_colibri_coaching_sessions — 1-on-1 coaching session tracking
--   6. blue_colibri_team_metrics    — Aggregated team wellbeing (min 5 employees)
--   7. blue_colibri_ml_predictions  — ML turnover risk predictions
--
-- RLS: All tables enforce contractor isolation + role-based access.
-- Dependencies: users, employees, contractors, organizational_units (from earlier migrations)

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 1: blue_colibri_questions
-- Purpose: Question bank for daily pulse surveys and quarterly assessments.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blue_colibri_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_type   VARCHAR(50) NOT NULL CHECK (question_type IN ('pulse', 'assessment')),
    question_text   TEXT NOT NULL,
    question_text_en TEXT,
    response_type   VARCHAR(50) NOT NULL CHECK (response_type IN ('scale_1_10', 'emoji_5', 'yes_no', 'text')),
    category        VARCHAR(100) CHECK (category IN (
                        'mood', 'stress', 'sleep', 'workload', 'engagement',
                        'burnout', 'emotional_exhaustion', 'depersonalization',
                        'personal_accomplishment', 'vigor', 'dedication', 'absorption'
                    )),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bc_questions_type_active
    ON blue_colibri_questions(question_type, is_active);

CREATE INDEX IF NOT EXISTS idx_bc_questions_category
    ON blue_colibri_questions(category) WHERE is_active = true;

COMMENT ON TABLE blue_colibri_questions IS
    'Question bank for Blue Colibri pulse surveys and quarterly assessments. '
    'Questions are global (not contractor-scoped) — the same assessment applies to all tenants.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 2: blue_colibri_pulse_surveys
-- Purpose: Daily mood check-ins (emoji mood, stress, sleep, workload).
-- One response per user per day (UNIQUE constraint).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blue_colibri_pulse_surveys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id   UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    survey_date     DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Core mood indicators
    mood_score      INTEGER NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
                    -- 1=😞 2=😐 3=🙂 4=😊 5=😁
    stress_level    INTEGER CHECK (stress_level BETWEEN 1 AND 10),
    sleep_quality   INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
    workload_level  INTEGER CHECK (workload_level BETWEEN 1 AND 10),

    notes           TEXT,
    submitted_at    TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_pulse_user_date UNIQUE (user_id, survey_date)
);

CREATE INDEX IF NOT EXISTS idx_bc_pulse_user_date
    ON blue_colibri_pulse_surveys(user_id, survey_date DESC);

CREATE INDEX IF NOT EXISTS idx_bc_pulse_contractor_date
    ON blue_colibri_pulse_surveys(contractor_id, survey_date DESC);

-- For trend analytics: average mood by contractor over time
CREATE INDEX IF NOT EXISTS idx_bc_pulse_contractor_mood
    ON blue_colibri_pulse_surveys(contractor_id, survey_date, mood_score);

COMMENT ON TABLE blue_colibri_pulse_surveys IS
    'Daily mood check-in from employees. One entry per user per day. '
    'mood_score uses 5-emoji scale (1=😞 to 5=😁), other fields use 1-10 scales.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 3: blue_colibri_assessments
-- Purpose: Quarterly burnout (MBI) and engagement (UWES) evaluations.
-- Stores raw responses as JSONB and computed composite scores.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blue_colibri_assessments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    assessment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    quarter             VARCHAR(10) NOT NULL,  -- e.g. '2026-Q1'

    -- Raw question/answer data: [{question_id, score, category}, ...]
    responses           JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Computed composite scores (0–100 normalised)
    burnout_score       DECIMAL(5,2) CHECK (burnout_score BETWEEN 0 AND 100),
    engagement_score    DECIMAL(5,2) CHECK (engagement_score BETWEEN 0 AND 100),

    -- Sub-dimension scores (MBI)
    emotional_exhaustion_score  DECIMAL(5,2),
    depersonalization_score     DECIMAL(5,2),
    personal_accomplishment_score DECIMAL(5,2),

    -- Sub-dimension scores (UWES)
    vigor_score         DECIMAL(5,2),
    dedication_score    DECIMAL(5,2),
    absorption_score    DECIMAL(5,2),

    -- Risk classification
    risk_level          VARCHAR(20) NOT NULL DEFAULT 'green'
                        CHECK (risk_level IN ('green', 'yellow', 'red')),
                        -- green:  burnout < 40 AND engagement > 60
                        -- yellow: burnout 40-70 OR engagement 40-60
                        -- red:    burnout > 70 OR engagement < 40

    risk_factors        JSONB DEFAULT '[]'::jsonb,
                        -- e.g. [{"factor":"emotional_exhaustion","severity":"high"}]

    submitted_at        TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_assessment_user_quarter UNIQUE (user_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_bc_assessment_user_quarter
    ON blue_colibri_assessments(user_id, quarter);

CREATE INDEX IF NOT EXISTS idx_bc_assessment_risk
    ON blue_colibri_assessments(contractor_id, risk_level, assessment_date DESC);

CREATE INDEX IF NOT EXISTS idx_bc_assessment_contractor_date
    ON blue_colibri_assessments(contractor_id, assessment_date DESC);

COMMENT ON TABLE blue_colibri_assessments IS
    'Quarterly burnout (MBI-22) and engagement (UWES-17) assessments. '
    'One per user per quarter. Raw responses stored as JSONB, composite '
    'scores computed by application layer. Risk levels: green/yellow/red.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 4: blue_colibri_interventions
-- Purpose: Recommended or assigned actions for employees based on wellbeing
-- signals (assessment results, pulse trends, ML predictions, or manual).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blue_colibri_interventions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,

    intervention_type   VARCHAR(50) NOT NULL CHECK (intervention_type IN (
                            'coaching', 'meditation', 'exercise', 'time_off',
                            'eap_referral', 'training', 'workload_adjustment'
                        )),
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    recommended_reason  TEXT,           -- Why this intervention was recommended

    priority            VARCHAR(20) NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

    status              VARCHAR(50) NOT NULL DEFAULT 'recommended'
                        CHECK (status IN (
                            'recommended', 'accepted', 'declined',
                            'in_progress', 'completed', 'expired'
                        )),

    -- Lifecycle timestamps
    recommended_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    accepted_at         TIMESTAMP,
    completed_at        TIMESTAMP,
    declined_at         TIMESTAMP,
    expires_at          TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),

    -- Post-completion
    completion_notes    TEXT,
    effectiveness_rating INTEGER CHECK (effectiveness_rating BETWEEN 1 AND 5),

    -- Trigger source tracking
    triggered_by        VARCHAR(30) DEFAULT 'manual'
                        CHECK (triggered_by IN (
                            'assessment', 'pulse_trend', 'ml_prediction', 'manual', 'manager'
                        )),
    trigger_source_id   UUID,          -- ID of assessment / prediction that triggered it

    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bc_interventions_user_status
    ON blue_colibri_interventions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_bc_interventions_type
    ON blue_colibri_interventions(intervention_type, status);

CREATE INDEX IF NOT EXISTS idx_bc_interventions_contractor
    ON blue_colibri_interventions(contractor_id);

CREATE INDEX IF NOT EXISTS idx_bc_interventions_expires
    ON blue_colibri_interventions(expires_at)
    WHERE status IN ('recommended', 'accepted', 'in_progress');

COMMENT ON TABLE blue_colibri_interventions IS
    'Recommended actions for employees based on wellbeing signals. '
    'Auto-generated by assessment rules, pulse trends, ML, or created manually by HR. '
    'Tracks full lifecycle: recommended → accepted/declined → in_progress → completed/expired.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 5: blue_colibri_coaching_sessions
-- Purpose: 1-on-1 coaching session tracking between employee and coach/HR.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blue_colibri_coaching_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    coach_name          VARCHAR(255),
    coach_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Scheduling
    session_date        TIMESTAMP NOT NULL,
    duration_minutes    INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 180),

    session_type        VARCHAR(50) CHECK (session_type IN (
                            'burnout_support', 'career_coaching',
                            'stress_management', 'work_life_balance',
                            'general'
                        )),

    status              VARCHAR(30) NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN (
                            'scheduled', 'completed', 'cancelled', 'no_show'
                        )),

    -- Session content (visible to coach/HR only, not to employee view)
    topics_discussed    TEXT[],
    action_items        TEXT[],
    coach_notes         TEXT,           -- Internal notes (coach eyes only)

    -- Employee feedback (filled after session)
    employee_rating     INTEGER CHECK (employee_rating BETWEEN 1 AND 5),
    employee_feedback   TEXT,

    -- Linked intervention (optional)
    intervention_id     UUID REFERENCES blue_colibri_interventions(id) ON DELETE SET NULL,

    next_session_date   TIMESTAMP,

    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bc_coaching_user_date
    ON blue_colibri_coaching_sessions(user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_bc_coaching_contractor
    ON blue_colibri_coaching_sessions(contractor_id);

CREATE INDEX IF NOT EXISTS idx_bc_coaching_coach
    ON blue_colibri_coaching_sessions(coach_user_id)
    WHERE coach_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bc_coaching_status
    ON blue_colibri_coaching_sessions(status)
    WHERE status = 'scheduled';

COMMENT ON TABLE blue_colibri_coaching_sessions IS
    'Tracks 1-on-1 coaching sessions. coach_notes are restricted to '
    'coach/HR roles in application layer. Can be linked to an intervention.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 6: blue_colibri_team_metrics
-- Purpose: Aggregated team-level wellbeing statistics.
-- PRIVACY: Only stores data when team has >= 5 members (CHECK constraint).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blue_colibri_team_metrics (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id           UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    team_id                 UUID,          -- organizational_units.id or manager user_id
    team_name               VARCHAR(255),  -- Denormalised for reporting convenience

    metric_date             DATE NOT NULL,

    -- Privacy: refuse to store for teams smaller than 5
    employee_count          INTEGER NOT NULL CHECK (employee_count >= 5),

    -- Aggregated scores (averages across team)
    avg_mood_score          DECIMAL(4,2),
    avg_stress_level        DECIMAL(4,2),
    avg_burnout_score       DECIMAL(5,2),
    avg_engagement_score    DECIMAL(5,2),

    -- Risk distribution: {"green": 10, "yellow": 3, "red": 2}
    risk_distribution       JSONB DEFAULT '{"green":0,"yellow":0,"red":0}'::jsonb,

    -- Participation
    pulse_response_rate     DECIMAL(5,2),  -- % of team who submitted pulse this period

    -- Trends (change since previous period)
    mood_trend              DECIMAL(4,2),
    stress_trend            DECIMAL(4,2),

    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_team_metric_date UNIQUE (contractor_id, team_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_bc_team_metrics_date
    ON blue_colibri_team_metrics(contractor_id, team_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_bc_team_metrics_contractor
    ON blue_colibri_team_metrics(contractor_id, metric_date DESC);

COMMENT ON TABLE blue_colibri_team_metrics IS
    'Aggregated team wellbeing metrics. PRIVACY: employee_count must be >= 5 '
    '(enforced by CHECK constraint) to prevent individual identification. '
    'No individual employee data stored — only averages and distributions.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 7: blue_colibri_ml_predictions
-- Purpose: ML model outputs for turnover risk and burnout trend prediction.
-- Populated by scheduled cron jobs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blue_colibri_ml_predictions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id               UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    prediction_date             DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Risk scores
    turnover_risk_score         DECIMAL(5,2) NOT NULL
                                CHECK (turnover_risk_score BETWEEN 0 AND 100),
    burnout_progression_trend   VARCHAR(20) NOT NULL
                                CHECK (burnout_progression_trend IN ('improving', 'stable', 'declining')),
    risk_level                  VARCHAR(20) NOT NULL DEFAULT 'green'
                                CHECK (risk_level IN ('green', 'yellow', 'red')),

    -- Model metadata
    recommended_interventions   TEXT[],
    model_version               VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    confidence_score            DECIMAL(5,2) CHECK (confidence_score BETWEEN 0 AND 100),

    -- Feature inputs (what the model saw)
    features                    JSONB DEFAULT '{}'::jsonb,
    top_risk_factors            JSONB DEFAULT '[]'::jsonb,

    -- Outcome tracking (for model validation)
    actual_outcome              VARCHAR(30) CHECK (actual_outcome IN (
                                    'stayed', 'voluntary_exit', 'involuntary_exit',
                                    'internal_transfer', 'sick_leave', NULL
                                )),
    outcome_date                DATE,

    -- Auto-trigger
    intervention_triggered      BOOLEAN NOT NULL DEFAULT false,
    intervention_id             UUID REFERENCES blue_colibri_interventions(id) ON DELETE SET NULL,

    created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ml_prediction_user_date UNIQUE (user_id, prediction_date, model_version)
);

CREATE INDEX IF NOT EXISTS idx_bc_ml_user_date
    ON blue_colibri_ml_predictions(user_id, prediction_date DESC);

CREATE INDEX IF NOT EXISTS idx_bc_ml_risk
    ON blue_colibri_ml_predictions(contractor_id, risk_level, prediction_date DESC);

CREATE INDEX IF NOT EXISTS idx_bc_ml_turnover
    ON blue_colibri_ml_predictions(contractor_id, turnover_risk_score DESC)
    WHERE risk_level = 'red';

COMMENT ON TABLE blue_colibri_ml_predictions IS
    'ML-generated turnover and burnout risk predictions. Updated daily by cron. '
    'Features JSONB stores input signals; top_risk_factors shows key drivers. '
    'actual_outcome is set later for model validation.';


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY POLICIES
-- Uses existing helper functions from migration 057:
--   app_current_user_id(), app_current_contractor_id(),
--   app_current_role(), app_is_superadmin()
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. blue_colibri_questions (global, read-only for all authenticated) ──

DO $$ BEGIN
    ALTER TABLE blue_colibri_questions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blue_colibri_questions FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS bc_questions_select ON blue_colibri_questions;
CREATE POLICY bc_questions_select ON blue_colibri_questions
    FOR SELECT
    USING (true);  -- All authenticated users can read questions

DROP POLICY IF EXISTS bc_questions_admin ON blue_colibri_questions;
CREATE POLICY bc_questions_admin ON blue_colibri_questions
    FOR ALL
    USING (
        app_is_superadmin()
        OR app_current_role() IN ('admin', 'data_controller')
    );

-- ── 2. blue_colibri_pulse_surveys (own data + admin) ──

DO $$ BEGIN
    ALTER TABLE blue_colibri_pulse_surveys ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blue_colibri_pulse_surveys FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS bc_pulse_own ON blue_colibri_pulse_surveys;
CREATE POLICY bc_pulse_own ON blue_colibri_pulse_surveys
    FOR ALL
    USING (
        user_id = app_current_user_id()
        AND contractor_id = app_current_contractor_id()
    );

DROP POLICY IF EXISTS bc_pulse_admin ON blue_colibri_pulse_surveys;
CREATE POLICY bc_pulse_admin ON blue_colibri_pulse_surveys
    FOR SELECT
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

-- ── 3. blue_colibri_assessments (own data + admin) ──

DO $$ BEGIN
    ALTER TABLE blue_colibri_assessments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blue_colibri_assessments FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS bc_assessment_own ON blue_colibri_assessments;
CREATE POLICY bc_assessment_own ON blue_colibri_assessments
    FOR ALL
    USING (
        user_id = app_current_user_id()
        AND contractor_id = app_current_contractor_id()
    );

DROP POLICY IF EXISTS bc_assessment_admin ON blue_colibri_assessments;
CREATE POLICY bc_assessment_admin ON blue_colibri_assessments
    FOR SELECT
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

-- ── 4. blue_colibri_interventions (own data + admin) ──

DO $$ BEGIN
    ALTER TABLE blue_colibri_interventions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blue_colibri_interventions FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS bc_intervention_own ON blue_colibri_interventions;
CREATE POLICY bc_intervention_own ON blue_colibri_interventions
    FOR ALL
    USING (
        user_id = app_current_user_id()
        AND contractor_id = app_current_contractor_id()
    );

DROP POLICY IF EXISTS bc_intervention_admin ON blue_colibri_interventions;
CREATE POLICY bc_intervention_admin ON blue_colibri_interventions
    FOR ALL
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

-- ── 5. blue_colibri_coaching_sessions (own + coach + admin) ──

DO $$ BEGIN
    ALTER TABLE blue_colibri_coaching_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blue_colibri_coaching_sessions FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS bc_coaching_own ON blue_colibri_coaching_sessions;
CREATE POLICY bc_coaching_own ON blue_colibri_coaching_sessions
    FOR ALL
    USING (
        (user_id = app_current_user_id() OR coach_user_id = app_current_user_id())
        AND contractor_id = app_current_contractor_id()
    );

DROP POLICY IF EXISTS bc_coaching_admin ON blue_colibri_coaching_sessions;
CREATE POLICY bc_coaching_admin ON blue_colibri_coaching_sessions
    FOR ALL
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

-- ── 6. blue_colibri_team_metrics (manager/admin only) ──

DO $$ BEGIN
    ALTER TABLE blue_colibri_team_metrics ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blue_colibri_team_metrics FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS bc_team_metrics_admin ON blue_colibri_team_metrics;
CREATE POLICY bc_team_metrics_admin ON blue_colibri_team_metrics
    FOR SELECT
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller', 'task_owner')
        )
    );

DROP POLICY IF EXISTS bc_team_metrics_insert ON blue_colibri_team_metrics;
CREATE POLICY bc_team_metrics_insert ON blue_colibri_team_metrics
    FOR INSERT
    WITH CHECK (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

-- ── 7. blue_colibri_ml_predictions (admin only — employees never see raw ML) ──

DO $$ BEGIN
    ALTER TABLE blue_colibri_ml_predictions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blue_colibri_ml_predictions FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS bc_ml_admin ON blue_colibri_ml_predictions;
CREATE POLICY bc_ml_admin ON blue_colibri_ml_predictions
    FOR ALL
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA: Questions
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Pulse Questions (5 items, emoji_5 / scale_1_10) ──

INSERT INTO blue_colibri_questions (question_type, question_text, question_text_en, response_type, category, display_order)
VALUES
    ('pulse', 'Hogyan érzed magad ma?',
     'How are you feeling today?',
     'emoji_5', 'mood', 1),

    ('pulse', 'Mennyire érzed stresszesnek a mai napodat? (1=egyáltalán nem, 10=nagyon)',
     'How stressful is your day? (1=not at all, 10=very)',
     'scale_1_10', 'stress', 2),

    ('pulse', 'Milyen volt az alvásod minősége az elmúlt éjszaka? (1=nagyon rossz, 10=kiváló)',
     'How was your sleep quality last night? (1=very poor, 10=excellent)',
     'scale_1_10', 'sleep', 3),

    ('pulse', 'Mennyire érzed kezelhetőnek a jelenlegi munkaterhelésedet? (1=túlterhelt, 10=kényelmes)',
     'How manageable is your current workload? (1=overwhelmed, 10=comfortable)',
     'scale_1_10', 'workload', 4),

    ('pulse', 'Mennyire érzed magad motiváltnak és elkötelezetnek ma? (1=egyáltalán nem, 10=nagyon)',
     'How motivated and engaged do you feel today? (1=not at all, 10=very)',
     'scale_1_10', 'engagement', 5)
ON CONFLICT DO NOTHING;

-- ── Assessment Questions: Burnout (MBI-based, 9 items) ──

INSERT INTO blue_colibri_questions (question_type, question_text, question_text_en, response_type, category, display_order)
VALUES
    -- Emotional Exhaustion (EE) — 3 items
    ('assessment', 'Érzelmileg kimerültnek érzem magam a munkám miatt.',
     'I feel emotionally drained from my work.',
     'scale_1_10', 'emotional_exhaustion', 101),

    ('assessment', 'Kihasználtnak érzem magam a munkanap végére.',
     'I feel used up at the end of the workday.',
     'scale_1_10', 'emotional_exhaustion', 102),

    ('assessment', 'Fáradtnak érzem magam reggel, amikor szembesülök egy újabb munkanappal.',
     'I feel fatigued when I get up and face another day on the job.',
     'scale_1_10', 'emotional_exhaustion', 103),

    -- Depersonalization (DP) — 3 items
    ('assessment', 'Közönyösebbé váltam az emberek iránt, amióta ezt a munkát végzem.',
     'I have become more callous toward people since I took this job.',
     'scale_1_10', 'depersonalization', 104),

    ('assessment', 'Aggódom, hogy ez a munka érzelmileg megkeményít.',
     'I worry that this job is hardening me emotionally.',
     'scale_1_10', 'depersonalization', 105),

    ('assessment', 'Úgy érzem, a végső határaimnál járok.',
     'I feel like I am at the end of my rope.',
     'scale_1_10', 'depersonalization', 106),

    -- Personal Accomplishment (PA) — 3 items (reverse-scored in app)
    ('assessment', 'Úgy érzem, pozitívan befolyásolom mások életét a munkámon keresztül.',
     'I feel I am positively influencing people''s lives through my work.',
     'scale_1_10', 'personal_accomplishment', 107),

    ('assessment', 'Nagyon energikusnak érzem magam a munkámban.',
     'I feel very energetic at work.',
     'scale_1_10', 'personal_accomplishment', 108),

    ('assessment', 'Sok értékes dolgot értem el ebben a munkában.',
     'I have accomplished many worthwhile things in this job.',
     'scale_1_10', 'personal_accomplishment', 109),

    -- ── Assessment Questions: Engagement (UWES-based, 6 items) ──

    -- Vigor — 2 items
    ('assessment', 'A munkámban energikusnak és mentálisan rugalmasnak érzem magam.',
     'At my work, I feel bursting with energy and mentally resilient.',
     'scale_1_10', 'vigor', 201),

    ('assessment', 'Amikor reggel felkelek, kedvem van dolgozni.',
     'When I get up in the morning, I feel like going to work.',
     'scale_1_10', 'vigor', 202),

    -- Dedication — 2 items
    ('assessment', 'Lelkes vagyok a munkám iránt, és inspirál engem.',
     'I am enthusiastic about my job, and it inspires me.',
     'scale_1_10', 'dedication', 203),

    ('assessment', 'Büszke vagyok arra a munkára, amit végzek.',
     'I am proud of the work that I do.',
     'scale_1_10', 'dedication', 204),

    -- Absorption — 2 items
    ('assessment', 'Az idő repül, amikor dolgozom — teljesen elmerülök benne.',
     'Time flies when I am working — I am fully immersed.',
     'scale_1_10', 'absorption', 205),

    ('assessment', 'Boldognak érzem magam, amikor intenzíven dolgozom.',
     'I feel happy when I am working intensely.',
     'scale_1_10', 'absorption', 206)
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at trigger (reuse existing pattern if available, otherwise create)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION bc_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_bc_questions_updated
        BEFORE UPDATE ON blue_colibri_questions
        FOR EACH ROW EXECUTE FUNCTION bc_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_bc_interventions_updated
        BEFORE UPDATE ON blue_colibri_interventions
        FOR EACH ROW EXECUTE FUNCTION bc_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_bc_coaching_updated
        BEFORE UPDATE ON blue_colibri_coaching_sessions
        FOR EACH ROW EXECUTE FUNCTION bc_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
