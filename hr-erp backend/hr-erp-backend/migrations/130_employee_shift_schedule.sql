-- 130: employees.shift_schedule — static shift PATTERN (not the per-date `shifts`
-- calendar). Required input for the Room Consolidation Suggestion Engine: a room
-- must not mix day- and night-shift workers. Stored as English slugs; UI shows
-- Hungarian labels; bulk import normalizes hu/en variants to a slug.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS shift_schedule VARCHAR(20)
  CHECK (shift_schedule IN ('day', 'night', 'rotating', 'flexible'));

COMMENT ON COLUMN employees.shift_schedule IS
  'Shift pattern: day | night | rotating | flexible. Consolidation-engine input (no mixing day/night in a room).';
