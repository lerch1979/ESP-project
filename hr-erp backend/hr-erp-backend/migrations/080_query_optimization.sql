-- ═══════════════════════════════════════════════════════════════
-- Migration 080: Query Optimization — Indexes for common queries
-- ═══════════════════════════════════════════════════════════════
--
-- History note: this migration was originally never runnable on a
-- fresh DB. It used CREATE INDEX CONCURRENTLY (which can't run inside
-- a transaction block) and referenced several phantom tables/columns
-- that don't exist in the schema:
--   * pulse_responses           — never created; the actual table is
--                                 wellmind_pulse_surveys, and 072
--                                 already indexes (user_id, survey_date)
--                                 on it.
--   * tickets.status / priority — tickets uses status_id / priority_id
--                                 FKs, not text columns.
--   * gamification_points       — never created; the actual table is
--                                 wellbeing_points (already indexed by
--                                 069: idx_points_user, idx_points_contractor).
--   * users.full_name           — there's no full_name column on users;
--                                 it's first_name + last_name.
--
-- The phantom-ref blocks are removed so the migration can finally run
-- in CI. The remaining indexes (damage_reports, accommodations,
-- users.is_active, tickets fulltext) reference real columns and are
-- safe to apply.

-- Damage reports: contractor + status filtering
CREATE INDEX IF NOT EXISTS idx_damage_reports_contractor_status
  ON damage_reports(contractor_id, status)
  WHERE contractor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_damage_reports_date_status
  ON damage_reports(created_at DESC, status);

-- Users: contractor-scoped active lookups
CREATE INDEX IF NOT EXISTS idx_users_contractor_active
  ON users(contractor_id, is_active)
  WHERE contractor_id IS NOT NULL AND is_active = true;

-- Accommodations: contractor filter
-- Column is current_contractor_id (the active assignment), not
-- contractor_id — the original 080 had it wrong.
CREATE INDEX IF NOT EXISTS idx_accommodations_contractor_active
  ON accommodations(current_contractor_id, is_active);

-- Partial index for active users
CREATE INDEX IF NOT EXISTS idx_active_users
  ON users(id) WHERE is_active = true;

-- Full-text search for tickets (title + description)
CREATE INDEX IF NOT EXISTS idx_tickets_fulltext_search
  ON tickets USING gin(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));
