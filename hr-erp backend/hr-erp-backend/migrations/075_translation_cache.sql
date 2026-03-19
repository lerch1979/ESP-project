-- Migration 075: Translation Cache & Statistics (ADDITIVE ONLY)
BEGIN;

-- Translation cache (30-day TTL)
CREATE TABLE IF NOT EXISTS translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text TEXT NOT NULL,
  source_lang VARCHAR(5) NOT NULL,
  target_lang VARCHAR(5) NOT NULL,
  translated_text TEXT NOT NULL,
  char_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',
  hit_count INTEGER DEFAULT 0,
  last_hit_at TIMESTAMP,
  CONSTRAINT unique_translation UNIQUE(source_text, source_lang, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_lookup
ON translation_cache(source_lang, target_lang);

CREATE INDEX IF NOT EXISTS idx_translation_cache_expiry
ON translation_cache(expires_at);

-- Translation daily stats
CREATE TABLE IF NOT EXISTS translation_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_lang VARCHAR(5) NOT NULL,
  target_lang VARCHAR(5) NOT NULL,
  api_calls INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  total_chars INTEGER DEFAULT 0,
  estimated_cost DECIMAL(10,4) DEFAULT 0,
  CONSTRAINT unique_daily_stat UNIQUE(date, source_lang, target_lang)
);

-- Add language column to tickets if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='language') THEN
    ALTER TABLE tickets ADD COLUMN language VARCHAR(5) DEFAULT 'hu';
  END IF;
END $$;

-- Cache hit increment function
CREATE OR REPLACE FUNCTION increment_cache_hit(
  p_source_text TEXT, p_source_lang VARCHAR(5), p_target_lang VARCHAR(5)
) RETURNS void AS $$
BEGIN
  UPDATE translation_cache
  SET hit_count = hit_count + 1, last_hit_at = NOW()
  WHERE source_text = p_source_text AND source_lang = p_source_lang AND target_lang = p_target_lang;
END;
$$ LANGUAGE plpgsql;

-- Cleanup cron: delete expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_translations() RETURNS void AS $$
BEGIN
  DELETE FROM translation_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMIT;
