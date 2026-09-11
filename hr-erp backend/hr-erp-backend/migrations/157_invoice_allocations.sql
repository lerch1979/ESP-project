-- 157: számla → hova könyveljük. Szálláshely, általános, vagy központi — és egy számla
--      több célpont között meg is osztható.
--
-- A PROBLÉMA
-- ----------
-- Az `invoices` táblán nem volt SEMMI, ami egy számlát konkrét szálláshoz kötött volna:
-- csak `cost_center_id` (milyen jellegű a költség) és `category_id`. A 16 darab
-- "X szálló" költséghelyet a mig 127 pont azért vonta ki, mert névegyezéssel működtek,
-- valódi FK nélkül — átnevezel egy szállót, és a költséghely csendben elavul.
--
-- Ezért NEM azokat élesztjük újra, hanem ugyanazt csináljuk, ami a költségeknél
-- (`accommodation_expenses.accommodation_id`) már bevált: valódi idegen kulcs.
--
-- MIÉRT KÜLÖN TÁBLA, ÉS NEM EGY OSZLOP
-- ------------------------------------
-- Egy számla ritkán, de megoszolhat több ház között (egy takarítási számla három
-- szállóra). Egy oszlop ezt nem tudja, a meglévő `line_items` jsonb mező pedig nem
-- alkalmas rá: nem lehet rendesen join-olni, indexelni és riportot húzni rá — márpedig a
-- kérés kifejezetten az volt, hogy a szűrések és a kimutatások is tudják. (A mező
-- egyébként mind a 13 számlánál üres, tehát nem is bontunk el vele semmit.)
--
-- HÁROM CÉLPONT, NEM CSAK SZÁLLÁS
-- -------------------------------
--   accommodation — konkrét szállás (ilyenkor az accommodation_id kötelező)
--   general       — a cég általános kiadásai, amik egyik házhoz sem rendelhetők
--   central       — saját részre történő kiadások
-- A típus és az FK együtt mozog: a CHECK nem enged "szállás típus szállás nélkül" vagy
-- "általános típus szállással" sort, mert az a fajta sor az, ami később a kimutatásban
-- hol eltűnik, hol duplán jelenik meg.
--
-- MEGLÉVŐ SZÁMLÁK: NEM TALÁLGATUNK
-- --------------------------------
-- A 13 meglévő számla allokáció NÉLKÜL marad. Egy vak backfill ('legyen mind általános')
-- olyan adatot írna a könyvelésbe, amit senki nem hagyott jóvá. Helyette a felületen
-- "nincs hozzárendelve" néven listázhatók és egyesével rendezhetők — ugyanaz a minta,
-- mint a Hiányzó adatok képernyőnél.

BEGIN;

CREATE TABLE IF NOT EXISTS invoice_allocations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  target_type      varchar(16) NOT NULL,
  accommodation_id uuid REFERENCES accommodations(id) ON DELETE RESTRICT,
  amount           numeric(15,2) NOT NULL,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,

  CONSTRAINT inv_alloc_type_chk
    CHECK (target_type IN ('accommodation','general','central')),
  -- A típus és a hivatkozás nem válhat szét.
  CONSTRAINT inv_alloc_shape_chk CHECK (
    (target_type = 'accommodation' AND accommodation_id IS NOT NULL)
    OR (target_type IN ('general','central') AND accommodation_id IS NULL)
  ),
  -- Nulla forintos felosztás nem felosztás; a negatív pedig jóváírás, ami nem ide való.
  CONSTRAINT inv_alloc_amount_chk CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_inv_alloc_invoice ON invoice_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_alloc_accommodation
  ON invoice_allocations (accommodation_id) WHERE accommodation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_alloc_target ON invoice_allocations (target_type);

-- Ugyanaz a ház kétszer ugyanazon a számlán = valaki kétszer vitte fel; összevonva kell.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_alloc_acc
  ON invoice_allocations (invoice_id, accommodation_id) WHERE accommodation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_alloc_nonacc
  ON invoice_allocations (invoice_id, target_type) WHERE accommodation_id IS NULL;

COMMENT ON TABLE invoice_allocations IS
  'Számla → hova könyveljük: konkrét szállás, általános (cég), vagy központi (saját rész). Egy számla több sorral megosztható; a részösszegeknek ki kell adniuk a számla végösszegét (a szolgáltatás ellenőrzi). A szállásonkénti kimutatás EZEN a táblán keresztül számol, nem a cost_centers taxonómián.';
COMMENT ON COLUMN invoice_allocations.target_type IS
  'accommodation = konkrét szálláshoz · general = a cég általános kiadása · central = saját részre történő kiadás';

COMMIT;
