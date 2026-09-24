-- 178 — az ALÁÍRT dokumentum megőrzése
--
-- A PROBLÉMA, AMIT EZ MEGOLD (tulajdonosi kikötés, 2026-09-24):
-- ma EGYETLEN PDF SINCS eltárolva. Sem az ellenőrzési jegyzőkönyv, sem a
-- kárjegyzőkönyv: minden letöltés ÚJRAGENERÁL az AKTUÁLIS adatból és az AKTUÁLIS
-- sablonból. Vagyis egy tavaly aláírt jegyzőkönyv ma másképp nézhet ki — és a
-- most következő HTML-átállás után biztosan másképp is nézne ki.
--
-- Egy vitában ez végzetes: a másik fél bemutat egy papírt, mi kinyomtatjuk ugyanazt
-- az azonosítót, és a kettő nem egyezik. Nem azért, mert bárki hamisított, hanem mert
-- a rendszer sosem őrizte meg, amit aláírtak.
--
-- A MEGOLDÁS KÉT RÉTEGŰ, és ez szándékos:
--   1. `document_signatures.signed_snapshot` (mig 177) — az ADATOK, ahogy aláírták.
--      Ebből a dokumentum TARTALMA bármikor hűen reprodukálható, akkor is, ha a
--      sablon azóta változott.
--   2. ez a tábla — a RENDERELT PDF maga, bájtra pontosan.
--      Ez az, amit "pontosan úgy, ahogy aláírták" jelent.
--
-- MIÉRT NEM AZ ALÁÍRÁS PILLANATÁBAN KÉSZÜL: a PDF-gyártás Chrome-ot indít, lassú és
-- elbukhat. A helyszínen álló lakó aláírása nem múlhat ezen. Ezért az aláírás azonnal
-- rögzül, a PDF pedig KÖZVETLENÜL UTÁNA, a válasz útján kívül készül el. Ha nem
-- sikerül, a letöltés a pillanatképből renderel — az adat akkor is hű.

BEGIN;

CREATE TABLE IF NOT EXISTS signed_document_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ugyanaz az azonosítás, mint az aláírásoknál.
  subject_type varchar(32) NOT NULL
    CHECK (subject_type IN ('damage_report','inspection','compensation_resident','document')),
  subject_id   uuid NOT NULL,
  -- Egy ellenőrzéshez több dokumentum tartozik (jegyzőkönyv, riport); a nyelv pedig
  -- azé, aki aláírta. A három együtt azonosít egy megőrzött példányt.
  doc_kind varchar(32) NOT NULL,
  language varchar(5)  NOT NULL CHECK (language IN ('hu','en','uk','tl','de')),

  -- Melyik aláíráshoz tartozik. Ha az aláírást törlik, az archív példány MARAD:
  -- egy vitában pont az a kérdés, mi volt akkor — ezért SET NULL, nem CASCADE.
  signature_id uuid REFERENCES document_signatures(id) ON DELETE SET NULL,

  pdf_bytes bytea NOT NULL,
  pdf_sha256 char(64) NOT NULL,
  byte_size integer NOT NULL,
  -- A sablon verziója, amivel készült — így utólag is tudni, melyik változat volt.
  template_version varchar(32) NOT NULL,

  created_at timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT signed_document_archive_size_chk CHECK (byte_size > 0)
);

-- Egy (dokumentum, fajta, nyelv) hármasból EGY megőrzött példány. Újraaláírás esetén a
-- régit nem írjuk felül: az aláírás is új sor, tehát ez is új sor lesz — a régi marad
-- bizonyítéknak. (A korlát azért részleges, hogy a NULL signature_id ne ütközzön.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_signed_archive
  ON signed_document_archive (subject_type, subject_id, doc_kind, language, signature_id)
  WHERE signature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signed_archive_subject
  ON signed_document_archive (subject_type, subject_id);

COMMENT ON TABLE signed_document_archive IS
  'Az ALÁÍRÁSKOR renderelt PDF, bájtra pontosan (mig 178). Enélkül minden letöltés '
  'újragenerálna az aktuális sablonból, és egy tavaly aláírt jegyzőkönyv ma másképp '
  'nézne ki. A tartalom hű reprodukcióját a document_signatures.signed_snapshot adja; '
  'ez a tábla a bájtazonos példány.';

COMMIT;
