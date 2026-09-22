-- 174: A BESZÁLLÍTÓ SZÁMLASZÁMA — a jogi azonosító, nem a belső sorszám.
--
-- AZ ESET: a `invoice_number` mezőbe a rendszer SAJÁT sorszámot generál (`INV-000012`),
-- és a felületen az jelenik meg Számlaszám néven. A beszállító számlaszáma viszont a
-- JOGI azonosító: azt keresi a könyvelő, azon hivatkozik a szállító, és az alapján
-- derül ki, hogy ugyanazt a számlát kétszer vittük-e be.
--
-- Élesben 22 számlából 8-on a belső sorszám áll a valódi szám helyett.
--
-- MIÉRT ÚJ MEZŐ, ÉS MIÉRT NEM ÍRJUK FELÜL AZ invoice_number-T
-- -----------------------------------------------------------
-- A belső sorszám hivatkozási pont: activity_logs bejegyzések, korábbi jelentések és a
-- felhasználók emlékezete köti hozzá. Felülírva a régi nyomok mutatnának a semmibe.
-- Ezért a belső sorszám MARAD, csak másodlagos lesz, és mellé kerül a valódi szám.
--
-- ⚠️ A DUPLIKÁCIÓ-VÉDELEM AZ, AMI MIATT EZ TÖBB MINT KOZMETIKA
-- Ugyanaz a beszállító ugyanazzal a számlaszámmal kétszer = kétszer könyvelt költség.
-- Ezt eddig SEMMI nem akadályozta. A részleges egyedi index most igen — de csak ott,
-- ahol van mire: a bérbeadói rezsi-jelzésnél nincs számla, ott a mező üres marad.

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS supplier_invoice_number varchar(100);

COMMENT ON COLUMN invoices.supplier_invoice_number IS
  'A BESZÁLLÍTÓ számlaszáma — a jogi azonosító. Ezt mutatja a felület Számlaszámként. Az invoice_number a belső sorszám, ami hivatkozási pontként megmarad, de másodlagos.';

-- ── A meglévő adat átvétele ──────────────────────────────────────────────
-- Ahol az invoice_number NEM a belső mintát követi, ott az már a beszállító száma —
-- valaki kézzel oda írta, mert nem volt hova. Azt átvesszük; ahol INV-nnn áll, ott
-- üresen hagyjuk, mert kitalálni nem lehet, és egy kitalált számlaszám rosszabb a
-- hiányzónál: azt hinnénk, megvan.
UPDATE invoices
   SET supplier_invoice_number = invoice_number
 WHERE supplier_invoice_number IS NULL
   AND invoice_number IS NOT NULL
   AND invoice_number !~ '^INV-[0-9]+$';

-- ── Duplikáció-védelem ───────────────────────────────────────────────────
-- (beszállító, számlaszám) párban egyedi. Részleges index, mert:
--   • a törölt sorok nem foglalhatják a számot,
--   • a NULL számlaszám (bérbeadói jelzés, még kitöltetlen sor) nem ütközhet.
-- A beszállító azonosítása a NEVE alapján történik kisbetűsítve és trimmelve: a
-- vendor_contractor_id sok soron üres, a név viszont mindig van.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_supplier_number
  ON invoices (lower(btrim(vendor_name)), btrim(supplier_invoice_number))
  WHERE supplier_invoice_number IS NOT NULL
    AND btrim(supplier_invoice_number) <> ''
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_supplier_number
  ON invoices (supplier_invoice_number)
  WHERE supplier_invoice_number IS NOT NULL;

COMMIT;
