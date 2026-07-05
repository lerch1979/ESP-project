-- 133: Room Consolidation Engine v2 — accommodation-level strategy layer.
--
-- Adds to the v1 engine (mig 132):
--   • accommodation ROLES (core/buffer/normal/phase_out) + a hard LOCK flag,
--     driving drain/fill order (buffer & phase_out drain first; core fills first)
--   • accommodation ↔ WORKPLACE binding (a new HARD constraint, same severity as
--     the gender rule): a move may only TARGET an accommodation whose workplace
--     list contains the employee's workplace (an EMPTY list = unrestricted)
--   • a STABILITY window: an employee moved by an applied suggestion is not
--     re-suggested for `stability_days` (default 60), read from entity_status_history
--
-- Cross-accommodation moves are unlocked in the service; no schema change needed
-- for them beyond employees.accommodation_id already existing.

-- ── accommodation role + lock ──────────────────────────────────────────────
ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS consolidation_role   VARCHAR(16) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS consolidation_locked BOOLEAN     NOT NULL DEFAULT FALSE;

-- core = fill-first (keep at 100%); buffer = drain FIRST when beds free elsewhere;
-- phase_out = drain (closure candidate); normal = default.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accommodations_consolidation_role_chk') THEN
    ALTER TABLE accommodations
      ADD CONSTRAINT accommodations_consolidation_role_chk
      CHECK (consolidation_role IN ('core','buffer','normal','phase_out'));
  END IF;
END $$;

-- ── accommodation ↔ workplace binding (admin-editable list per accommodation) ──
CREATE TABLE IF NOT EXISTS accommodation_workplaces (
  accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  workplace        TEXT NOT NULL,               -- matches employees.workplace (free text)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (accommodation_id, workplace)
);
CREATE INDEX IF NOT EXISTS ix_accommodation_workplaces_acc ON accommodation_workplaces (accommodation_id);

-- ── v2 config knobs (read fresh each run, expiry-monitor pattern) ──
ALTER TABLE consolidation_config
  ADD COLUMN IF NOT EXISTS stability_days INTEGER NOT NULL DEFAULT 60,   -- re-suggest cooldown
  ADD COLUMN IF NOT EXISTS weight_drain   NUMERIC NOT NULL DEFAULT 8;    -- score bonus for draining buffer/phase_out
