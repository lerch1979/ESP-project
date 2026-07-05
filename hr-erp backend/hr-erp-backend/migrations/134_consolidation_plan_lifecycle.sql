-- 134: Room Consolidation Engine v3 — plan approval → MOVE TASK lifecycle.
--
-- v2 applied room changes at approval time. v3 makes approval create a MOVE
-- TICKET (reusing the ticket system) and defers the actual room reassignment
-- until the physical move is CONFIRMED done — mirroring how it's done by hand:
-- instruct (approve → ticket) → execute (physical move) → confirm (apply).
--
-- Room assignments (and therefore occupancy snapshots + billing) do NOT change
-- until confirm. The stability clock also starts at confirm, not approval.
--
-- agent_suggestions.status gains lifecycle values (free VARCHAR, no enum):
--   pending → approved → applied            (move confirmed done)
--                     ↘ skipped             (confirmed NOT done, reason logged)
--                     ↘ cancelled           (plan cancelled)
--           ↘ rejected (individually rejected before approval)

CREATE TABLE IF NOT EXISTS consolidation_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID NOT NULL REFERENCES consolidation_runs(id) ON DELETE CASCADE,
  plan_key         UUID NOT NULL,                 -- matches agent_suggestions.payload.plan_key
  status           VARCHAR(24) NOT NULL DEFAULT 'approved_pending_move',
                   -- approved_pending_move | moved | partially_moved | cancelled
  ticket_id        UUID REFERENCES tickets(id) ON DELETE SET NULL,
  assignee_user_id UUID,
  due_date         TIMESTAMPTZ,
  move_count       INTEGER NOT NULL DEFAULT 0,     -- moves in the plan at approval
  applied_count    INTEGER NOT NULL DEFAULT 0,     -- moves actually applied at confirm
  skipped_count    INTEGER NOT NULL DEFAULT 0,     -- moves marked not-done at confirm
  approved_by      UUID,
  approved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by     UUID,
  confirmed_at     TIMESTAMPTZ,
  UNIQUE (run_id, plan_key)
);
CREATE INDEX IF NOT EXISTS ix_consolidation_plans_run ON consolidation_plans (run_id);
CREATE INDEX IF NOT EXISTS ix_consolidation_plans_ticket ON consolidation_plans (ticket_id);
