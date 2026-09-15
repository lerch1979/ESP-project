-- 160: a számla besorolása KÉPEZI a szállásköltség-sort. Egy bemenet, egy igazság.
--
-- A PROBLÉMA
-- ----------
-- Két számla-tábla él egymás mellett, 23 közös oszloppal:
--
--   invoices                (ide ír a Számlák képernyő)          2026-09: 16 db, 10,9 M Ft
--   accommodation_expenses  (ezt olvassa a profit/költségriport)  utolsó sor: 2026-06
--
-- Július óta a szállásonkénti költségkimutatás NULLÁT mutat, miközben a számlák
-- folyamatosan érkeznek — a másik táblába. A 2026-06-21-i döntés szerint az
-- `accommodation_expenses` az egyetlen igazság a szállásköltségre; ez a migráció nem
-- felülírja ezt a döntést, hanem végre teljesíti: a bizonylat marad az `invoices`-ban, a
-- költségsor pedig a besorolásból KÉPZŐDIK, nem kézzel íródik újra.
--
-- A mig 157 `invoice_allocations` táblája ugyanarra a kérdésre válaszol, mint az
-- `accommodation_expenses.accommodation_id` — "melyik házhoz tartozik" —, csak egy
-- táblával arrébb. Ez a híd köti össze a kettőt, ahelyett hogy egy harmadikat nyitna.
--
-- AMI NEM KÉPEZ KÖLTSÉGSORT
-- -------------------------
--   • általános / központi célpont — nincs szálláshely, cégszintű kiadás;
--   • BÉRLETI DÍJ — a számlázó motor a `accommodations.rent_amount`/`rent_basis`
--     mezőkből MÁR kiszámolja és beleteszi a `cost_amount`-ba. Ha a bérbeadó számláját
--     is átvezetnénk, a bérleti díj kétszer szerepelne minden kimutatásban.

BEGIN;

-- ── a képzett sor visszavezethető a bizonylatra ──────────────────────────
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS invoice_id            uuid REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS invoice_allocation_id uuid REFERENCES invoice_allocations(id) ON DELETE CASCADE;

COMMENT ON COLUMN accommodation_expenses.invoice_id IS
  'A bizonylat, amiből ez a költségsor képződött. NULL = kézzel rögzített vagy OCR-ből konvertált sor.';
COMMENT ON COLUMN accommodation_expenses.invoice_allocation_id IS
  'A besorolás sora, amiből képződött. A besorolás törlésekor a költségsor is megszűnik (CASCADE), így nem marad árva költség egy már át nem sorolt számla után.';

-- Egy besorolás-sor legfeljebb EGY költségsort képezhet. Enélkül egy ismételt mentés
-- csendben megduplázná a költséget — pontosan az a hiba, ami ellen ez az egész épül.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_acc_exp_per_allocation
  ON accommodation_expenses(invoice_allocation_id)
  WHERE invoice_allocation_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_acc_exp_invoice ON accommodation_expenses(invoice_id)
  WHERE invoice_id IS NOT NULL AND deleted_at IS NULL;

-- ── a besoroláson dől el, MILYEN költség ────────────────────────────────
-- A számla kategóriája (invoice_categories, 11 szabad szöveges sor) nem feleltethető meg
-- egy az egyben a költségtábla négy vödrének — takarítás-kategóriájú számla például
-- nincs is. Ezért a besorolás sora hordozza, és csak ha üresen hagyják, akkor képezzük a
-- számla kategóriájából.
ALTER TABLE invoice_allocations
  ADD COLUMN IF NOT EXISTS expense_category varchar(32),
  ADD COLUMN IF NOT EXISTS utility_line     varchar(32);

DO $$ BEGIN
  ALTER TABLE invoice_allocations ADD CONSTRAINT inv_alloc_expense_category_chk
    CHECK (expense_category IS NULL OR expense_category IN ('rezsi','karbantartas','takaritas','egyeb'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE invoice_allocations ADD CONSTRAINT inv_alloc_utility_line_chk
    CHECK (utility_line IS NULL OR utility_line IN
      ('viz_csatorna','internet','aram','gaz','kozos_koltseg','hulladekszallitas'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── a képzett sor forrása megkülönböztethető ────────────────────────────
DO $$ BEGIN
  ALTER TABLE accommodation_expenses DROP CONSTRAINT IF EXISTS acc_exp_source_check;
  ALTER TABLE accommodation_expenses ADD CONSTRAINT acc_exp_source_check
    CHECK (source IN ('manual','ai','email_ocr','import','invoice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
