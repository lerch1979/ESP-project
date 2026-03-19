-- Migration 074: Language Preferences (ADDITIVE, NON-DESTRUCTIVE)
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'hu';
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS default_language VARCHAR(5) DEFAULT 'hu';
ALTER TABLE damage_reports ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'hu';

CREATE INDEX IF NOT EXISTS idx_users_preferred_language ON users(preferred_language);

UPDATE users SET preferred_language = 'hu' WHERE preferred_language IS NULL;
UPDATE contractors SET default_language = 'hu' WHERE default_language IS NULL;
UPDATE damage_reports SET language = 'hu' WHERE language IS NULL;

COMMIT;
