-- ============================================================
-- 108_task_photos_thumbnail_url.sql
--
-- Adds the thumbnail_url column the photo upload route writes. The
-- original 107 migration sketched the table but left the thumb path
-- out — sharp produces a 300px thumb alongside the main image and
-- callers want both.
-- ============================================================

BEGIN;

ALTER TABLE task_photos
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

COMMIT;
