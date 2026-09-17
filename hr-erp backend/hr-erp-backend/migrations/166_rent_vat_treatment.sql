-- 166: a bérleti díj ÁFA-kezelése — mert eddig sehol nem volt rögzítve.
--
-- A PROBLÉMA
-- ----------
-- A `rent_amount` egy szám, és semmi nem mondja meg, mit jelent:
--
--   Sopronhorpács   3 819 512   nettó, az ÁFA levonható
--   Fertőszéplak      600 000   áfamentes — nincs mit levonni
--   Bük ×4              2 400   áfamentes (magánszemély bérbeadó)
--   Fertőrákos      1 727 230   a bruttóból visszaszámolt nettó
--
-- Ugyanaz a mező, négyféle jelentés. Aki fél év múlva ránéz, nem tudja megmondani, hogy
-- egy 600 000-es szám azért ennyi, mert áfamentes, vagy mert valaki elfelejtette levonni
-- az ÁFÁ-t. A különbség 27%, és pont a margóban jelenik meg.
--
-- A tárolt összeg MINDIG a tényleges ráfordítás marad (nettó, ha levonható; teljes összeg,
-- ha nem). Ez a mező nem a számítást változtatja meg, hanem megőrzi, MIÉRT az a szám —
-- és megmutatja, hol nem tudjuk még.

BEGIN;

ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS rent_vat_treatment varchar(24);

DO $$ BEGIN
  ALTER TABLE accommodations ADD CONSTRAINT acc_rent_vat_chk
    CHECK (rent_vat_treatment IS NULL OR rent_vat_treatment IN
           ('afamentes', 'netto_levonhato', 'brutto_nem_levonhato'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN accommodations.rent_vat_treatment IS
  'afamentes = nincs ÁFA a bérleti díjon | netto_levonhato = a tárolt összeg NETTÓ, az ÁFA levonható (átfutó tétel) | brutto_nem_levonhato = a tárolt összeg a teljes fizetett összeg, az ÁFA nem vonható le. NULL = még nem tisztázott.';

-- Amit a tulajdonos eddig megadott.
UPDATE accommodations SET rent_vat_treatment = 'netto_levonhato'
 WHERE name IN ('Sopronhorpács', 'Röjtökmuzsaj', 'Fertőrákos', 'Beled');

UPDATE accommodations SET rent_vat_treatment = 'afamentes'
 WHERE name IN ('Fertőszéplak', 'Bük_Barki Apartman', 'Bük_Ifjúság 88.',
                'Bük_Kossuth L.u.89.', 'Bük_Petőfi 16');

-- Fertőd: saját ingatlan, nincs bérleti díj — az ÁFA-kérdés fel sem merül.
UPDATE accommodations SET rent_vat_treatment = 'afamentes'
 WHERE name = 'Fertőd' AND rent_basis = 'sajat_tulajdon';

-- Sarród I/II és Petőháza szándékosan NULL marad: ott még nyitott kérdés.

COMMIT;
