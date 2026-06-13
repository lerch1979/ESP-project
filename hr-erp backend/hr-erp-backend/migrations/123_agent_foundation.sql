-- 123: AI agent layer — foundation schema.
--
-- Backs the "AI AGENT LAYER over HR-ERP" roadmap (MASTER_TODO.md §STRATEGIC).
-- Core principle: deterministic detection → LLM interpretation → HUMAN APPROVAL
-- → deterministic execution, with a FULL AUDIT LOG. This migration lays the
-- three tables that principle needs:
--
--   1. entity_status_history  — WIRED NOW. App-level status-transition log for
--      tickets / employees / damage_reports. The "efficiency" agent (roadmap
--      agent #3) needs ≥4 weeks of these rows before it can be built, so we
--      start collecting today. Written by entityStatusHistory.service.js — a
--      best-effort, never-throws recorder fired AFTER the real write commits,
--      so existing flows are never affected.
--
--   2. agent_audit_log        — SCHEMA-ONLY scaffolding. The "full audit log"
--      every agent action must leave (who/what/model/tokens/outcome). No code
--      writes it yet; it ships now so the schema is stable before Phase 0.
--
--   3. agent_suggestions      — SCHEMA-ONLY scaffolding. The human-approval
--      queue: an agent proposes (status change / assignment / reply …), a human
--      accepts/rejects, then deterministic code applies it. No code writes it
--      yet.
--
-- Additive + idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS). No data change to existing rows. Safe on fresh (CI) and on dev.
--
-- Design note — no FKs on entity_id / changed_by / reviewed_by:
--   These are polymorphic (entity_type drives which table entity_id points at)
--   and the recorder must NEVER fail a status write because of a dangling
--   reference. We follow the existing activity_logs precedent (its entity_id
--   has no FK) and keep the columns permissive, indexed instead of constrained.

-- ─── 1. entity_status_history (WIRED) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_status_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  VARCHAR(40)  NOT NULL,        -- 'ticket' | 'employee' | 'damage_report'
  entity_id    UUID         NOT NULL,        -- the row whose status changed
  from_status  VARCHAR(100),                 -- slug/value; NULL on initial seed (create)
  to_status    VARCHAR(100),                 -- slug/value of the new status
  from_label   TEXT,                         -- human-readable old label; NULL on seed
  to_label     TEXT,                         -- human-readable new label
  changed_by   UUID,                         -- acting user; NULL if system/unknown
  source       VARCHAR(20),                  -- 'create' | 'update' | 'bulk'
  metadata     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  changed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_entity_status_history_entity
  ON entity_status_history (entity_type, entity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS ix_entity_status_history_changed_by
  ON entity_status_history (changed_by);
CREATE INDEX IF NOT EXISTS ix_entity_status_history_changed_at
  ON entity_status_history (changed_at DESC);

-- ─── 2. agent_audit_log (schema-only scaffolding) ───────────────────────────
CREATE TABLE IF NOT EXISTS agent_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    VARCHAR(80) NOT NULL,        -- 'compliance_watchdog' | 'data_quality' | ...
  action        VARCHAR(80) NOT NULL,        -- what the agent did / attempted
  entity_type   VARCHAR(40),                 -- optional subject of the action
  entity_id     UUID,
  input         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- what it was given
  output        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- what it produced
  model         VARCHAR(80),                 -- e.g. 'claude-haiku-4-5'
  tokens_input  INTEGER,
  tokens_output INTEGER,
  status        VARCHAR(20) NOT NULL DEFAULT 'ok',    -- 'ok' | 'error' | 'skipped'
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_agent_audit_log_agent
  ON agent_audit_log (agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_agent_audit_log_entity
  ON agent_audit_log (entity_type, entity_id);

-- ─── 3. agent_suggestions (schema-only scaffolding) ─────────────────────────
CREATE TABLE IF NOT EXISTS agent_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      VARCHAR(80) NOT NULL,
  entity_type     VARCHAR(40) NOT NULL,      -- subject of the proposal
  entity_id       UUID,
  suggestion_type VARCHAR(60) NOT NULL,      -- 'status_change' | 'assignment' | 'reply' | ...
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- the proposed deterministic change
  rationale       TEXT,                      -- the LLM's human-readable reasoning
  confidence      NUMERIC(4,3),              -- 0.000–1.000
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|accepted|rejected|expired|applied
  reviewed_by     UUID,                      -- human reviewer
  reviewed_at     TIMESTAMPTZ,
  applied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_agent_suggestions_status
  ON agent_suggestions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_agent_suggestions_entity
  ON agent_suggestions (entity_type, entity_id);
