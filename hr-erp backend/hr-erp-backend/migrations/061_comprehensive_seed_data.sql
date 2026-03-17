-- Migration 061: Comprehensive Seed Data + Database Functions
-- Populates all 17 wellbeing tables with realistic test data.
-- Adds helper functions, materialized view, and runs ANALYZE.
--
-- Contents:
--   1. Additional assessment questions (to reach 50+ total)
--   2. Pulse survey history (30 days, multiple users)
--   3. Assessments with computed scores
--   4. Interventions (various types/statuses)
--   5. Coaching sessions
--   6. Team metrics (respecting min-5 rule)
--   7. ML predictions
--   8. Additional EAP providers
--   9. EAP cases, sessions, bookings
--   10. EAP usage stats (6 months)
--   11. Referrals (cross-module)
--   12. Notifications (multi-channel)
--   13. Audit log entries
--   14. Feedback entries
--   15. Database functions
--   16. Materialized view
--   17. ANALYZE all tables

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER: Get IDs safely (seed data depends on existing users/contractors)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_contractor_id UUID;
    v_contractor_id_2 UUID;
    v_user_ids UUID[];
    v_user_id UUID;
    v_cat_counseling UUID;
    v_cat_legal UUID;
    v_cat_financial UUID;
    v_cat_family UUID;
    v_cat_crisis UUID;
    v_cat_balance UUID;
    v_provider_id UUID;
    v_case_id UUID;
    v_session_id UUID;
    v_booking_id UUID;
    v_intervention_id UUID;
    v_assessment_id UUID;
    i INTEGER;
    v_day INTEGER;
    v_mood INTEGER;
    v_stress INTEGER;
    v_date DATE;
    v_q_id UUID;
BEGIN
    -- Get first contractor
    SELECT id INTO v_contractor_id FROM contractors ORDER BY created_at LIMIT 1;
    SELECT id INTO v_contractor_id_2 FROM contractors ORDER BY created_at OFFSET 1 LIMIT 1;
    IF v_contractor_id IS NULL THEN
        RAISE NOTICE 'No contractors found — skipping seed data';
        RETURN;
    END IF;
    IF v_contractor_id_2 IS NULL THEN
        v_contractor_id_2 := v_contractor_id;
    END IF;

    -- Get up to 8 user IDs from first contractor
    SELECT ARRAY(
        SELECT id FROM users
        WHERE contractor_id = v_contractor_id AND is_active = true
        ORDER BY created_at LIMIT 8
    ) INTO v_user_ids;

    IF array_length(v_user_ids, 1) IS NULL OR array_length(v_user_ids, 1) < 2 THEN
        RAISE NOTICE 'Need at least 2 users — skipping seed data';
        RETURN;
    END IF;

    -- Get EAP category IDs
    SELECT id INTO v_cat_counseling FROM eap_service_categories WHERE category_name LIKE '%szichológiai%' LIMIT 1;
    SELECT id INTO v_cat_legal FROM eap_service_categories WHERE category_name LIKE '%ogi%' LIMIT 1;
    SELECT id INTO v_cat_financial FROM eap_service_categories WHERE category_name LIKE '%énzügyi%' LIMIT 1;
    SELECT id INTO v_cat_family FROM eap_service_categories WHERE category_name LIKE '%saládi%' LIMIT 1;
    SELECT id INTO v_cat_crisis FROM eap_service_categories WHERE category_name LIKE '%rízis%' LIMIT 1;
    SELECT id INTO v_cat_balance FROM eap_service_categories WHERE category_name LIKE '%unka%' LIMIT 1;

    -- Get a provider
    SELECT id INTO v_provider_id FROM eap_providers WHERE is_active = true LIMIT 1;

    -- ═════════════════════════════════════════════════════════════════
    -- 1. ADDITIONAL QUESTIONS (to complement existing 20)
    -- ═════════════════════════════════════════════════════════════════

    -- More pulse questions
    INSERT INTO blue_colibri_questions (question_type, question_text, question_text_en, response_type, category, display_order) VALUES
        ('pulse', 'Mennyire érzed magad produktívnak ma?', 'How productive do you feel today?', 'scale_1_10', 'engagement', 6),
        ('pulse', 'Mennyire érzed, hogy a munkád értékes?', 'How valuable does your work feel?', 'scale_1_10', 'engagement', 7),
        ('pulse', 'Hogyan értékeled a csapatod együttműködését ma?', 'How do you rate your team collaboration today?', 'scale_1_10', 'mood', 8),
        ('pulse', 'Mennyire érzed magad támogatottnak a vezetőd által?', 'How supported do you feel by your manager?', 'scale_1_10', 'workload', 9),
        ('pulse', 'Volt-e ma olyan pillanat, ami örömöt okozott a munkádban?', 'Was there a moment today that brought you joy at work?', 'yes_no', 'mood', 10)
    ON CONFLICT DO NOTHING;

    -- More assessment questions (MBI extended + UWES extended)
    INSERT INTO blue_colibri_questions (question_type, question_text, question_text_en, response_type, category, display_order) VALUES
        ('assessment', 'Úgy érzem, hogy a munkám pozitívan hozzájárul a szervezet sikeréhez.', 'I feel my work positively contributes to organizational success.', 'scale_1_10', 'personal_accomplishment', 110),
        ('assessment', 'Kiégettnek érzem magam a munkám miatt.', 'I feel burned out from my work.', 'scale_1_10', 'emotional_exhaustion', 111),
        ('assessment', 'A munkámban kreatív megoldásokat találok.', 'I find creative solutions in my work.', 'scale_1_10', 'vigor', 207),
        ('assessment', 'Nehezen tudom elválasztani a munkát a magánéletből.', 'I find it hard to separate work from personal life.', 'scale_1_10', 'burnout', 112),
        ('assessment', 'Érzem a fejlődést a szakmai képességeimben.', 'I feel growth in my professional skills.', 'scale_1_10', 'dedication', 208),
        ('assessment', 'A munkatársaim elismerik az erőfeszítéseimet.', 'My colleagues recognize my efforts.', 'scale_1_10', 'vigor', 209),
        ('assessment', 'Gyakran érzek szorongást a munkahelyi feladatok miatt.', 'I often feel anxiety about work tasks.', 'scale_1_10', 'emotional_exhaustion', 113),
        ('assessment', 'A munkám lehetőséget ad az önmegvalósításra.', 'My work provides opportunities for self-actualization.', 'scale_1_10', 'dedication', 210),
        ('assessment', 'Úgy érzem, túl sok időt töltök a munkában.', 'I feel I spend too much time working.', 'scale_1_10', 'burnout', 114),
        ('assessment', 'A csapatom támogató légkört biztosít.', 'My team provides a supportive atmosphere.', 'scale_1_10', 'absorption', 211),
        ('assessment', 'Érzem, hogy a munkám jelentéssel bír.', 'I feel my work has meaning.', 'scale_1_10', 'dedication', 212),
        ('assessment', 'Nehéz összpontosítanom a feladataimra.', 'I find it hard to concentrate on my tasks.', 'scale_1_10', 'depersonalization', 115),
        ('assessment', 'Kész vagyok extra erőfeszítést tenni a csapatomért.', 'I am willing to put in extra effort for my team.', 'scale_1_10', 'vigor', 213),
        ('assessment', 'Úgy érzem, a vezetőségem nem értékeli a munkámat.', 'I feel management does not value my work.', 'scale_1_10', 'depersonalization', 116),
        ('assessment', 'A munkanapom végén elégedettséget érzek.', 'At the end of my workday I feel satisfied.', 'scale_1_10', 'absorption', 214)
    ON CONFLICT DO NOTHING;

    -- ═════════════════════════════════════════════════════════════════
    -- 2. PULSE SURVEY HISTORY (last 30 days, 6+ users)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 6) LOOP
        v_user_id := v_user_ids[i];
        FOR v_day IN 0..29 LOOP
            -- Skip some days randomly (simulate real usage ~70% response rate)
            IF (v_day + i) % 10 < 7 THEN
                v_date := CURRENT_DATE - v_day;
                -- Vary mood by user: first users happy, later users more stressed
                v_mood := GREATEST(1, LEAST(5, 3 + (i % 3) - (v_day % 4) + 1));
                v_stress := GREATEST(1, LEAST(10, 4 + (v_day % 5) + (i % 2)));

                INSERT INTO blue_colibri_pulse_surveys
                    (user_id, contractor_id, survey_date, mood_score, stress_level, sleep_quality, workload_level)
                VALUES (
                    v_user_id, v_contractor_id, v_date,
                    v_mood,
                    v_stress,
                    GREATEST(1, LEAST(10, 7 - (v_day % 3) + (i % 2))),
                    GREATEST(1, LEAST(10, 5 + (v_day % 4)))
                )
                ON CONFLICT (user_id, survey_date) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;

    -- ═════════════════════════════════════════════════════════════════
    -- 3. ASSESSMENTS (10+ entries, various risk levels)
    -- ═════════════════════════════════════════════════════════════════

    -- Green: healthy employees (low burnout, high engagement)
    FOR i IN 1..LEAST(3, array_length(v_user_ids, 1)) LOOP
        INSERT INTO blue_colibri_assessments
            (user_id, contractor_id, quarter, responses, burnout_score, engagement_score,
             emotional_exhaustion_score, depersonalization_score, personal_accomplishment_score,
             vigor_score, dedication_score, absorption_score,
             risk_level, risk_factors)
        VALUES (
            v_user_ids[i], v_contractor_id, '2026-Q1',
            '[{"question":"EE1","score":2},{"question":"EE2","score":3},{"question":"DP1","score":1}]'::jsonb,
            15.0 + (i * 5), 75.0 - (i * 3),
            12.0 + i, 8.0 + i, 82.0 - i,
            78.0 - i, 80.0 - i, 72.0 + i,
            'green', '[]'::jsonb
        )
        ON CONFLICT (user_id, quarter) DO NOTHING;
    END LOOP;

    -- Yellow: at-risk employees
    IF array_length(v_user_ids, 1) >= 5 THEN
        INSERT INTO blue_colibri_assessments
            (user_id, contractor_id, quarter, responses, burnout_score, engagement_score,
             emotional_exhaustion_score, depersonalization_score, personal_accomplishment_score,
             vigor_score, dedication_score, absorption_score,
             risk_level, risk_factors)
        VALUES
            (v_user_ids[4], v_contractor_id, '2026-Q1',
             '[{"question":"EE1","score":6},{"question":"DP1","score":5}]'::jsonb,
             52.3, 48.7, 58.0, 42.0, 45.0, 50.0, 52.0, 44.0,
             'yellow', '[{"factor":"emotional_exhaustion","severity":"moderate"}]'::jsonb),
            (v_user_ids[5], v_contractor_id, '2026-Q1',
             '[{"question":"EE1","score":7},{"question":"DP1","score":4}]'::jsonb,
             48.1, 53.2, 52.0, 38.0, 50.0, 55.0, 48.0, 56.0,
             'yellow', '[{"factor":"workload","severity":"moderate"}]'::jsonb)
        ON CONFLICT (user_id, quarter) DO NOTHING;
    END IF;

    -- Red: high-risk employees
    IF array_length(v_user_ids, 1) >= 7 THEN
        INSERT INTO blue_colibri_assessments
            (user_id, contractor_id, quarter, responses, burnout_score, engagement_score,
             emotional_exhaustion_score, depersonalization_score, personal_accomplishment_score,
             vigor_score, dedication_score, absorption_score,
             risk_level, risk_factors)
        VALUES
            (v_user_ids[6], v_contractor_id, '2026-Q1',
             '[{"question":"EE1","score":9},{"question":"DP1","score":8}]'::jsonb,
             78.5, 32.1, 85.0, 72.0, 30.0, 28.0, 35.0, 33.0,
             'red', '[{"factor":"emotional_exhaustion","severity":"high"},{"factor":"depersonalization","severity":"high"}]'::jsonb),
            (v_user_ids[7], v_contractor_id, '2026-Q1',
             '[{"question":"EE1","score":8},{"question":"DP1","score":7}]'::jsonb,
             72.0, 38.5, 78.0, 65.0, 35.0, 40.0, 32.0, 43.0,
             'red', '[{"factor":"burnout","severity":"high"},{"factor":"low_engagement","severity":"high"}]'::jsonb)
        ON CONFLICT (user_id, quarter) DO NOTHING;
    END IF;

    -- Previous quarter assessments (for trend analysis)
    FOR i IN 1..LEAST(4, array_length(v_user_ids, 1)) LOOP
        INSERT INTO blue_colibri_assessments
            (user_id, contractor_id, quarter, responses, burnout_score, engagement_score, risk_level)
        VALUES (
            v_user_ids[i], v_contractor_id, '2025-Q4',
            '[]'::jsonb,
            20.0 + (i * 8), 70.0 - (i * 5),
            CASE WHEN (20.0 + i * 8) > 70 THEN 'red' WHEN (20.0 + i * 8) > 40 THEN 'yellow' ELSE 'green' END
        )
        ON CONFLICT (user_id, quarter) DO NOTHING;
    END LOOP;

    -- ═════════════════════════════════════════════════════════════════
    -- 4. INTERVENTIONS (20+ entries)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 8) LOOP
        v_user_id := v_user_ids[i];

        -- Active intervention
        INSERT INTO blue_colibri_interventions
            (user_id, contractor_id, intervention_type, title, description,
             recommended_reason, priority, status, triggered_by)
        VALUES (
            v_user_id, v_contractor_id,
            (ARRAY['coaching','meditation','exercise','eap_referral','training','workload_adjustment','time_off'])[1 + (i % 7)],
            (ARRAY[
                'Stresszkezelő coaching program', 'Napi 10 perces meditáció', 'Mozgásprogram indítása',
                'EAP pszichológiai tanácsadás', 'Időmenedzsment tréning', 'Munkaterhelés felülvizsgálata',
                'Szabadság kivétele ajánlott', 'Csapatépítő program'
            ])[1 + (i % 7)],
            'Személyre szabott javaslat a wellbeing felmérés alapján.',
            'Assessment burnout score: ' || (30 + i * 8)::text,
            (ARRAY['low','medium','high','urgent'])[1 + (i % 4)],
            (ARRAY['recommended','accepted','in_progress','completed','declined'])[1 + (i % 5)],
            (ARRAY['assessment','pulse_trend','ml_prediction','manual'])[1 + (i % 4)]
        );
    END LOOP;

    -- Additional completed interventions with feedback
    FOR i IN 1..LEAST(5, array_length(v_user_ids, 1)) LOOP
        INSERT INTO blue_colibri_interventions
            (user_id, contractor_id, intervention_type, title, description,
             priority, status, triggered_by,
             accepted_at, completed_at, completion_notes, effectiveness_rating)
        VALUES (
            v_user_ids[i], v_contractor_id, 'coaching',
            'Lezárt coaching program #' || i,
            'Korábbi időszakban végrehajtott coaching intervenció.',
            'medium', 'completed', 'assessment',
            NOW() - INTERVAL '60 days', NOW() - INTERVAL '30 days',
            'A program sikeresen lezárult.', 3 + (i % 3)
        );
    END LOOP;

    -- Expired interventions
    FOR i IN 1..3 LOOP
        IF i <= array_length(v_user_ids, 1) THEN
            INSERT INTO blue_colibri_interventions
                (user_id, contractor_id, intervention_type, title, description,
                 priority, status, triggered_by, expires_at)
            VALUES (
                v_user_ids[i], v_contractor_id, 'meditation',
                'Lejárt meditációs javaslat', 'Nem lett elfogadva a határidőn belül.',
                'low', 'expired', 'pulse_trend',
                NOW() - INTERVAL '5 days'
            );
        END IF;
    END LOOP;

    -- ═════════════════════════════════════════════════════════════════
    -- 5. COACHING SESSIONS (10+ entries)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 6) LOOP
        v_user_id := v_user_ids[i];

        -- Past session (completed)
        INSERT INTO blue_colibri_coaching_sessions
            (user_id, contractor_id, coach_name, coach_user_id,
             session_date, duration_minutes, session_type, status,
             topics_discussed, action_items, employee_rating, employee_feedback)
        VALUES (
            v_user_id, v_contractor_id,
            'Tóth Krisztina (HR Coach)',
            v_user_ids[array_length(v_user_ids, 1)], -- last user as coach
            NOW() - (i || ' weeks')::interval, 45,
            (ARRAY['burnout_support','career_coaching','stress_management','work_life_balance','general'])[1 + (i % 5)],
            'completed',
            ARRAY['stresszforrások azonosítása', 'megküzdési stratégiák', 'célkitűzés'],
            ARRAY['napi relaxációs gyakorlat', 'határok felállítása'],
            3 + (i % 3),
            CASE WHEN i % 2 = 0 THEN 'Nagyon hasznos volt a beszélgetés!' ELSE NULL END
        );

        -- Future session (scheduled)
        IF i <= 4 THEN
            INSERT INTO blue_colibri_coaching_sessions
                (user_id, contractor_id, coach_name, session_date, duration_minutes,
                 session_type, status, next_session_date)
            VALUES (
                v_user_id, v_contractor_id,
                'Tóth Krisztina (HR Coach)',
                NOW() + ((i * 3) || ' days')::interval, 45,
                'stress_management', 'scheduled',
                NOW() + ((i * 3 + 14) || ' days')::interval
            );
        END IF;
    END LOOP;

    -- ═════════════════════════════════════════════════════════════════
    -- 6. TEAM METRICS (respecting min-5 privacy rule)
    -- ═════════════════════════════════════════════════════════════════

    -- Only insert if we have enough users
    IF array_length(v_user_ids, 1) >= 5 THEN
        FOR v_day IN 0..11 LOOP  -- 12 weeks of weekly data
            v_date := CURRENT_DATE - (v_day * 7);

            INSERT INTO blue_colibri_team_metrics
                (contractor_id, team_id, team_name, metric_date, employee_count,
                 avg_mood_score, avg_stress_level, avg_burnout_score, avg_engagement_score,
                 risk_distribution, pulse_response_rate,
                 mood_trend, stress_trend)
            VALUES (
                v_contractor_id, v_contractor_id, 'Teljes szervezet',
                v_date,
                GREATEST(5, array_length(v_user_ids, 1)),
                3.2 + (v_day % 3) * 0.3,
                5.5 - (v_day % 4) * 0.2,
                35.0 + (v_day % 5) * 4,
                62.0 - (v_day % 4) * 3,
                json_build_object(
                    'green', GREATEST(1, 5 - (v_day % 3)),
                    'yellow', 2 + (v_day % 2),
                    'red', v_day % 2
                )::jsonb,
                65.0 + (v_day % 4) * 5,
                CASE WHEN v_day > 0 THEN 0.1 * (v_day % 3 - 1) ELSE 0 END,
                CASE WHEN v_day > 0 THEN -0.05 * (v_day % 3) ELSE 0 END
            )
            ON CONFLICT (contractor_id, team_id, metric_date) DO NOTHING;
        END LOOP;
    END IF;

    -- ═════════════════════════════════════════════════════════════════
    -- 7. ML PREDICTIONS (10+ entries)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 8) LOOP
        INSERT INTO blue_colibri_ml_predictions
            (user_id, contractor_id, prediction_date,
             turnover_risk_score, burnout_progression_trend, risk_level,
             confidence_score, model_version,
             features, top_risk_factors, recommended_interventions)
        VALUES (
            v_user_ids[i], v_contractor_id, CURRENT_DATE,
            CASE
                WHEN i <= 3 THEN 15.0 + (i * 5)  -- Green
                WHEN i <= 5 THEN 45.0 + (i * 3)  -- Yellow
                ELSE 72.0 + (i * 2)               -- Red
            END,
            CASE WHEN i <= 3 THEN 'improving' WHEN i <= 5 THEN 'stable' ELSE 'declining' END,
            CASE WHEN i <= 3 THEN 'green' WHEN i <= 5 THEN 'yellow' ELSE 'red' END,
            70.0 + (i * 3),
            'v1.0',
            json_build_object(
                'avg_pulse_30d', 3.0 + (i % 3),
                'burnout_score', 20 + (i * 8),
                'engagement_score', 80 - (i * 6),
                'tenure_months', 12 + (i * 6)
            )::jsonb,
            CASE
                WHEN i > 5 THEN '[{"factor":"high_burnout","importance":0.4},{"factor":"low_engagement","importance":0.35}]'::jsonb
                WHEN i > 3 THEN '[{"factor":"declining_pulse","importance":0.3}]'::jsonb
                ELSE '[]'::jsonb
            END,
            CASE
                WHEN i > 5 THEN ARRAY['eap_referral', 'workload_adjustment']
                WHEN i > 3 THEN ARRAY['coaching', 'meditation']
                ELSE ARRAY['self_care']
            END
        )
        ON CONFLICT (user_id, prediction_date, model_version) DO NOTHING;
    END LOOP;

    -- ═════════════════════════════════════════════════════════════════
    -- 8. ADDITIONAL EAP PROVIDERS (to reach 20+)
    -- ═════════════════════════════════════════════════════════════════

    INSERT INTO eap_providers (contractor_id, provider_type, full_name, credentials, specialties, languages, phone, email, address_city, address_zip, geo_lat, geo_lng, availability_hours, bio, is_active)
    VALUES
        (NULL, 'counselor', 'Papp Judit', 'MA, klinikai szakpszichológus',
         ARRAY['gyász','veszteség','életkrízis','önértékelés'], ARRAY['hu'],
         '+36-30-111-2222', 'papp.judit@eap-provider.hu', 'Miskolc', '3525',
         48.1035, 20.7784,
         '{"mon":["09:00-16:00"],"wed":["09:00-16:00"],"fri":["09:00-13:00"]}'::jsonb,
         'Gyász- és veszteségfeldolgozásra specializálódtam.', true),
        (NULL, 'therapist', 'Dr. Lakatos Gábor', 'PhD, pszichiáter',
         ARRAY['depresszió','bipoláris zavar','ADHD','gyógyszeres kezelés'], ARRAY['hu','en'],
         '+36-1-333-4444', 'lakatos.gabor@eap-provider.hu', 'Budapest', '1011',
         47.4964, 19.0395,
         '{"tue":["08:00-14:00"],"thu":["08:00-14:00"]}'::jsonb,
         'Pszichiáter, 20 éves klinikai tapasztalattal.', true),
        (NULL, 'financial_advisor', 'Kocsis Réka', 'okleveles könyvvizsgáló, adótanácsadó',
         ARRAY['adótervezés','vállalkozás','megtakarítás','hitel'], ARRAY['hu','en'],
         '+36-20-555-6666', 'kocsis.reka@eap-finance.hu', 'Székesfehérvár', '8000',
         47.1860, 18.4221,
         '{"mon":["10:00-18:00"],"tue":["10:00-18:00"],"thu":["10:00-18:00"]}'::jsonb,
         'Személyes pénzügyi tervezés és adóoptimalizálás.', true),
        (NULL, 'lawyer', 'Dr. Somogyi Tamás', 'JD, polgári jogi szakjogász',
         ARRAY['ingatlan','szerződésjog','fogyasztóvédelem','kártérítés'], ARRAY['hu'],
         '+36-30-777-8888', 'somogyi.tamas@eap-legal.hu', 'Kecskemét', '6000',
         46.9062, 19.6913,
         '{"mon":["09:00-15:00"],"wed":["09:00-15:00"]}'::jsonb,
         'Polgári jogi ügyekre specializálódtam.', true),
        (NULL, 'mediator', 'Erdei Katalin', 'okleveles mediátor, szervezetfejlesztő',
         ARRAY['munkahelyi konfliktus','szervezetfejlesztés','csapatépítés','coaching'], ARRAY['hu','de','en'],
         '+36-70-999-0000', 'erdei.katalin@eap-mediation.hu', 'Sopron', '9400',
         47.6851, 16.5903,
         '{"mon":["09:00-17:00"],"tue":["09:00-17:00"],"wed":["09:00-17:00"],"thu":["09:00-17:00"],"fri":["09:00-14:00"]}'::jsonb,
         'Nemzetközi tapasztalattal rendelkező mediátor és executive coach.', true),
        (NULL, 'counselor', 'Bíró Nóra', 'MA, addiktológiai konzultáns',
         ARRAY['addikció','alkoholizmus','szerhasználat','viselkedési függőség'], ARRAY['hu'],
         '+36-20-123-4567', 'biro.nora@eap-provider.hu', 'Budapest', '1074',
         47.4984, 19.0692,
         '{"tue":["14:00-20:00"],"thu":["14:00-20:00"],"sat":["09:00-14:00"]}'::jsonb,
         'Addiktológiai tanácsadó, 12-lépéses program támogatás.', true),
        (NULL, 'therapist', 'Dr. Vincze Miklós', 'PhD, sportpszichológus, mentálhigiénés szakember',
         ARRAY['teljesítményszorongás','munkahelyi stressz','burnout prevenció','reziliencia'], ARRAY['hu','en'],
         '+36-70-234-5678', 'vincze.miklos@eap-provider.hu', 'Debrecen', '4025',
         47.5290, 21.6393,
         '{"mon":["09:00-17:00"],"wed":["09:00-17:00"],"fri":["09:00-13:00"]}'::jsonb,
         'Sportpszichológiai módszerekkel segítem a munkahelyi teljesítmény és ellenálló képesség fejlesztését.', true),
        (NULL, 'crisis_specialist', 'Dr. Kelemen Ágnes', 'PhD, klinikai és krízis-szakpszichológus',
         ARRAY['akut krízis','poszttraumás stressz','katasztrófapszichológia','sürgősségi segítség'], ARRAY['hu','en','fr'],
         '+36-30-345-6789', 'kelemen.agnes@eap-crisis.hu', 'Budapest', '1092',
         47.4862, 19.0683,
         '{"mon":["00:00-23:59"],"tue":["00:00-23:59"],"wed":["00:00-23:59"],"thu":["00:00-23:59"],"fri":["00:00-23:59"],"sat":["00:00-23:59"],"sun":["00:00-23:59"]}'::jsonb,
         '24/7 elérhető krízisspecialista. NATO-képzett katasztrófapszichológus.', true),
        (NULL, 'counselor', 'Farkas Dániel', 'MA, munkapszichológus',
         ARRAY['karriertanácsadás','munkahely-váltás','önismeret','értékalapú coaching'], ARRAY['hu','en'],
         '+36-20-456-7890', 'farkas.daniel@eap-provider.hu', 'Győr', '9022',
         47.6839, 17.6354,
         '{"mon":["09:00-17:00"],"tue":["09:00-17:00"],"wed":["09:00-17:00"]}'::jsonb,
         'Karriertanácsadás és munkahelyi személyiségfejlesztés.', true),
        (NULL, 'financial_advisor', 'Németh Hajnalka', 'CFP, nyugdíjtanácsadó',
         ARRAY['nyugdíjtervezés','önkéntes pénztár','életbiztosítás','befektetés'], ARRAY['hu'],
         '+36-30-567-8901', 'nemeth.hajnalka@eap-finance.hu', 'Veszprém', '8200',
         47.0934, 17.9115,
         '{"tue":["10:00-16:00"],"thu":["10:00-16:00"]}'::jsonb,
         'Nyugdíj- és megtakarítási tanácsadás, 15 éves tapasztalattal.', true)
    ON CONFLICT DO NOTHING;

    -- ═════════════════════════════════════════════════════════════════
    -- 9. EAP CASES, SESSIONS, BOOKINGS
    -- ═════════════════════════════════════════════════════════════════

    -- Cases
    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 6) LOOP
        v_user_id := v_user_ids[i];
        SELECT id INTO v_provider_id FROM eap_providers WHERE is_active = true OFFSET (i % 10) LIMIT 1;

        INSERT INTO eap_cases
            (user_id, contractor_id, case_number, service_category_id, urgency_level,
             status, issue_description, assigned_provider_id, consent_given, consent_date,
             is_anonymous, data_retention_until, total_sessions,
             assigned_at)
        VALUES (
            v_user_id, v_contractor_id,
            'EAP-20260' || LPAD(i::text, 2, '0') || '-' || LPAD((1000 + i)::text, 4, '0'),
            CASE (i % 5)
                WHEN 0 THEN v_cat_counseling
                WHEN 1 THEN v_cat_legal
                WHEN 2 THEN v_cat_financial
                WHEN 3 THEN v_cat_family
                WHEN 4 THEN v_cat_crisis
            END,
            (ARRAY['low','medium','high','crisis'])[1 + (i % 4)],
            (ARRAY['open','assigned','in_progress','resolved','closed'])[1 + (i % 5)],
            'Bizalmas eset leírás — seed adat #' || i,
            v_provider_id,
            true, NOW() - (i || ' days')::interval,
            i % 3 = 0,  -- Every 3rd case is anonymous
            CURRENT_DATE + INTERVAL '5 years',
            CASE WHEN i <= 3 THEN i ELSE 0 END,
            CASE WHEN (1 + (i % 5)) >= 2 THEN NOW() - (i || ' days')::interval ELSE NULL END
        );

        -- Get the case we just inserted
        SELECT id INTO v_case_id FROM eap_cases WHERE case_number = 'EAP-20260' || LPAD(i::text, 2, '0') || '-' || LPAD((1000 + i)::text, 4, '0');

        -- Sessions for cases that are in_progress or resolved
        IF (1 + (i % 5)) >= 3 THEN  -- in_progress or later
            FOR v_day IN 1..LEAST(3, i) LOOP
                INSERT INTO eap_sessions
                    (case_id, provider_id, session_number, session_date, duration_minutes,
                     session_type, session_format,
                     session_notes_encrypted, topics_covered, progress_rating)
                VALUES (
                    v_case_id, v_provider_id, v_day,
                    NOW() - ((v_day * 7) || ' days')::interval, 50,
                    (ARRAY['individual_counseling','legal_consultation','financial_advice','crisis_intervention','follow_up'])[1 + (v_day % 5)],
                    (ARRAY['in_person','video_call','phone_call'])[1 + (v_day % 3)],
                    pgp_sym_encrypt('Bizalmas jegyzet — session ' || v_day || ' az eset #' || i || ' számára. Haladás tapasztalható.', 'seed-encryption-key'),
                    ARRAY['stressz', 'megküzdés', 'haladás'],
                    4 + (v_day % 3)
                );
            END LOOP;
        END IF;

        -- Bookings for active cases
        IF (1 + (i % 5)) <= 3 THEN  -- open, assigned, in_progress
            INSERT INTO eap_provider_bookings
                (case_id, provider_id, user_id,
                 appointment_datetime, duration_minutes, booking_type, status)
            VALUES (
                v_case_id, v_provider_id, v_user_id,
                NOW() + ((i * 3) || ' days')::interval + INTERVAL '10 hours',
                50,
                (ARRAY['in_person','video_call','phone_call'])[1 + (i % 3)],
                (ARRAY['scheduled','confirmed'])[1 + (i % 2)]
            );
        END IF;
    END LOOP;

    -- ═════════════════════════════════════════════════════════════════
    -- 10. EAP USAGE STATS (6 months)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 0..5 LOOP
        v_date := DATE_TRUNC('month', CURRENT_DATE - (i || ' months')::interval)::date;

        INSERT INTO eap_usage_stats
            (contractor_id, stat_month,
             total_cases_opened, total_cases_closed, total_cases_active, total_sessions_held,
             employee_count_using_eap, total_eligible_employees, utilization_rate,
             category_breakdown, urgency_breakdown,
             avg_case_duration_days, avg_satisfaction_rating, avg_sessions_per_case)
        VALUES (
            v_contractor_id, v_date,
            5 + (i % 3) * 2, 3 + (i % 4), 8 - i, 12 + (i % 3) * 4,
            6 + (i % 3), array_length(v_user_ids, 1),
            ROUND((6.0 + (i % 3)) / array_length(v_user_ids, 1) * 100, 2),
            json_build_object('counseling', 4 + (i % 2), 'legal', 1 + (i % 2), 'financial', i % 2, 'family', 1, 'crisis', i % 3)::jsonb,
            json_build_object('low', 2, 'medium', 3 + i, 'high', 1 + (i % 2), 'crisis', i % 2)::jsonb,
            15.0 + (i * 2), 3.8 + (i % 3) * 0.3, 2.5 + (i % 2) * 0.5
        )
        ON CONFLICT (contractor_id, stat_month) DO NOTHING;
    END LOOP;

    -- ═════════════════════════════════════════════════════════════════
    -- 11. REFERRALS (15+ entries)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 8) LOOP
        v_user_id := v_user_ids[i];

        INSERT INTO wellbeing_referrals
            (user_id, contractor_id, source_module, target_module,
             referral_type, urgency_level, referral_reason,
             is_auto_generated, status, referred_by)
        VALUES (
            v_user_id, v_contractor_id,
            (ARRAY['blue_colibri','chatbot','manager_alert','self_service','eap'])[1 + (i % 5)],
            (ARRAY['eap','blue_colibri','coaching','hr_intervention'])[1 + (i % 4)],
            (ARRAY[
                'high_burnout_to_eap', 'consecutive_low_pulse', 'chatbot_mental_health_keyword',
                'manager_concern', 'self_referral', 'post_eap_followup',
                'ml_high_turnover_risk', 'assessment_red_flag'
            ])[1 + (i % 8)],
            (ARRAY['low','medium','high','crisis'])[1 + (i % 4)],
            'Automatikus referral #' || i || ': ' ||
            (ARRAY[
                'Kiégési pontszám > 70, azonnali EAP ajánlás.',
                '3 egymást követő nap alacsony pulse score.',
                'Chatbot beszélgetésben mentális egészségre utaló kulcsszavak.',
                'Közvetlen vezető aggodalmát fejezte ki.',
                'Munkavállaló saját kérésére.',
                'EAP eset lezárása utáni Blue Colibri követés.',
                'ML modell magas fluktuációs kockázatot jelzett.',
                'Negyedéves értékelés piros kockázati szint.'
            ])[1 + (i % 8)],
            i % 2 = 0,  -- Half auto-generated
            (ARRAY['pending','accepted','declined','completed','expired'])[1 + (i % 5)],
            CASE WHEN i % 2 = 0 THEN NULL ELSE v_user_ids[1] END
        );
    END LOOP;

    -- ═════════════════════════════════════════════════════════════════
    -- 12. NOTIFICATIONS (30+ entries)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 6) LOOP
        v_user_id := v_user_ids[i];

        -- Pulse reminder
        INSERT INTO wellbeing_notifications
            (user_id, contractor_id, notification_type, notification_channel,
             title, message, priority, status, action_url, source_module,
             scheduled_for, sent_at, delivered_at)
        VALUES
            (v_user_id, v_contractor_id, 'pulse_reminder', 'push',
             'Hogyan érzed magad ma?', 'Töltsd ki a napi közérzeti felmérést!',
             'normal', 'delivered', '/blue-colibri/pulse', 'blue_colibri',
             CURRENT_DATE + TIME '09:00', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes');

        -- Assessment reminder
        INSERT INTO wellbeing_notifications
            (user_id, contractor_id, notification_type, notification_channel,
             title, message, priority, status, action_url, source_module)
        VALUES
            (v_user_id, v_contractor_id, 'assessment_due', 'email',
             'Negyedéves értékelés elérhető', 'Kérjük, töltsd ki a Q1 2026 wellbeing értékelést!',
             'high', 'sent', '/blue-colibri/assessment', 'blue_colibri');

        -- Intervention notification
        INSERT INTO wellbeing_notifications
            (user_id, contractor_id, notification_type, notification_channel,
             title, message, priority, status, action_url, source_module)
        VALUES
            (v_user_id, v_contractor_id, 'intervention_recommended', 'in_app',
             'Új javaslat érkezett', 'A wellbeing felmérésed alapján személyre szabott javaslatot kaptál.',
             'normal', 'read', '/blue-colibri/interventions', 'blue_colibri');

        -- EAP appointment reminder
        INSERT INTO wellbeing_notifications
            (user_id, contractor_id, notification_type, notification_channel,
             title, message, priority, status, scheduled_for, source_module)
        VALUES
            (v_user_id, v_contractor_id, 'eap_appointment_reminder', 'push',
             'EAP időpont emlékeztető', 'Holnap 10:00-kor időpontod van.',
             'high', 'pending', NOW() + INTERVAL '1 day', 'eap');

        -- Referral notification
        INSERT INTO wellbeing_notifications
            (user_id, contractor_id, notification_type, notification_channel,
             title, message, priority, status, source_module)
        VALUES
            (v_user_id, v_contractor_id, 'referral_received', 'in_app',
             'Új ajánlás érkezett', 'A rendszer EAP szolgáltatást javasol számodra.',
             'normal', 'delivered', 'wellbeing');
    END LOOP;

    -- Manager alerts (for admin user)
    INSERT INTO wellbeing_notifications
        (user_id, contractor_id, notification_type, notification_channel,
         title, message, priority, status, source_module)
    VALUES
        (v_user_ids[1], v_contractor_id, 'manager_alert', 'email',
         'Magas kockázatú munkavállaló', 'Egy csapattag wellbeing mutatói figyelmet igényelnek.',
         'urgent', 'sent', 'blue_colibri'),
        (v_user_ids[1], v_contractor_id, 'weekly_summary', 'email',
         'Heti csapat wellbeing összefoglaló', 'A csapatod átlagos hangulati pontszáma 3.8/5.',
         'low', 'delivered', 'blue_colibri');

    -- ═════════════════════════════════════════════════════════════════
    -- 13. AUDIT LOG ENTRIES (50+ entries)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 6) LOOP
        v_user_id := v_user_ids[i];

        -- User viewing own data
        INSERT INTO wellbeing_audit_log
            (user_id, accessed_user_id, contractor_id, action, resource_type,
             ip_address, user_agent, request_method, request_path, access_granted)
        VALUES
            (v_user_id, v_user_id, v_contractor_id, 'view_assessment', 'assessment',
             ('192.168.1.' || (10 + i))::inet, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'GET',
             '/api/v1/blue-colibri/assessment/history', true),
            (v_user_id, v_user_id, v_contractor_id, 'view_eap_case', 'eap_case',
             ('192.168.1.' || (10 + i))::inet, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'GET',
             '/api/v1/eap/my-cases', true);

        -- Admin viewing team data
        INSERT INTO wellbeing_audit_log
            (user_id, accessed_user_id, contractor_id, action, resource_type,
             ip_address, request_method, request_path, access_granted, access_reason,
             details)
        VALUES
            (v_user_ids[1], v_user_id, v_contractor_id, 'view_team_metrics', 'team_metrics',
             '10.0.0.1'::inet, 'GET', '/api/v1/blue-colibri/team/metrics', true,
             'HR admin reviewing team wellbeing',
             '{"team_size":8,"period":"weekly"}'::jsonb),
            (v_user_ids[1], v_user_id, v_contractor_id, 'view_risk_employees', 'ml_prediction',
             '10.0.0.1'::inet, 'GET', '/api/v1/blue-colibri/admin/risk-employees', true,
             'Monthly risk review',
             '{"risk_level":"red","count":2}'::jsonb);

        -- Admin data export
        IF i = 1 THEN
            INSERT INTO wellbeing_audit_log
                (user_id, accessed_user_id, contractor_id, action, resource_type,
                 ip_address, access_granted, access_reason, details)
            VALUES
                (v_user_ids[1], NULL, v_contractor_id, 'export_data', 'team_metrics',
                 '10.0.0.1'::inet, true, 'Quarterly management report',
                 '{"export_format":"xlsx","rows":150}'::jsonb);
        END IF;

        -- Access denied example
        IF i = 3 THEN
            INSERT INTO wellbeing_audit_log
                (user_id, accessed_user_id, contractor_id, action, resource_type,
                 ip_address, access_granted, denial_reason)
            VALUES
                (v_user_id, v_user_ids[1], v_contractor_id, 'view_eap_session_notes', 'eap_session',
                 '192.168.1.13'::inet, false, 'Employee role cannot access other users EAP session notes');
        END IF;
    END LOOP;

    -- System audit entries
    INSERT INTO wellbeing_audit_log
        (user_id, contractor_id, action, resource_type, access_granted, details)
    VALUES
        (NULL, v_contractor_id, 'data_erasure', 'eap_case', true,
         '{"reason":"GDPR retention expired","cases_deleted":3}'::jsonb),
        (NULL, v_contractor_id, 'consent_update', 'eap_case', true,
         '{"consent_type":"data_processing","value":true}'::jsonb);

    -- ═════════════════════════════════════════════════════════════════
    -- 14. FEEDBACK ENTRIES (20+ entries)
    -- ═════════════════════════════════════════════════════════════════

    FOR i IN 1..LEAST(array_length(v_user_ids, 1), 6) LOOP
        v_user_id := v_user_ids[i];

        -- Intervention feedback
        INSERT INTO wellbeing_feedback
            (user_id, contractor_id, feedback_type, rating, is_helpful,
             feedback_text, improvement_suggestions, is_anonymous)
        VALUES
            (v_user_id, v_contractor_id, 'intervention', 3 + (i % 3), i % 2 = 0,
             (ARRAY[
                 'A javaslat hasznos volt, de több konkrét lépést szerettem volna.',
                 'Nagyon köszönöm a személyre szabott tanácsokat!',
                 'Kicsit általánosnak éreztem, de a coaching segített.',
                 'A meditációs javaslat meglepően jól működött.',
                 'Nem éreztem relevánsnak a helyzetemet tekintve.',
                 'A legjobb dolog, amit a cég valaha tett az alkalmazottakért!'
             ])[1 + (i % 6)],
             CASE WHEN i % 3 = 0 THEN 'Személyesebb megközelítés lenne jó.' ELSE NULL END,
             i % 4 = 0);

        -- Coaching feedback
        INSERT INTO wellbeing_feedback
            (user_id, contractor_id, feedback_type, rating, is_helpful, feedback_text)
        VALUES
            (v_user_id, v_contractor_id, 'coaching_session', 4 + (i % 2), true,
             'A coach nagyon empatikus és professzionális volt.');

        -- EAP feedback
        IF i <= 4 THEN
            INSERT INTO wellbeing_feedback
                (user_id, contractor_id, feedback_type, rating, is_helpful,
                 feedback_text, improvement_suggestions)
            VALUES
                (v_user_id, v_contractor_id, 'eap_session', 3 + (i % 3), true,
                 'A tanácsadás segített tisztábban látni a helyzetemet.',
                 CASE WHEN i % 2 = 0 THEN 'Több időpont-lehetőség kellene.' ELSE NULL END);
        END IF;

        -- General platform feedback
        IF i <= 3 THEN
            INSERT INTO wellbeing_feedback
                (user_id, contractor_id, feedback_type, rating, is_helpful, feedback_text)
            VALUES
                (v_user_id, v_contractor_id, 'general', 4, true,
                 'Örülök, hogy a cég foglalkozik a munkavállalók jóllétével.');
        END IF;
    END LOOP;

    RAISE NOTICE 'Seed data inserted successfully';
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 15. DATABASE FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Burnout score calculator from sub-dimension scores
CREATE OR REPLACE FUNCTION calculate_burnout_composite(
    p_ee DECIMAL, p_dp DECIMAL, p_pa DECIMAL
) RETURNS DECIMAL(5,2) AS $$
BEGIN
    -- Weighted composite: EE 45%, DP 25%, reversed PA 30%
    RETURN LEAST(100, GREATEST(0,
        COALESCE(p_ee, 50) * 0.45 +
        COALESCE(p_dp, 50) * 0.25 +
        (100 - COALESCE(p_pa, 50)) * 0.30
    ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Engagement score calculator from sub-dimension scores
CREATE OR REPLACE FUNCTION calculate_engagement_composite(
    p_vigor DECIMAL, p_dedication DECIMAL, p_absorption DECIMAL
) RETURNS DECIMAL(5,2) AS $$
BEGIN
    -- Weighted: Vigor 35%, Dedication 40%, Absorption 25%
    RETURN LEAST(100, GREATEST(0,
        COALESCE(p_vigor, 50) * 0.35 +
        COALESCE(p_dedication, 50) * 0.40 +
        COALESCE(p_absorption, 50) * 0.25
    ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Risk level from burnout + engagement
CREATE OR REPLACE FUNCTION determine_risk_level(
    p_burnout DECIMAL, p_engagement DECIMAL
) RETURNS VARCHAR(20) AS $$
BEGIN
    IF COALESCE(p_burnout, 0) > 70 OR COALESCE(p_engagement, 100) < 40 THEN
        RETURN 'red';
    ELSIF COALESCE(p_burnout, 0) > 40 OR COALESCE(p_engagement, 100) < 60 THEN
        RETURN 'yellow';
    ELSE
        RETURN 'green';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_burnout_composite IS 'Weighted burnout: EE*0.45 + DP*0.25 + (100-PA)*0.30';
COMMENT ON FUNCTION calculate_engagement_composite IS 'Weighted engagement: Vigor*0.35 + Dedication*0.40 + Absorption*0.25';
COMMENT ON FUNCTION determine_risk_level IS 'Risk: red (burnout>70 OR engagement<40), yellow (burnout>40 OR engagement<60), else green';


-- ═══════════════════════════════════════════════════════════════════════════
-- 16. MATERIALIZED VIEW
-- ═══════════════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_wellbeing_summary AS
SELECT
    u.id AS user_id,
    u.contractor_id,
    -- Pulse (last 30 days)
    (SELECT AVG(mood_score) FROM blue_colibri_pulse_surveys
     WHERE user_id = u.id AND survey_date >= CURRENT_DATE - 30) AS avg_mood_30d,
    (SELECT COUNT(*) FROM blue_colibri_pulse_surveys
     WHERE user_id = u.id AND survey_date >= CURRENT_DATE - 30) AS pulse_count_30d,
    -- Latest assessment
    (SELECT burnout_score FROM blue_colibri_assessments
     WHERE user_id = u.id ORDER BY assessment_date DESC LIMIT 1) AS latest_burnout,
    (SELECT engagement_score FROM blue_colibri_assessments
     WHERE user_id = u.id ORDER BY assessment_date DESC LIMIT 1) AS latest_engagement,
    (SELECT risk_level FROM blue_colibri_assessments
     WHERE user_id = u.id ORDER BY assessment_date DESC LIMIT 1) AS latest_risk_level,
    -- Active interventions
    (SELECT COUNT(*) FROM blue_colibri_interventions
     WHERE user_id = u.id AND status IN ('recommended', 'accepted', 'in_progress')) AS active_interventions,
    -- EAP
    (SELECT COUNT(*) FROM eap_cases
     WHERE user_id = u.id AND status IN ('open', 'assigned', 'in_progress')) AS active_eap_cases,
    -- Referrals
    (SELECT COUNT(*) FROM wellbeing_referrals
     WHERE user_id = u.id AND status = 'pending') AS pending_referrals
FROM users u
WHERE EXISTS (
    SELECT 1 FROM blue_colibri_pulse_surveys WHERE user_id = u.id
    UNION ALL
    SELECT 1 FROM blue_colibri_assessments WHERE user_id = u.id
    UNION ALL
    SELECT 1 FROM eap_cases WHERE user_id = u.id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_wellbeing_user
    ON mv_user_wellbeing_summary(user_id);

CREATE INDEX IF NOT EXISTS idx_mv_wellbeing_risk
    ON mv_user_wellbeing_summary(latest_risk_level)
    WHERE latest_risk_level IS NOT NULL;

COMMENT ON MATERIALIZED VIEW mv_user_wellbeing_summary IS
    'Pre-computed user wellbeing snapshot. Refresh via: '
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_wellbeing_summary;';

-- Refresh function (for cron job)
CREATE OR REPLACE FUNCTION refresh_wellbeing_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_wellbeing_summary;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════════
-- 17. ANALYZE ALL TABLES
-- ═══════════════════════════════════════════════════════════════════════════

ANALYZE blue_colibri_questions;
ANALYZE blue_colibri_pulse_surveys;
ANALYZE blue_colibri_assessments;
ANALYZE blue_colibri_interventions;
ANALYZE blue_colibri_coaching_sessions;
ANALYZE blue_colibri_team_metrics;
ANALYZE blue_colibri_ml_predictions;
ANALYZE eap_service_categories;
ANALYZE eap_providers;
ANALYZE eap_cases;
ANALYZE eap_sessions;
ANALYZE eap_provider_bookings;
ANALYZE eap_usage_stats;
ANALYZE wellbeing_referrals;
ANALYZE wellbeing_notifications;
ANALYZE wellbeing_audit_log;
ANALYZE wellbeing_feedback;
ANALYZE mv_user_wellbeing_summary;
