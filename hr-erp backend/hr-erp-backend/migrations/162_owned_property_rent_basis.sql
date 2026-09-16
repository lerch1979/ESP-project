-- 162: SAJÁT TULAJDON mint bérleti konstrukció — a nulla díj ne legyen megkülönböztethetetlen
--      a be nem állított díjtól.
--
-- A PROBLÉMA
-- ----------
-- A Fertőd a saját ingatlanunk: nincs bérleti díj és nincs szállásadó, viszont rezsi igen.
-- A rendszer ezt eddig nem ismerte külön esetként, így két rossz választás maradt:
--
--   • rent_basis üresen → a lefedettség-ellenőrzés hiányzó beállításként riaszt rá,
--     hónapról hónapra, pedig nincs mit beállítani;
--   • rent_basis='flat' + rent_amount=0 → a riasztás elhallgat, de egy SZÁNDÉKOSAN nulla
--     díj ettől kezdve ugyanúgy néz ki, mint egy elfelejtett érték. Fél év múlva senki nem
--     tudja megmondani, melyik melyik.
--
-- Ezért kap saját értéket: 'sajat_tulajdon'. A motor nulla bérleti díjat számol rá — de
-- most már azért, mert így döntöttünk, nem azért, mert hiányzik egy adat.
--
-- A szállásadó (current_contractor_id) ilyenkor szándékosan NULL: nincs kitől bérelni.

BEGIN;

ALTER TABLE accommodations DROP CONSTRAINT IF EXISTS accommodations_rent_basis_chk;
ALTER TABLE accommodations ADD CONSTRAINT accommodations_rent_basis_chk
  CHECK (rent_basis IS NULL OR rent_basis IN ('flat','per_bed_night','mixed','sajat_tulajdon'));

COMMENT ON COLUMN accommodations.rent_basis IS
  'Bérleti konstrukció: flat (fix havi díj) | per_bed_night (ágy/éj) | mixed (vegyes) | sajat_tulajdon (saját ingatlan: nincs bérleti díj és nincs szállásadó, csak rezsi). NULL = még nincs beállítva, a motor a monthly_rent-et használja flat-ként.';

-- Fertőd: saját tulajdon.
UPDATE accommodations
   SET rent_basis = 'sajat_tulajdon', rent_amount = NULL, rent_per_bed_night = NULL
 WHERE name = 'Fertőd';

COMMIT;
