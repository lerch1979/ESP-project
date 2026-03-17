-- Migration 063: Housing Cleanliness Tracking
-- Purpose: Track housing conditions and correlate with employee wellbeing
-- Specific to: Housing Solutions Kft
-- Date: TBD (Session 21)

BEGIN;

-- 1. Create housing cleanliness inspections table
CREATE TABLE IF NOT EXISTS housing_cleanliness_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  room_cleanliness_score INTEGER CHECK (room_cleanliness_score BETWEEN 1 AND 10),
  common_area_score INTEGER CHECK (common_area_score BETWEEN 1 AND 10),
  bathroom_score INTEGER CHECK (bathroom_score BETWEEN 1 AND 10),
  kitchen_score INTEGER CHECK (kitchen_score BETWEEN 1 AND 10),
  overall_score DECIMAL(3,2) GENERATED ALWAYS AS (
    (COALESCE(room_cleanliness_score, 0) +
     COALESCE(common_area_score, 0) +
     COALESCE(bathroom_score, 0) +
     COALESCE(kitchen_score, 0)) / 4.0
  ) STORED,
  inspector_id UUID REFERENCES users(id) ON DELETE SET NULL,
  inspector_notes TEXT,
  corrective_actions_taken TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  follow_up_completed_at TIMESTAMP,
  photo_urls TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create indexes
CREATE INDEX idx_housing_user_date ON housing_cleanliness_inspections(user_id, inspection_date DESC);
CREATE INDEX idx_housing_contractor ON housing_cleanliness_inspections(contractor_id, inspection_date DESC);
CREATE INDEX idx_housing_score ON housing_cleanliness_inspections(overall_score);
CREATE INDEX idx_housing_followup ON housing_cleanliness_inspections(follow_up_required, follow_up_date)
  WHERE follow_up_required = true AND follow_up_completed_at IS NULL;

-- 3. Enable RLS
ALTER TABLE housing_cleanliness_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE housing_cleanliness_inspections FORCE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS housing_own ON housing_cleanliness_inspections;
CREATE POLICY housing_own ON housing_cleanliness_inspections
  FOR SELECT
  USING (
    user_id = app_current_user_id()
    AND contractor_id = app_current_contractor_id()
  );

DROP POLICY IF EXISTS housing_admin ON housing_cleanliness_inspections;
CREATE POLICY housing_admin ON housing_cleanliness_inspections
  FOR ALL
  USING (
    app_is_superadmin()
    OR (
      contractor_id = app_current_contractor_id()
      AND app_current_role() IN ('admin', 'data_controller')
    )
  );

-- 5. Create analytics view (privacy: min 5 employees)
CREATE OR REPLACE VIEW v_housing_wellbeing_correlation AS
SELECT
  h.contractor_id,
  DATE_TRUNC('month', h.inspection_date) AS month,
  CASE
    WHEN h.overall_score >= 8 THEN 'Clean'
    WHEN h.overall_score >= 5 THEN 'Average'
    ELSE 'Poor'
  END AS housing_quality,
  COUNT(DISTINCT h.user_id) AS employee_count,
  ROUND(AVG(h.overall_score)::numeric, 2) AS avg_cleanliness_score,
  ROUND(AVG(p.mood_score)::numeric, 2) AS avg_mood,
  ROUND(AVG(p.stress_level)::numeric, 2) AS avg_stress,
  ROUND(AVG(p.sleep_quality)::numeric, 2) AS avg_sleep
FROM housing_cleanliness_inspections h
LEFT JOIN wellmind_pulse_surveys p ON h.user_id = p.user_id
  AND p.survey_date BETWEEN h.inspection_date AND h.inspection_date + 7
GROUP BY h.contractor_id, month, housing_quality
HAVING COUNT(DISTINCT h.user_id) >= 5;

-- 6. Trigger for updated_at
DO $$ BEGIN
  CREATE TRIGGER trg_housing_updated
    BEFORE UPDATE ON housing_cleanliness_inspections
    FOR EACH ROW EXECUTE FUNCTION wb_update_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. ANALYZE
ANALYZE housing_cleanliness_inspections;

COMMIT;
