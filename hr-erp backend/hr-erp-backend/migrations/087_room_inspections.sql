-- Migration 087: Room-level inspection tracking (Day 3 Part A)
--
-- Spec correction: FK target changed from `rooms(id)` (doesn't exist) to
-- `accommodation_rooms(id)` (the actual table name — same pattern as
-- `accommodations` vs. `housings` in migration 086).
--
-- Idempotent; safe to re-run.

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- room_inspections — per-room scoring within a single inspection
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS room_inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
  room_id UUID REFERENCES accommodation_rooms(id) ON DELETE SET NULL,
  room_number VARCHAR(50),

  -- Scores per room (same buckets as the parent inspection)
  technical_score INTEGER,
  hygiene_score INTEGER,
  aesthetic_score INTEGER,
  total_score INTEGER CHECK (total_score IS NULL OR (total_score BETWEEN 0 AND 100)),
  grade VARCHAR(20)
    CHECK (grade IS NULL OR grade IN ('excellent','good','acceptable','poor','bad','critical')),

  -- Delta vs. previous room inspection (auto-computed at insert-time by the
  -- controller; NULL on first inspection for the room)
  previous_score INTEGER,
  score_change INTEGER,
  trend VARCHAR(20) CHECK (trend IS NULL OR trend IN ('improving','declining','stable')),

  -- Snapshot of residents at the moment of inspection.
  -- Shape: [{user_id, name, move_in_date}, ...]
  -- Kept as JSONB so the snapshot survives user deletions / move-outs.
  residents_snapshot JSONB,

  notes TEXT,
  needs_attention BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),

  -- One score entry per (inspection, room). Re-scoring does UPDATE via ON CONFLICT.
  UNIQUE (inspection_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_room_inspections_room        ON room_inspections(room_id);
CREATE INDEX IF NOT EXISTS idx_room_inspections_inspection  ON room_inspections(inspection_id);
CREATE INDEX IF NOT EXISTS idx_room_inspections_trend       ON room_inspections(trend);
CREATE INDEX IF NOT EXISTS idx_room_inspections_attention   ON room_inspections(needs_attention) WHERE needs_attention = true;

-- ════════════════════════════════════════════════════════════════════
-- room_inspection_trends — materialized aggregate per room
-- ════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS room_inspection_trends AS
SELECT
  room_id,
  MAX(room_number) AS room_number,
  AVG(total_score)::numeric(5,2) AS avg_score,
  COUNT(*)                       AS inspection_count,
  MIN(total_score)               AS min_score,
  MAX(total_score)               AS max_score,
  (MAX(created_at) - MIN(created_at)) AS tracking_period,
  MAX(created_at)                AS last_inspected_at
FROM room_inspections
WHERE room_id IS NOT NULL
GROUP BY room_id;

CREATE INDEX IF NOT EXISTS idx_room_trends_room ON room_inspection_trends(room_id);

COMMIT;
