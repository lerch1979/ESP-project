-- ============================================================================
-- Migration 069: Gamification Engine
-- Points, badges, streaks system for wellbeing engagement boost (30-40%)
-- ============================================================================

-- Table 1: Points tracking
CREATE TABLE IF NOT EXISTS wellbeing_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES contractors(id),
  points INT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_id UUID,
  earned_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table 2: Badge definitions
CREATE TABLE IF NOT EXISTS wellbeing_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_type VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url VARCHAR(255),
  points_required INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table 3: User badges (earned)
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES wellbeing_badges(id),
  earned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- Table 4: Streak tracking
CREATE TABLE IF NOT EXISTS wellbeing_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak_type VARCHAR(50) DEFAULT 'pulse_survey',
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_activity_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, streak_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_points_user ON wellbeing_points(user_id);
CREATE INDEX IF NOT EXISTS idx_points_contractor ON wellbeing_points(contractor_id);
CREATE INDEX IF NOT EXISTS idx_points_earned ON wellbeing_points(earned_at);
CREATE INDEX IF NOT EXISTS idx_points_action_type ON wellbeing_points(action_type);
CREATE INDEX IF NOT EXISTS idx_points_user_date ON wellbeing_points(user_id, (earned_at::date));
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_streaks_user ON wellbeing_streaks(user_id);

-- Seed initial badges
INSERT INTO wellbeing_badges (badge_type, name, description, icon_url, points_required) VALUES
  ('7_day_streak',       '7 Napos Sorozat',       'Hét egymást követő nap pulzus felmérés kitöltése',       '/badges/7day.svg',         NULL),
  ('30_day_streak',      '30 Napos Sorozat',      '30 egymást követő nap pulzus felmérés kitöltése',       '/badges/30day.svg',        NULL),
  ('90_day_streak',      '90 Napos Sorozat',      '90 egymást követő nap pulzus felmérés kitöltése',       '/badges/90day.svg',        NULL),
  ('assessment_master',  'Felmérés Mester',        '10 quarterly assessment kitöltése',                      '/badges/assessment.svg',   NULL),
  ('wellness_warrior',   'Jóllét Harcos',          '1000 pont összegyűjtése',                                '/badges/warrior.svg',      1000),
  ('early_bird',         'Korai Madár',            '50 pulzus felmérés kitöltése 9:00 előtt',               '/badges/earlybird.svg',    NULL),
  ('consistency_king',   'Konzisztencia Király',    '100 pulzus felmérés kitöltése összesen',                '/badges/consistency.svg',  NULL)
ON CONFLICT (badge_type) DO NOTHING;
