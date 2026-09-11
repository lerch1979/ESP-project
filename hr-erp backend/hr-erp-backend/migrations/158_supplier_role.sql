-- 158: a beszállító bekerül a partner-törzsbe, saját szereppel.
--
-- MIÉRT KÉT SZEREP, ÉS NEM EGY
-- ----------------------------
--   beszallito   — aki SZÁMLÁZ nekünk (Soproni Vízmű, Vodafone, önkormányzat). Adószám,
--                  számla, fizetési határidő tartozik hozzá.
--   alvallalkozo — aki MUNKÁT VÉGEZ (villanyszerelő). Hibajegy osztható rá, és a Phase 4
--                  szerepkör-modelljében saját, szűkített hozzáférést kap.
-- A kettő átfedhet: a villanyszerelő dolgozik IS és számláz IS. A `contractor_roles`
-- külön sorokban tárolja a szerepeket, tehát ez egy cég két szereppel — nem két
-- bejegyzés. Ha egyetlen "beszállító" szerepbe olvasztanánk, elveszne, kire lehet munkát
-- osztani, és a most épült alvállalkozói jogosultság értelmét vesztené.
--
-- AZ ÖSSZEFÉSÜLÉST NEM A MIGRÁCIÓ DÖNTI EL
-- ----------------------------------------
-- Csak azok a beszállítók kerülnek be automatikusan, amelyeknek EGYETLEN írásmódja van.
-- Ahol több változat létezik ugyanarra a cégre (prod: a "Rába" / '"RÁBA"' pár), ott a
-- migráció NEM hoz létre partnert és nem köt össze semmit — azt egy ember dönti el a
-- `scripts/list-vendor-duplicates.js` listája alapján. Nevek alapján automatikusan
-- egyesíteni pontosan az a hiba, amit a mig 127 óta kerülünk.
--
-- A SZABAD SZÖVEG MARAD
-- ---------------------
-- A `vendor_name` oszlopokat nem töröljük: a régi sorok szövege a bizonyíték arra, mi
-- volt a számlán, és egy még be nem sorolt beszállítót is rögzíteni kell tudni. Az FK
-- (`vendor_contractor_id`) MELLÉ kerül, nem helyette.

BEGIN;

-- ── 1. az új szerep ─────────────────────────────────────────────────────────
-- A tényleges név `contractor_roles_role_chk` (nem `..._check`) — mindkettőt eldobjuk,
-- hogy a migráció attól függetlenül lefusson, melyik konvencióval született a tábla.
ALTER TABLE contractor_roles DROP CONSTRAINT IF EXISTS contractor_roles_role_chk;
ALTER TABLE contractor_roles DROP CONSTRAINT IF EXISTS contractor_roles_role_check;
ALTER TABLE contractor_roles ADD CONSTRAINT contractor_roles_role_chk
  CHECK (role IN ('megbizo', 'szallasado', 'alvallalkozo', 'beszallito'));

COMMENT ON COLUMN contractor_roles.role IS
  'megbizo = ügyfél, akinek számlázunk · szallasado = akitől szállást bérlünk · '
  'alvallalkozo = aki munkát végez (hibajegy osztható rá) · beszallito = aki számláz nekünk. '
  'Egy partner több szerepet is kaphat — a villanyszerelő dolgozik IS és számláz IS.';

-- ── 2. kapcsolat a számlán és a költségen ───────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS vendor_contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL;
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS vendor_contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_vendor_contractor
  ON invoices (vendor_contractor_id) WHERE vendor_contractor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acc_exp_vendor_contractor
  ON accommodation_expenses (vendor_contractor_id) WHERE vendor_contractor_id IS NOT NULL;

COMMENT ON COLUMN invoices.vendor_contractor_id IS
  'A beszállító a partner-törzsből (mig 158). A vendor_name szabad szöveg MEGMARAD: az a bizonyíték, mi állt a számlán, és a még be nem sorolt beszállítókat is rögzíteni kell tudni.';

-- ── 3. az egyértelmű beszállítók felvétele ──────────────────────────────────
-- Kulcs: ékezet/kisbetű/írásjel nélküli név. Csak az kerül be, amiből EGY írásmód van.
CREATE TEMP TABLE vendor_forras AS
  SELECT vendor_name AS nev, vendor_tax_number AS adoszam
    FROM invoices WHERE deleted_at IS NULL AND vendor_name IS NOT NULL AND btrim(vendor_name) <> ''
  UNION ALL
  SELECT vendor_name, vendor_tax_number
    FROM accommodation_expenses WHERE deleted_at IS NULL AND vendor_name IS NOT NULL AND btrim(vendor_name) <> '';

CREATE TEMP TABLE vendor_kulcs AS
  SELECT btrim(regexp_replace(lower(translate(nev,
           'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuaeiooouuu')), '[^a-z0-9]+', ' ', 'g')) AS kulcs,
         nev, adoszam
    FROM vendor_forras;

CREATE TEMP TABLE vendor_egyertelmu AS
  SELECT kulcs, min(nev) AS nev,
         (ARRAY_AGG(adoszam) FILTER (WHERE adoszam IS NOT NULL))[1] AS adoszam
    FROM vendor_kulcs
   GROUP BY kulcs
  HAVING count(DISTINCT nev) = 1;   -- a többváltozatúakat KIHAGYJUK

-- Partner létrehozása annak, aki még nincs a törzsben (név szerint).
INSERT INTO contractors (name, slug, is_active, tax_number)
SELECT v.nev,
       left(regexp_replace(lower(translate(v.nev,
         'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuaeiooouuu')), '[^a-z0-9]+', '-', 'g'), 90)
         || '-' || substr(md5(v.kulcs), 1, 6),
       true, v.adoszam
  FROM vendor_egyertelmu v
 WHERE NOT EXISTS (
   SELECT 1 FROM contractors c
    WHERE lower(btrim(c.name)) = lower(btrim(v.nev)));

-- A beszallito szerep rátétele (a meglévő partnerekre is, ha ők számláztak).
INSERT INTO contractor_roles (contractor_id, role)
SELECT c.id, 'beszallito'
  FROM contractors c
  JOIN vendor_egyertelmu v ON lower(btrim(c.name)) = lower(btrim(v.nev))
 WHERE NOT EXISTS (
   SELECT 1 FROM contractor_roles r WHERE r.contractor_id = c.id AND r.role = 'beszallito');

-- ── 4. a meglévő tételek összekötése ────────────────────────────────────────
UPDATE invoices i SET vendor_contractor_id = c.id
  FROM contractors c
 WHERE i.vendor_contractor_id IS NULL AND i.deleted_at IS NULL
   AND lower(btrim(i.vendor_name)) = lower(btrim(c.name));

UPDATE accommodation_expenses e SET vendor_contractor_id = c.id
  FROM contractors c
 WHERE e.vendor_contractor_id IS NULL AND e.deleted_at IS NULL
   AND lower(btrim(e.vendor_name)) = lower(btrim(c.name));

COMMIT;
