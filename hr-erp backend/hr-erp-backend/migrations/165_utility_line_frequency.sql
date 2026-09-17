-- 165: rezsitétel gyakorisága — havi vagy eseti.
--
-- A PROBLÉMA
-- ----------
-- A rezsi-mátrix eddig csak azt mondta meg, KI fizeti egy tételt, azt nem, hogy MILYEN
-- RENDSZERESSÉGGEL érkezik számla róla. A Fertőszéplakon a gázt mi fizetjük, de a Zöld-Lak
-- Bt. rendszertelen időközönként állít ki elszámolót — nem havonta.
--
-- Enélkül a hiányzó havi gázköltség ugyanúgy nézne ki, mint egy elfelejtett rögzítés: a
-- lefedettségi jelentés hónapról hónapra hiányt jelezne olyasmire, ami nem is hiányzik.
-- Az "eseti" jelölés azt mondja ki, hogy a tétel akkor keletkezik, amikor a számla
-- megérkezik — a könyvelése változatlan, csak nem VÁRJUK minden hónapban.

BEGIN;

ALTER TABLE accommodation_utility_lines
  ADD COLUMN IF NOT EXISTS frequency varchar(10) NOT NULL DEFAULT 'havi';

DO $$ BEGIN
  ALTER TABLE accommodation_utility_lines ADD CONSTRAINT aul_frequency_chk
    CHECK (frequency IN ('havi', 'eseti'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN accommodation_utility_lines.frequency IS
  'havi = minden hónapban várható számla | eseti = rendszertelen elszámolás, akkor könyveljük, amikor megérkezik. Az eseti tételekre a lefedettség nem jelez havi hiányt.';

-- Fertőszéplak, gáz: a Zöld-Lak Bt. rendszertelen elszámolója.
UPDATE accommodation_utility_lines u
   SET frequency = 'eseti'
  FROM accommodations a
 WHERE a.id = u.accommodation_id AND a.name = 'Fertőszéplak' AND u.line = 'gaz';

COMMIT;
