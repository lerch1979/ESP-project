-- Migration 128: Video Knowledge Base MVP foundation
--   1) Real workplaces seeded + employees.workplace_id FK (reliable scoping)
--   2) videos: scope (global|workplace|contractor) + base_language + audit
--   3) video_versions: per-language FULL-DUB playback URLs (language → CDN URL)
--   4) video_subtitles: optional secondary subtitle tracks (mix dub + subs)
--   5) video_views: completion tracking (compliance evidence)
--
-- Scoping decision: company-specific training (e.g. Autoliv fire-safety) keys off
-- WORKPLACE (the physical site), not contractor. The real workplace data is clean
-- (2 distinct values: "Autoliv Kft" 174, "Ikea" 109; 4 blanks are test accounts),
-- so the backfill is a deterministic name match — no fuzzy resolution.

BEGIN;

-- ── 1. Workplaces: seed the REAL sites; retire the demo rows ──
INSERT INTO workplaces (name, is_active)
VALUES ('Autoliv Kft', true), ('Ikea', true)
ON CONFLICT (name) DO UPDATE SET is_active = true;

-- Demo placeholders ("Gyár A", "Raktár") are not real worksites.
UPDATE workplaces SET is_active = false
 WHERE name NOT IN ('Autoliv Kft', 'Ikea');

-- employees.workplace_id FK + deterministic backfill from the clean text column.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS workplace_id UUID REFERENCES workplaces(id) ON DELETE SET NULL;

UPDATE employees e
   SET workplace_id = w.id
  FROM workplaces w
 WHERE btrim(coalesce(e.workplace, '')) <> ''
   AND btrim(lower(e.workplace)) = btrim(lower(w.name));

CREATE INDEX IF NOT EXISTS idx_employees_workplace_id ON employees(workplace_id);

-- ── 2. videos: scoping + base language + audit + featured ──
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS workplace_id UUID REFERENCES workplaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS base_language VARCHAR(5) NOT NULL DEFAULT 'hu',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- A full-dub video has no single base url (playback comes from video_versions);
-- url becomes an optional legacy fallback.
ALTER TABLE videos ALTER COLUMN url DROP NOT NULL;

ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_scope_check;
ALTER TABLE videos ADD CONSTRAINT videos_scope_check
  CHECK (scope IN ('global', 'workplace', 'contractor'));

-- A scoped video must point at its target.
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_scope_target_check;
ALTER TABLE videos ADD CONSTRAINT videos_scope_target_check CHECK (
  scope = 'global'
  OR (scope = 'workplace'  AND workplace_id  IS NOT NULL)
  OR (scope = 'contractor' AND contractor_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_videos_scope_workplace ON videos(scope, workplace_id);

-- ── 3. video_versions: per-language full-dub renders (Eszti, 5 langs) ──
CREATE TABLE IF NOT EXISTS video_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id          UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  language          VARCHAR(5) NOT NULL,
  playback_url      TEXT NOT NULL,            -- Bunny Stream HLS playback URL
  provider_asset_id TEXT,                     -- Bunny library/video id (for API ops)
  duration          INTEGER NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'ready', -- ready|processing|failed
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, language),
  CHECK (language IN ('hu', 'en', 'uk', 'tl', 'de'))
);
CREATE INDEX IF NOT EXISTS idx_video_versions_video ON video_versions(video_id);

-- ── 4. video_subtitles: optional secondary subtitle tracks ──
CREATE TABLE IF NOT EXISTS video_subtitles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  language   VARCHAR(5) NOT NULL,
  vtt_url    TEXT NOT NULL,                   -- WebVTT file (object storage)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, language),
  CHECK (language IN ('hu', 'en', 'uk', 'tl', 'de'))
);
CREATE INDEX IF NOT EXISTS idx_video_subtitles_video ON video_subtitles(video_id);

-- ── 5. video_views: completion tracking (compliance evidence) ──
-- Dedupe first (the table never had a uniqueness guard), keeping the "best" row
-- per (user, video): completed first, then latest.
DELETE FROM video_views v
 WHERE v.id NOT IN (
   SELECT DISTINCT ON (user_id, video_id) id
     FROM video_views
    ORDER BY user_id, video_id, completed DESC, watched_at DESC
 );

ALTER TABLE video_views
  ADD COLUMN IF NOT EXISTS progress_pct      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_position_sec INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_count       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS language_watched  VARCHAR(5),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill completed_at for rows already flagged completed.
UPDATE video_views SET completed_at = watched_at WHERE completed = true AND completed_at IS NULL;

ALTER TABLE video_views DROP CONSTRAINT IF EXISTS video_views_user_video_uniq;
ALTER TABLE video_views ADD CONSTRAINT video_views_user_video_uniq UNIQUE (user_id, video_id);

COMMIT;
