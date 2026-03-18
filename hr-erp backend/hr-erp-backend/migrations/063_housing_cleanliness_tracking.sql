-- Migration 063: Housing Cleanliness Tracking
-- Tracks accommodation cleanliness inspections and correlates with employee wellbeing

BEGIN;

-- ── Housing Cleanliness Inspections ─────────────────────────────────

CREATE TABLE IF NOT EXISTS housing_cleanliness_inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  room_cleanliness_score SMALLINT NOT NULL CHECK (room_cleanliness_score BETWEEN 1 AND 10),
  common_area_score SMALLINT NOT NULL CHECK (common_area_score BETWEEN 1 AND 10),
  bathroom_score SMALLINT NOT NULL CHECK (bathroom_score BETWEEN 1 AND 10),
  kitchen_score SMALLINT NOT NULL CHECK (kitchen_score BETWEEN 1 AND 10),
  overall_score DECIMAL(3,1) GENERATED ALWAYS AS (
    (room_cleanliness_score + common_area_score + bathroom_score + kitchen_score) / 4.0
  ) STORED,
  inspector_id UUID REFERENCES users(id),
  inspector_notes TEXT,
  corrective_actions_taken TEXT,
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date DATE,
  follow_up_completed BOOLEAN DEFAULT FALSE,
  follow_up_notes TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_housing_inspections_user_date ON housing_cleanliness_inspections(user_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_housing_inspections_contractor_date ON housing_cleanliness_inspections(contractor_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_housing_inspections_score ON housing_cleanliness_inspections(overall_score);
CREATE INDEX IF NOT EXISTS idx_housing_inspections_follow_up ON housing_cleanliness_inspections(follow_up_required, follow_up_completed) WHERE follow_up_required = TRUE;

-- Timestamp trigger
CREATE OR REPLACE FUNCTION update_housing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_housing_inspections_updated ON housing_cleanliness_inspections;
CREATE TRIGGER trg_housing_inspections_updated
  BEFORE UPDATE ON housing_cleanliness_inspections
  FOR EACH ROW EXECUTE FUNCTION update_housing_timestamp();

-- ── Correlation View (privacy: min 5 employees) ────────────────────

CREATE OR REPLACE VIEW v_housing_wellbeing_correlation AS
SELECT
  ci.contractor_id,
  CASE
    WHEN ci.overall_score >= 8 THEN 'Clean'
    WHEN ci.overall_score >= 5 THEN 'Average'
    ELSE 'Poor'
  END AS cleanliness_category,
  ROUND(AVG(ps.mood_score)::numeric, 2) AS avg_mood,
  ROUND(AVG(ps.stress_level)::numeric, 2) AS avg_stress,
  ROUND(AVG(ps.sleep_quality)::numeric, 2) AS avg_sleep,
  COUNT(DISTINCT ci.user_id) AS employee_count
FROM housing_cleanliness_inspections ci
JOIN wellmind_pulse_surveys ps
  ON ci.user_id = ps.user_id
  AND ps.survey_date BETWEEN ci.inspection_date - 7 AND ci.inspection_date + 7
WHERE ci.inspection_date >= CURRENT_DATE - 90
GROUP BY ci.contractor_id, cleanliness_category
HAVING COUNT(DISTINCT ci.user_id) >= 5;

COMMIT;
