-- 179 — DOKUMENTUM-KIKÜLDÉS a videó-modul általánosításával
--
-- A DÖNTÉS (2026-09-24): a házirend/tájékoztató kiküldéséhez NE épüljön új modul.
-- A videó-modul (mig 143) már tartalmazza a teljes vázat:
--   • célzás                        → video_announcements.audience
--   • NYELVENKÉNTI kézbesítés       → video_announcement_recipients.language
--   • kötelező jelleg               → is_mandatory
--   • emlékeztető, ha nem nézte meg → renag_sent_at + napi cron
--   • a lakó látja a telefonján     → GET /videos/my
--   • visszaigazolás                → POST /videos/my/:id/view
-- Ami hiányzott: egy DOKUMENTUM-típus és az ALÁÍRÁS. Ez a migráció azt adja hozzá.
--
-- ELNEVEZÉSI ADÓSSÁG, kimondva: a tábla neve `videos` marad, pedig mostantól
-- dokumentumot is tárol. Az átnevezés 40+ hivatkozást érintene (nézetek, kontrollerek,
-- sorozatok, a mobil), és a haszna kozmetikai. A `kind` oszlop egyértelművé teszi, mi
-- van a sorban — ezt a kompromisszumot tudatosan vállaljuk, nem véletlenül maradt így.

BEGIN;

-- ── 1. A kiküldhető tartalom TÍPUSA ─────────────────────────────────────────
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'video',
  -- A dokumentum FÁJLJA a meglévő `documents` táblában él — nem másoljuk át.
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  -- Van, amit elég megnézni (tájékoztató), és van, amit ALÁ IS KELL ÍRNI (házirend).
  -- A kettő külön: egy kötelező videót sem íratunk alá.
  ADD COLUMN IF NOT EXISTS requires_signature boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_kind_chk') THEN
    ALTER TABLE videos ADD CONSTRAINT videos_kind_chk
      CHECK (kind IN ('video', 'document'));
  END IF;
  -- Dokumentumhoz FÁJL kell, videóhoz URL. Enélkül egy üres sort is ki lehetne küldeni,
  -- és a lakó egy kattinthatatlan tételt látna a listájában.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_kind_source_chk') THEN
    ALTER TABLE videos ADD CONSTRAINT videos_kind_source_chk
      CHECK (kind <> 'document' OR document_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_videos_kind ON videos (kind) WHERE kind <> 'video';

COMMENT ON COLUMN videos.kind IS
  'video | document. A tábla neve történeti (mig 143); mostantól dokumentumot is tárol.';

-- ── 2. Az ALÁÍRHATÓ dokumentum mint aláírás-tárgy ───────────────────────────
-- A `sent_document` az EGY SZEMÉLYNEK KIKÜLDÖTT példány (a recipients sor), nem a
-- dokumentum maga. Így a "egy szerep egyszer ír alá" egyedi index természetesen azt
-- jelenti: minden címzett a SAJÁT példányát írja alá, egyszer.
ALTER TABLE document_signatures DROP CONSTRAINT IF EXISTS document_signatures_subject_type_check;
ALTER TABLE document_signatures ADD CONSTRAINT document_signatures_subject_type_check
  CHECK (subject_type IN ('damage_report','inspection','compensation_resident',
                          'document','sent_document'));

ALTER TABLE signed_document_archive DROP CONSTRAINT IF EXISTS signed_document_archive_subject_type_check;
ALTER TABLE signed_document_archive ADD CONSTRAINT signed_document_archive_subject_type_check
  CHECK (subject_type IN ('damage_report','inspection','compensation_resident',
                          'document','sent_document'));

COMMIT;
