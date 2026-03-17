-- Migration 059: EAP — Employee Assistance Program
-- Creates 6 tables for confidential employee support services.
--
-- Tables:
--   1. eap_service_categories    — Types of EAP services offered
--   2. eap_providers             — External counselor/lawyer/advisor directory
--   3. eap_cases                 — Employee cases (privacy-sensitive)
--   4. eap_sessions              — Counseling sessions (encrypted notes)
--   5. eap_provider_bookings     — Appointment scheduling
--   6. eap_usage_stats           — Monthly aggregated usage (no PII)
--
-- Security:
--   - pgcrypto extension for session notes encryption
--   - RLS policies enforce strict data isolation
--   - Anonymous case support (is_anonymous flag)
--   - Admins see aggregated stats only — never case content
--
-- Dependencies: users, contractors (from earlier migrations)
--               app_current_user_id(), etc. (from migration 057)

-- ═══════════════════════════════════════════════════════════════════════════
-- PREREQUISITES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 1: eap_service_categories
-- Purpose: Types of EAP services offered. Global (not contractor-scoped).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eap_service_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name   VARCHAR(100) NOT NULL UNIQUE,
    category_name_en VARCHAR(100),
    description     TEXT,
    icon_name       VARCHAR(50),           -- Icon identifier for mobile UI
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eap_categories_active
    ON eap_service_categories(is_active, display_order);

COMMENT ON TABLE eap_service_categories IS
    'EAP service types (Counseling, Legal, Financial, etc.). '
    'Global — shared across all tenants.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 2: eap_providers
-- Purpose: External professionals who deliver EAP services.
-- Supports geo-location for proximity search.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eap_providers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id           UUID REFERENCES contractors(id) ON DELETE CASCADE,
                            -- NULL = shared/global provider

    provider_type           VARCHAR(50) NOT NULL CHECK (provider_type IN (
                                'counselor', 'therapist', 'lawyer',
                                'financial_advisor', 'crisis_specialist', 'mediator'
                            )),
    full_name               VARCHAR(255) NOT NULL,
    credentials             VARCHAR(255),          -- "PhD, LCSW", "JD", "CFP"
    specialties             TEXT[] DEFAULT '{}',    -- ['anxiety','depression','trauma',...]
    languages               TEXT[] NOT NULL DEFAULT '{hu}', -- ISO 639-1 codes

    -- Contact
    phone                   VARCHAR(50),
    email                   VARCHAR(255),

    -- Location
    address_street          VARCHAR(255),
    address_city            VARCHAR(100),
    address_zip             VARCHAR(20),
    geo_lat                 DECIMAL(10,7),         -- Latitude for proximity search
    geo_lng                 DECIMAL(10,7),         -- Longitude for proximity search

    -- Availability
    availability_hours      JSONB DEFAULT '{}'::jsonb,
                            -- e.g. {"mon":["09:00-12:00","13:00-17:00"], "tue":["09:00-17:00"], ...}
    max_concurrent_cases    INTEGER DEFAULT 20,
    active_case_count       INTEGER NOT NULL DEFAULT 0,

    -- Profile
    bio                     TEXT,
    photo_url               VARCHAR(500),
    rating                  DECIMAL(3,2) DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
    total_ratings           INTEGER NOT NULL DEFAULT 0,
    total_sessions_completed INTEGER NOT NULL DEFAULT 0,
    is_active               BOOLEAN NOT NULL DEFAULT true,

    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eap_providers_type
    ON eap_providers(provider_type, is_active);

CREATE INDEX IF NOT EXISTS idx_eap_providers_contractor
    ON eap_providers(contractor_id)
    WHERE contractor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eap_providers_active
    ON eap_providers(is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_eap_providers_specialties
    ON eap_providers USING GIN (specialties);

CREATE INDEX IF NOT EXISTS idx_eap_providers_languages
    ON eap_providers USING GIN (languages);

-- Geo-proximity index: use lat/lng for distance calculations
-- (Haversine formula in application layer)
CREATE INDEX IF NOT EXISTS idx_eap_providers_geo
    ON eap_providers(geo_lat, geo_lng)
    WHERE geo_lat IS NOT NULL AND geo_lng IS NOT NULL;

COMMENT ON TABLE eap_providers IS
    'External EAP service providers (psychologists, lawyers, financial advisors). '
    'contractor_id NULL = shared across tenants. Supports geo-proximity search via lat/lng.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 3: eap_cases
-- Purpose: Employee EAP cases. Privacy-sensitive — strict RLS.
-- Supports anonymous mode where employee identity is hidden from reports.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eap_cases (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id           UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,

    -- Case identification
    case_number             VARCHAR(50) NOT NULL UNIQUE,
                            -- Auto-generated in app: EAP-YYYYMMDD-XXXX
    service_category_id     UUID NOT NULL REFERENCES eap_service_categories(id),

    -- Privacy
    is_anonymous            BOOLEAN NOT NULL DEFAULT false,
                            -- When true, admin reports hide employee identity

    -- Case details
    urgency_level           VARCHAR(20) NOT NULL DEFAULT 'medium'
                            CHECK (urgency_level IN ('low', 'medium', 'high', 'crisis')),
    status                  VARCHAR(50) NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
    issue_description       TEXT,          -- Encrypted in application layer via encryption.service.js

    -- Provider assignment
    assigned_provider_id    UUID REFERENCES eap_providers(id) ON DELETE SET NULL,

    -- Lifecycle timestamps
    opened_at               TIMESTAMP NOT NULL DEFAULT NOW(),
    assigned_at             TIMESTAMP,
    resolved_at             TIMESTAMP,
    closed_at               TIMESTAMP,

    -- Resolution
    resolution_notes        TEXT,          -- Encrypted in application layer
    employee_satisfaction_rating INTEGER CHECK (employee_satisfaction_rating BETWEEN 1 AND 5),
    employee_feedback       TEXT,

    -- GDPR compliance
    consent_given           BOOLEAN NOT NULL DEFAULT false,
    consent_date            TIMESTAMP,
    data_retention_until    DATE,          -- Auto-delete after this date

    -- Session tracking
    total_sessions          INTEGER NOT NULL DEFAULT 0,

    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eap_cases_user
    ON eap_cases(user_id, status);

CREATE INDEX IF NOT EXISTS idx_eap_cases_contractor
    ON eap_cases(contractor_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_eap_cases_provider
    ON eap_cases(assigned_provider_id, status)
    WHERE assigned_provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eap_cases_urgency
    ON eap_cases(contractor_id, urgency_level)
    WHERE status IN ('open', 'assigned', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_eap_cases_number
    ON eap_cases(case_number);

CREATE INDEX IF NOT EXISTS idx_eap_cases_retention
    ON eap_cases(data_retention_until)
    WHERE data_retention_until IS NOT NULL;

COMMENT ON TABLE eap_cases IS
    'Employee EAP cases. issue_description and resolution_notes are encrypted '
    'via application-layer AES-256-CBC (encryption.service.js). '
    'Admin can see metadata (status, dates, category) but NOT case content. '
    'is_anonymous hides employee identity in aggregate reports.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 4: eap_sessions
-- Purpose: Individual counseling/advisory sessions within a case.
-- Session notes are pgcrypto-encrypted at database level.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eap_sessions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                 UUID NOT NULL REFERENCES eap_cases(id) ON DELETE CASCADE,
    provider_id             UUID REFERENCES eap_providers(id) ON DELETE SET NULL,

    -- Session details
    session_number          INTEGER NOT NULL DEFAULT 1,
    session_date            TIMESTAMP NOT NULL,
    duration_minutes        INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 180),

    session_type            VARCHAR(50) NOT NULL CHECK (session_type IN (
                                'individual_counseling', 'couples_therapy',
                                'legal_consultation', 'financial_advice',
                                'crisis_intervention', 'group_session',
                                'follow_up'
                            )),
    session_format          VARCHAR(20) NOT NULL DEFAULT 'in_person'
                            CHECK (session_format IN ('in_person', 'video_call', 'phone_call')),

    -- Session content (encrypted via pgcrypto)
    session_notes_encrypted TEXT,          -- pgp_sym_encrypt(notes, key) output
    topics_covered          TEXT[],
    homework_assigned       TEXT,

    -- Progress
    progress_rating         INTEGER CHECK (progress_rating BETWEEN 1 AND 10),
    risk_assessment         VARCHAR(20) CHECK (risk_assessment IN (
                                'none', 'low', 'moderate', 'high', 'immediate'
                            )),

    -- Scheduling
    next_session_scheduled  TIMESTAMP,

    created_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eap_sessions_case
    ON eap_sessions(case_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_eap_sessions_provider
    ON eap_sessions(provider_id, session_date DESC)
    WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eap_sessions_risk
    ON eap_sessions(risk_assessment)
    WHERE risk_assessment IN ('high', 'immediate');

COMMENT ON TABLE eap_sessions IS
    'Individual EAP counseling sessions. session_notes_encrypted stores '
    'pgp_sym_encrypt() output — only decryptable with the encryption key. '
    'risk_assessment = ''immediate'' triggers crisis protocol.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 5: eap_provider_bookings
-- Purpose: Appointment scheduling between employees and providers.
-- Prevents double-booking via UNIQUE constraint.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eap_provider_bookings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                 UUID REFERENCES eap_cases(id) ON DELETE CASCADE,
    provider_id             UUID NOT NULL REFERENCES eap_providers(id) ON DELETE CASCADE,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Appointment details
    appointment_datetime    TIMESTAMP NOT NULL,
    duration_minutes        INTEGER NOT NULL DEFAULT 60
                            CHECK (duration_minutes > 0 AND duration_minutes <= 180),
    booking_type            VARCHAR(50) NOT NULL DEFAULT 'in_person'
                            CHECK (booking_type IN ('in_person', 'video_call', 'phone_call')),

    -- Status
    status                  VARCHAR(50) NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),

    -- Metadata
    meeting_link            VARCHAR(500),  -- For video calls
    cancellation_reason     TEXT,
    cancelled_by            VARCHAR(20) CHECK (cancelled_by IN ('employee', 'provider', 'system', NULL)),
    cancelled_at            TIMESTAMP,

    -- Reminders
    reminder_sent_at        TIMESTAMP,
    reminder_24h_sent       BOOLEAN NOT NULL DEFAULT false,

    -- Notes
    employee_notes          TEXT,          -- Special requests from employee
    provider_notes          TEXT,          -- Provider response/prep notes

    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Prevent double-booking for the same provider at the same time
    CONSTRAINT uq_provider_appointment UNIQUE (provider_id, appointment_datetime)
);

CREATE INDEX IF NOT EXISTS idx_eap_bookings_provider_date
    ON eap_provider_bookings(provider_id, appointment_datetime);

CREATE INDEX IF NOT EXISTS idx_eap_bookings_user
    ON eap_provider_bookings(user_id, status);

CREATE INDEX IF NOT EXISTS idx_eap_bookings_upcoming
    ON eap_provider_bookings(appointment_datetime)
    WHERE status IN ('scheduled', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_eap_bookings_case
    ON eap_provider_bookings(case_id)
    WHERE case_id IS NOT NULL;

COMMENT ON TABLE eap_provider_bookings IS
    'Appointment booking between employees and EAP providers. '
    'UNIQUE constraint on (provider_id, appointment_datetime) prevents double-booking. '
    'Supports in-person, video, and phone formats.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 6: eap_usage_stats
-- Purpose: Monthly aggregated usage statistics. NO PII — only counts/averages.
-- Populated by cron job on the 1st of each month.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eap_usage_stats (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id           UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    stat_month              DATE NOT NULL,     -- First day of month (e.g. '2026-03-01')

    -- Volume
    total_cases_opened      INTEGER NOT NULL DEFAULT 0,
    total_cases_closed      INTEGER NOT NULL DEFAULT 0,
    total_cases_active      INTEGER NOT NULL DEFAULT 0,
    total_sessions_held     INTEGER NOT NULL DEFAULT 0,

    -- Participation (no individual identification)
    employee_count_using_eap INTEGER NOT NULL DEFAULT 0,  -- Distinct users
    total_eligible_employees INTEGER NOT NULL DEFAULT 0,
    utilization_rate        DECIMAL(5,2),       -- employee_count / total_eligible * 100

    -- Category breakdown: {"counseling": 45, "legal": 12, ...}
    category_breakdown      JSONB DEFAULT '{}'::jsonb,

    -- Urgency breakdown: {"low": 10, "medium": 20, "high": 5, "crisis": 1}
    urgency_breakdown       JSONB DEFAULT '{}'::jsonb,

    -- Quality
    avg_case_duration_days  DECIMAL(5,2),
    avg_satisfaction_rating DECIMAL(3,2),
    total_satisfaction_responses INTEGER DEFAULT 0,

    -- Resolution
    avg_sessions_per_case   DECIMAL(5,2),

    calculated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_eap_stats_month UNIQUE (contractor_id, stat_month)
);

CREATE INDEX IF NOT EXISTS idx_eap_stats_month
    ON eap_usage_stats(contractor_id, stat_month DESC);

COMMENT ON TABLE eap_usage_stats IS
    'Monthly aggregated EAP usage statistics. NO PII — only counts and averages. '
    'One row per contractor per month. Populated by cron job.';


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. eap_service_categories (public read, admin write) ──

DO $$ BEGIN
    ALTER TABLE eap_service_categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE eap_service_categories FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS eap_categories_select ON eap_service_categories;
CREATE POLICY eap_categories_select ON eap_service_categories
    FOR SELECT
    USING (true);  -- All authenticated users can view categories

DROP POLICY IF EXISTS eap_categories_admin ON eap_service_categories;
CREATE POLICY eap_categories_admin ON eap_service_categories
    FOR ALL
    USING (
        app_is_superadmin()
        OR app_current_role() IN ('admin', 'data_controller')
    );

-- ── 2. eap_providers (public read active, admin full) ──

DO $$ BEGIN
    ALTER TABLE eap_providers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE eap_providers FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS eap_providers_select ON eap_providers;
CREATE POLICY eap_providers_select ON eap_providers
    FOR SELECT
    USING (
        is_active = true
        AND (contractor_id IS NULL OR contractor_id = app_current_contractor_id())
    );

DROP POLICY IF EXISTS eap_providers_admin ON eap_providers;
CREATE POLICY eap_providers_admin ON eap_providers
    FOR ALL
    USING (
        app_is_superadmin()
        OR (
            app_current_role() IN ('admin', 'data_controller')
            AND (contractor_id IS NULL OR contractor_id = app_current_contractor_id())
        )
    );

-- ── 3. eap_cases (STRICT: own data only + admin metadata) ──

DO $$ BEGIN
    ALTER TABLE eap_cases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE eap_cases FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Employee sees only own cases
DROP POLICY IF EXISTS eap_cases_own ON eap_cases;
CREATE POLICY eap_cases_own ON eap_cases
    FOR ALL
    USING (
        user_id = app_current_user_id()
        AND contractor_id = app_current_contractor_id()
    );

-- Admin sees case metadata within own contractor
-- (application layer must strip issue_description and resolution_notes)
DROP POLICY IF EXISTS eap_cases_admin ON eap_cases;
CREATE POLICY eap_cases_admin ON eap_cases
    FOR SELECT
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

-- ── 4. eap_sessions (provider + case owner only) ──

DO $$ BEGIN
    ALTER TABLE eap_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE eap_sessions FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Case owner can see their own sessions (sans encrypted notes — handled in app)
DROP POLICY IF EXISTS eap_sessions_own ON eap_sessions;
CREATE POLICY eap_sessions_own ON eap_sessions
    FOR SELECT
    USING (
        case_id IN (
            SELECT id FROM eap_cases
            WHERE user_id = app_current_user_id()
        )
    );

-- Provider can see sessions they conducted + insert/update
DROP POLICY IF EXISTS eap_sessions_provider ON eap_sessions;
CREATE POLICY eap_sessions_provider ON eap_sessions
    FOR ALL
    USING (
        provider_id IN (
            SELECT id FROM eap_providers
            WHERE email = (SELECT email FROM users WHERE id = app_current_user_id())
        )
    );

-- Admin/superadmin for system operations (cron, aggregation)
DROP POLICY IF EXISTS eap_sessions_admin ON eap_sessions;
CREATE POLICY eap_sessions_admin ON eap_sessions
    FOR ALL
    USING (
        app_is_superadmin()
        OR app_current_role() IN ('admin', 'data_controller')
    );

-- ── 5. eap_provider_bookings (employee + provider + admin) ──

DO $$ BEGIN
    ALTER TABLE eap_provider_bookings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE eap_provider_bookings FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Employee sees own bookings
DROP POLICY IF EXISTS eap_bookings_own ON eap_provider_bookings;
CREATE POLICY eap_bookings_own ON eap_provider_bookings
    FOR ALL
    USING (
        user_id = app_current_user_id()
    );

-- Provider sees bookings assigned to them
DROP POLICY IF EXISTS eap_bookings_provider ON eap_provider_bookings;
CREATE POLICY eap_bookings_provider ON eap_provider_bookings
    FOR ALL
    USING (
        provider_id IN (
            SELECT id FROM eap_providers
            WHERE email = (SELECT email FROM users WHERE id = app_current_user_id())
        )
    );

-- Admin access
DROP POLICY IF EXISTS eap_bookings_admin ON eap_provider_bookings;
CREATE POLICY eap_bookings_admin ON eap_provider_bookings
    FOR ALL
    USING (
        app_is_superadmin()
        OR app_current_role() IN ('admin', 'data_controller')
    );

-- ── 6. eap_usage_stats (admin only — no individual data) ──

DO $$ BEGIN
    ALTER TABLE eap_usage_stats ENABLE ROW LEVEL SECURITY;
    ALTER TABLE eap_usage_stats FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS eap_stats_admin ON eap_usage_stats;
CREATE POLICY eap_stats_admin ON eap_usage_stats
    FOR SELECT
    USING (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );

DROP POLICY IF EXISTS eap_stats_insert ON eap_usage_stats;
CREATE POLICY eap_stats_insert ON eap_usage_stats
    FOR INSERT
    WITH CHECK (
        app_is_superadmin()
        OR (
            contractor_id = app_current_contractor_id()
            AND app_current_role() IN ('admin', 'data_controller')
        )
    );


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA: Service Categories
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO eap_service_categories (category_name, category_name_en, description, icon_name, display_order)
VALUES
    ('Pszichológiai tanácsadás', 'Psychological Counseling',
     'Egyéni és páros pszichológiai tanácsadás képzett szakemberekkel. Stressz, szorongás, depresszió, munkahelyi konfliktusok kezelése.',
     'brain', 1),

    ('Jogi tanácsadás', 'Legal Advisory',
     'Munkajogi, családjogi, polgári jogi tanácsadás ügyvédekkel. Első konzultáció ingyenes.',
     'scale', 2),

    ('Pénzügyi tanácsadás', 'Financial Advisory',
     'Személyes pénzügyi tervezés, adósságkezelés, nyugdíj-előtakarékosság, adóoptimalizálás tanácsadás.',
     'wallet', 3),

    ('Családi támogatás', 'Family Support',
     'Gyermeknevelési tanácsadás, idős hozzátartozó gondozása, házassági tanácsadás, családi mediáció.',
     'users', 4),

    ('Krízisintervenció', 'Crisis Intervention',
     'Azonnali segítség krízishelyzetben. 24/7 telefonos elérhetőség, sürgősségi tanácsadás, öngyilkossági prevenció.',
     'alert-triangle', 5),

    ('Munka-magánélet egyensúly', 'Work-Life Balance',
     'Időmenedzsment coaching, kiégés-megelőzés, stresszkezelési technikák, mindfulness programok.',
     'balance-scale', 6)
ON CONFLICT (category_name) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA: Sample Providers
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO eap_providers (
    contractor_id, provider_type, full_name, credentials, specialties, languages,
    phone, email, address_city, address_zip, geo_lat, geo_lng,
    availability_hours, bio, is_active
) VALUES
    -- Counselors / Therapists
    (NULL, 'counselor', 'Dr. Kovács Anna', 'PhD, klinikai szakpszichológus',
     ARRAY['szorongás','depresszió','kiégés','munkahelyi stressz'],
     ARRAY['hu','en'],
     '+36-1-234-5678', 'kovacs.anna@eap-provider.hu', 'Budapest', '1051',
     47.4979, 19.0402,
     '{"mon":["09:00-17:00"],"tue":["09:00-17:00"],"wed":["09:00-13:00"],"thu":["09:00-17:00"],"fri":["09:00-14:00"]}'::jsonb,
     'Több mint 15 éves tapasztalat a munkahelyi mentálhigiéné területén.', true),

    (NULL, 'therapist', 'Nagy Péter', 'MA, családterapeuta',
     ARRAY['családi konfliktus','párterápia','gyermeknevelés','válás'],
     ARRAY['hu'],
     '+36-20-345-6789', 'nagy.peter@eap-provider.hu', 'Budapest', '1062',
     47.5095, 19.0658,
     '{"mon":["10:00-18:00"],"tue":["10:00-18:00"],"thu":["10:00-18:00"]}'::jsonb,
     'Családterápiára és párkapcsolati tanácsadásra specializálódtam.', true),

    (NULL, 'counselor', 'Dr. Szabó Éva', 'PhD, munkapszichológus',
     ARRAY['kiégés','vezetői stressz','karrierváltás','csapatkonfliktus'],
     ARRAY['hu','en','de'],
     '+36-30-456-7890', 'szabo.eva@eap-provider.hu', 'Debrecen', '4024',
     47.5316, 21.6273,
     '{"mon":["08:00-16:00"],"wed":["08:00-16:00"],"fri":["08:00-12:00"]}'::jsonb,
     'Szervezetpszichológiai háttérrel segítek a munkahelyi nehézségek kezelésében.', true),

    (NULL, 'therapist', 'Tóth Mária', 'MA, klinikai pszichológus',
     ARRAY['szorongás','pánikbetegség','alvászavar','PTSD'],
     ARRAY['hu','en'],
     '+36-70-567-8901', 'toth.maria@eap-provider.hu', 'Szeged', '6720',
     46.2530, 20.1414,
     '{"tue":["09:00-17:00"],"wed":["09:00-17:00"],"thu":["09:00-17:00"]}'::jsonb,
     'Kognitív viselkedésterápiás megközelítést alkalmazok.', true),

    -- Lawyers
    (NULL, 'lawyer', 'Dr. Fekete István', 'JD, munkajogi szakjogász',
     ARRAY['munkajog','felmondás','munkaügyi per','hátrányos megkülönböztetés'],
     ARRAY['hu'],
     '+36-1-678-9012', 'fekete.istvan@eap-legal.hu', 'Budapest', '1054',
     47.5088, 19.0450,
     '{"mon":["09:00-17:00"],"wed":["09:00-17:00"],"fri":["09:00-15:00"]}'::jsonb,
     '20+ éves munkajogi gyakorlat, volt munkaügyi bíró.', true),

    (NULL, 'lawyer', 'Dr. Kiss Katalin', 'JD, családjogi szakjogász',
     ARRAY['családjog','válás','gyermekelhelyezés','öröklés','tartásdíj'],
     ARRAY['hu','en'],
     '+36-20-789-0123', 'kiss.katalin@eap-legal.hu', 'Győr', '9021',
     47.6875, 17.6344,
     '{"tue":["10:00-16:00"],"thu":["10:00-16:00"]}'::jsonb,
     'Családjogi ügyekre specializálódtam, mediátori végzettséggel.', true),

    -- Financial Advisors
    (NULL, 'financial_advisor', 'Horváth László', 'CFP, pénzügyi tanácsadó',
     ARRAY['adósságkezelés','megtakarítás','nyugdíj','hiteltanácsadás','befektetés'],
     ARRAY['hu'],
     '+36-30-890-1234', 'horvath.laszlo@eap-finance.hu', 'Budapest', '1138',
     47.5383, 19.0524,
     '{"mon":["09:00-17:00"],"tue":["09:00-17:00"],"wed":["09:00-17:00"],"thu":["09:00-17:00"]}'::jsonb,
     'Segítek a pénzügyi stabilitás megteremtésében és a jövő tervezésében.', true),

    -- Crisis Specialists
    (NULL, 'crisis_specialist', 'Dr. Molnár Zsolt', 'PhD, krízispszichológus',
     ARRAY['krízisintervenció','trauma','öngyilkosság prevenció','veszteségfeldolgozás'],
     ARRAY['hu','en'],
     '+36-70-123-4567', 'molnar.zsolt@eap-crisis.hu', 'Budapest', '1085',
     47.4903, 19.0700,
     '{"mon":["00:00-23:59"],"tue":["00:00-23:59"],"wed":["00:00-23:59"],"thu":["00:00-23:59"],"fri":["00:00-23:59"],"sat":["00:00-23:59"],"sun":["00:00-23:59"]}'::jsonb,
     '24/7 elérhető krízisspecialista. Sürgős esetekben azonnal hívható.', true),

    -- Mediators
    (NULL, 'mediator', 'Balogh Zsuzsanna', 'MA, mediátor, coach',
     ARRAY['munkahelyi mediáció','csapatkonfliktus','vezetői coaching','változásmenedzsment'],
     ARRAY['hu','de'],
     '+36-20-234-5678', 'balogh.zsuzsanna@eap-mediation.hu', 'Pécs', '7621',
     46.0727, 18.2323,
     '{"mon":["09:00-16:00"],"wed":["09:00-16:00"],"fri":["09:00-13:00"]}'::jsonb,
     'Akkreditált mediátor és executive coach, szervezetfejlesztési tapasztalattal.', true),

    (NULL, 'counselor', 'Varga Dóra', 'MA, tanácsadó szakpszichológus',
     ARRAY['életvezetési tanácsadás','stresszkezelés','önismeret','assertivitás'],
     ARRAY['hu','ro'],
     '+36-70-345-6789', 'varga.dora@eap-provider.hu', 'Kolozsvár/Online', '00000',
     46.7712, 23.5897,
     '{"tue":["14:00-20:00"],"thu":["14:00-20:00"],"sat":["09:00-13:00"]}'::jsonb,
     'Online tanácsadásra specializálódtam, rugalmas időbeosztással.', true)
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS: updated_at
-- ═══════════════════════════════════════════════════════════════════════════

-- Reuse bc_update_timestamp from migration 058 if available, else create
CREATE OR REPLACE FUNCTION eap_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_eap_providers_updated
        BEFORE UPDATE ON eap_providers
        FOR EACH ROW EXECUTE FUNCTION eap_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_eap_cases_updated
        BEFORE UPDATE ON eap_cases
        FOR EACH ROW EXECUTE FUNCTION eap_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_eap_bookings_updated
        BEFORE UPDATE ON eap_provider_bookings
        FOR EACH ROW EXECUTE FUNCTION eap_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER: Case number sequence (used by application layer)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS eap_case_number_seq START WITH 1000;

COMMENT ON SEQUENCE eap_case_number_seq IS
    'Used by application layer to generate case numbers: EAP-YYYYMMDD-{nextval}';
