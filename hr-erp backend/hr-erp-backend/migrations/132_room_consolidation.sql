-- 132: Room Consolidation Suggestion Engine v1.
--
-- Reuses agent_suggestions (mig 123) for individual move proposals
-- (agent_name='room_consolidation', entity_type='employee',
--  suggestion_type='room_move', payload={run_id, from_room_id, to_room_id, ...}).
-- Adds two tables the per-item scaffold can't carry: a run + its site-level
-- summary, and a fresh-read config (weights + shift-compatibility matrix),
-- mirroring the expiry-monitor's runtime-config pattern.

CREATE TABLE IF NOT EXISTS consolidation_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  -- prioritization weights (read fresh each run; tune later, defaults work)
  weight_freed_rooms   NUMERIC NOT NULL DEFAULT 10,  -- maximize freed rooms
  weight_min_moves     NUMERIC NOT NULL DEFAULT 3,   -- minimize moves (disruption)
  weight_underutilized NUMERIC NOT NULL DEFAULT 5,   -- prefer under-utilized sites
  -- shift compatibility matrix (who may share a room). DEFAULT = SAME SHIFT ONLY
  -- (identity): every cross-shift pairing is incompatible. An empty shift is
  -- incompatible with everyone (handled in the engine, not the matrix — a null
  -- shift has no matrix key so it never matches). See mig 137 for the shift set.
  shift_compatibility  JSONB NOT NULL DEFAULT '{
    "delelott": {"delelott": true,  "delutan": false, "ejszaka": false, "valtott": false},
    "delutan":  {"delelott": false, "delutan": true,  "ejszaka": false, "valtott": false},
    "ejszaka":  {"delelott": false, "delutan": false, "ejszaka": true,  "valtott": false},
    "valtott":  {"delelott": false, "delutan": false, "ejszaka": false, "valtott": true}
  }'::jsonb,
  updated_by           UUID,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Singleton config row with defaults (idempotent).
INSERT INTO consolidation_config (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM consolidation_config);

CREATE TABLE IF NOT EXISTS consolidation_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by  UUID,
  status        VARCHAR(20) NOT NULL DEFAULT 'generated', -- generated|partially_applied|applied|discarded
  total_moves   INTEGER NOT NULL DEFAULT 0,
  freed_rooms   INTEGER NOT NULL DEFAULT 0,
  freed_beds    INTEGER NOT NULL DEFAULT 0,
  summary       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- per-accommodation breakdown + ranking
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_consolidation_runs_created ON consolidation_runs (created_at DESC);
