-- 143: Resident video communication — library, targeted sends, automated sequences.
--
-- Reading does not work for this workforce; video does. Residents receive information as
-- video, in THEIR language, by push, targeted to whoever it concerns — plus a permanent
-- searchable library so a missed or situational topic (doctor, bank) is findable later.
--
-- REUSES, does not duplicate:
--   videos / video_versions / video_subtitles  — storage + per-language playback (mig 08x)
--   video_views                                — watch evidence, unique (user_id, video_id)
--   notifications + user_push_tokens           — delivery
--   translation_cache                          — per-language copy
--
-- THE THREE SEND MODES all funnel through ONE send path (video_announcements):
--   B  ad-hoc      — staff picks video + audience + sends now
--   A1 drip        — steps at arbitrary day offsets from an employee-date anchor
--   A2 calendar    — steps on a month-day, recurring annually
--
-- IDEMPOTENCY (the thing that makes a daily job safe) follows the expiry_alert_log
-- precedent: video_sequence_sends carries UNIQUE (sequence_id, step_id, user_id) and the
-- job inserts with ON CONFLICT DO NOTHING. Re-runs are no-ops; a late joiner simply has
-- no row yet, so their day-1 step fires the first time the job sees them.

BEGIN;

-- ── sequences: several may exist and be created from the admin, no code change ──
CREATE TABLE IF NOT EXISTS video_sequences (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          varchar(200) NOT NULL,
  description   text,
  -- move_in          → employees.arrival_date  (housing sequences)
  -- employment_start → employees.start_date    (0/288 today, populated going forward)
  -- calendar         → month_day on each step, recurring every year
  anchor_type   varchar(24)  NOT NULL,
  audience      jsonb        NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean      NOT NULL DEFAULT false,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz  NOT NULL DEFAULT NOW(),
  updated_at    timestamptz  NOT NULL DEFAULT NOW(),
  CONSTRAINT video_sequences_anchor_chk CHECK (anchor_type IN ('move_in','employment_start','calendar'))
);
COMMENT ON TABLE video_sequences IS
  'Videó-sorozatok. Horgony: beköltözés (arrival_date) / munkakezdés (start_date) / naptári dátum (évente ismétlődő).';

-- ── steps: ARBITRARY day index, not one per day (1,2,3,7,14,30 — dense then sparse) ──
CREATE TABLE IF NOT EXISTS video_sequence_steps (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id  uuid NOT NULL REFERENCES video_sequences(id) ON DELETE CASCADE,
  video_id     uuid NOT NULL REFERENCES videos(id) ON DELETE RESTRICT,
  day_offset   integer,       -- move_in / employment_start: 1 = the anchor day itself
  month_day    char(5),       -- calendar: 'MM-DD', e.g. '12-20'
  is_mandatory boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  -- exactly one scheduling key, matching the parent's anchor type
  CONSTRAINT video_sequence_steps_key_chk CHECK (
    (day_offset IS NOT NULL AND month_day IS NULL AND day_offset >= 1)
    OR (month_day IS NOT NULL AND day_offset IS NULL AND month_day ~ '^[0-1][0-9]-[0-3][0-9]$')
  )
);
CREATE INDEX IF NOT EXISTS idx_vss_sequence ON video_sequence_steps(sequence_id, day_offset, month_day);

-- ── one send (ad-hoc OR one sequence step firing for one audience) ──
CREATE TABLE IF NOT EXISTS video_announcements (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id        uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  source          varchar(16) NOT NULL DEFAULT 'adhoc',
  sequence_id     uuid REFERENCES video_sequences(id) ON DELETE SET NULL,
  step_id         uuid REFERENCES video_sequence_steps(id) ON DELETE SET NULL,
  audience        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_mandatory    boolean NOT NULL DEFAULT false,
  recipient_count integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES users(id),
  sent_at         timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT video_announcements_source_chk CHECK (source IN ('adhoc','sequence'))
);
CREATE INDEX IF NOT EXISTS idx_va_video ON video_announcements(video_id, sent_at DESC);

-- ── who it went to, in which language, and whether the push landed ──
-- This is ALSO the resident's visibility list: /videos/my shows what you were sent.
CREATE TABLE IF NOT EXISTS video_announcement_recipients (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id uuid NOT NULL REFERENCES video_announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id     uuid REFERENCES employees(id) ON DELETE SET NULL,
  language        varchar(5) NOT NULL DEFAULT 'hu',
  notification_id uuid,
  push_ok         boolean,
  push_error      text,
  renag_sent_at   timestamptz,     -- mandatory + still unwatched → one reminder, once
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_var UNIQUE (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_var_user ON video_announcement_recipients(user_id, created_at DESC);

-- ── the idempotency ledger for sequences (expiry_alert_log shape) ──
-- A step fires ONCE per person, ever. Re-running the daily job changes nothing; a
-- resident who joins later simply has no row yet, so their day 1 fires when first seen.
CREATE TABLE IF NOT EXISTS video_sequence_sends (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id     uuid NOT NULL REFERENCES video_sequences(id) ON DELETE CASCADE,
  step_id         uuid NOT NULL REFERENCES video_sequence_steps(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id uuid REFERENCES video_announcements(id) ON DELETE SET NULL,
  day_index       integer,          -- the resident's own day number when it fired
  sent_on         date NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT uq_vss_send UNIQUE (sequence_id, step_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_vseq_sends_day ON video_sequence_sends(user_id, sent_on);

-- ── runtime config (hygiene_fine_config / expiry_monitor_config pattern) ──
CREATE TABLE IF NOT EXISTS video_delivery_config (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enabled            boolean NOT NULL DEFAULT true,
  max_videos_per_day integer NOT NULL DEFAULT 1,   -- per person, across ALL sequences
  renag_after_days   integer NOT NULL DEFAULT 3,   -- mandatory + unwatched → one reminder
  renag_enabled      boolean NOT NULL DEFAULT true,
  updated_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);
INSERT INTO video_delivery_config (enabled, max_videos_per_day, renag_after_days)
SELECT true, 1, 3 WHERE NOT EXISTS (SELECT 1 FROM video_delivery_config);

COMMENT ON COLUMN video_delivery_config.max_videos_per_day IS
  'Napi videó-korlát fejenként, ÖSSZES sorozatra együtt. A többi a következő napra csúszik — senkit nem spamelünk.';

COMMIT;
