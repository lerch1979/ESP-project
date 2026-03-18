-- Migration 068: Question Rotation System + Additional Pulse Questions

BEGIN;

-- ── Question Rotation Config ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wellmind_question_rotation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_period VARCHAR(20) NOT NULL DEFAULT 'weekly'
    CHECK (rotation_period IN ('daily', 'weekly', 'monthly')),
  questions_per_survey INTEGER NOT NULL DEFAULT 5 CHECK (questions_per_survey BETWEEN 3 AND 10),
  include_core_questions BOOLEAN NOT NULL DEFAULT TRUE,
  additional_question_pool UUID[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Extend category constraint for new question types ───────────────

ALTER TABLE wellmind_questions DROP CONSTRAINT IF EXISTS blue_colibri_questions_category_check;
ALTER TABLE wellmind_questions ADD CONSTRAINT blue_colibri_questions_category_check
  CHECK (category IN (
    'mood', 'stress', 'sleep', 'workload', 'engagement', 'burnout',
    'emotional_exhaustion', 'depersonalization', 'personal_accomplishment',
    'vigor', 'dedication', 'absorption',
    'housing', 'recognition', 'safety', 'balance', 'conflict', 'resources', 'clarity', 'social'
  ));

-- ── Insert Additional Pulse Questions ───────────────────────────────

INSERT INTO wellmind_questions (id, question_type, question_text, question_text_en, response_type, category, is_active, display_order)
VALUES
  (gen_random_uuid(), 'pulse', 'Mennyire vagy elégedett a lakhatási körülményeiddel?',
   'How satisfied are you with your living conditions?', 'scale_1_10', 'housing', TRUE, 20),
  (gen_random_uuid(), 'pulse', 'Érzed-e, hogy értékelik a munkádat?',
   'Do you feel appreciated for your work?', 'scale_1_10', 'recognition', TRUE, 21),
  (gen_random_uuid(), 'pulse', 'Mennyire érzed magad biztonságban a munkahelyen?',
   'Do you feel safe in your workplace?', 'scale_1_10', 'safety', TRUE, 22),
  (gen_random_uuid(), 'pulse', 'Hogyan értékeled a munka-magánélet egyensúlyodat?',
   'How would you rate your work-life balance?', 'scale_1_10', 'balance', TRUE, 23),
  (gen_random_uuid(), 'pulse', 'Volt-e konfliktusod ezen a héten?',
   'Have you experienced any conflicts this week?', 'yes_no', 'conflict', TRUE, 24),
  (gen_random_uuid(), 'pulse', 'Hozzáférsz-e a szükséges erőforrásokhoz?',
   'Do you have access to necessary resources?', 'yes_no', 'resources', TRUE, 25),
  (gen_random_uuid(), 'pulse', 'Mennyire tiszták a munkahelyi elvárásaid?',
   'How clear are your work expectations?', 'scale_1_10', 'clarity', TRUE, 26),
  (gen_random_uuid(), 'pulse', 'Mennyire érzed magad a csapatodhoz tartozónak?',
   'Do you feel connected with your team?', 'scale_1_10', 'social', TRUE, 27)
ON CONFLICT DO NOTHING;

-- ── Default Rotation Config ─────────────────────────────────────────

INSERT INTO wellmind_question_rotation (
  rotation_period, questions_per_survey, include_core_questions,
  additional_question_pool, is_active
)
SELECT
  'weekly', 5, TRUE,
  ARRAY(
    SELECT id FROM wellmind_questions
    WHERE question_type = 'pulse'
      AND category IN ('housing', 'recognition', 'safety', 'balance', 'conflict', 'resources', 'clarity', 'social')
      AND is_active = TRUE
  ),
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM wellmind_question_rotation);

COMMIT;
