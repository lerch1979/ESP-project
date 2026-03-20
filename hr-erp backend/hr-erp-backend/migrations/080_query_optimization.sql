-- ═══════════════════════════════════════════════════════════════
-- Migration 080: Query Optimization — Indexes for common queries
-- ═══════════════════════════════════════════════════════════════

-- Pulse analytics: date range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pulse_responses_date
  ON pulse_responses(submitted_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pulse_responses_user_date
  ON pulse_responses(user_id, submitted_at DESC);

-- Damage reports: contractor + status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_damage_reports_contractor_status
  ON damage_reports(contractor_id, status)
  WHERE contractor_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_damage_reports_date_status
  ON damage_reports(created_at DESC, status);

-- Tickets: common admin list queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_contractor_status
  ON tickets(contractor_id, status)
  WHERE contractor_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_open_priority
  ON tickets(priority, created_at DESC)
  WHERE status IN ('open', 'in_progress');

-- Users: contractor-scoped active lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_contractor_active
  ON users(contractor_id, is_active)
  WHERE contractor_id IS NOT NULL AND is_active = true;

-- Accommodations: contractor filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accommodations_contractor_active
  ON accommodations(contractor_id, is_active);

-- Gamification: leaderboard ranking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gamification_points_ranking
  ON gamification_points(contractor_id, total_points DESC);

-- Partial indexes for common filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_users
  ON users(id) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_open_tickets
  ON tickets(created_at DESC) WHERE status = 'open';

-- Full-text search for user directory
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_fulltext_search
  ON users USING gin(to_tsvector('simple', coalesce(full_name, '') || ' ' || coalesce(email, '')));

-- Full-text search for tickets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_fulltext_search
  ON tickets USING gin(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));
