-- 163: MEGELŐLEGEZETT TÉTELEK — kifizettük a szállásadó helyett, visszajár tőle.
--
-- A VALÓS ESET
-- ------------
-- A győri ingatlanban kicseréltük a vízórát (23 000 Ft). A számla a miénk, a pénz tőlünk
-- ment ki, szerződés szerint viszont a bérbeadó terhe. A következő havi elszámolásban
-- levonjuk a neki fizetendőből.
--
-- MIÉRT NEM KÖLTSÉG
-- -----------------
-- Ha költségként könyvelnénk ÉS levonnánk a bérleti díjból, a ház 23 000 Ft-tal többet
-- mutatna, mint amennyibe valóban került:
--
--   pénzmozgás:     −23 000 (szerelőnek)  −277 000 (bérbeadónak)  =  −300 000
--   valós költség:                         300 000 (bérleti díj)
--
-- A megelőlegezett tétel tehát KÖVETELÉS, nem ráfordítás. A szállás eredményét nem
-- terheli; a kimutatások kihagyják, a követelés-nézet és a szállásadói elszámoló lap
-- viszont mutatja. Így nem kell sehol negatív összeg — a rossz modellezés szülte volna,
-- nem az üzleti eset.
--
-- A KATEGÓRIA MEGMARAD
-- --------------------
-- A tétel kap kategóriát (karbantartás, rezsi…), mert a nyilvántartáshoz és a
-- visszakereséshez kell. A kategória-összesítőkbe viszont nem számít bele.

BEGIN;

ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS cost_bearer                    varchar(20) NOT NULL DEFAULT 'sajat',
  ADD COLUMN IF NOT EXISTS recoverable_from_contractor_id uuid REFERENCES contractors(id),
  ADD COLUMN IF NOT EXISTS recovered_amount               numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_status                varchar(20),
  ADD COLUMN IF NOT EXISTS recovery_note                  text;

DO $$ BEGIN
  ALTER TABLE accommodation_expenses ADD CONSTRAINT acc_exp_cost_bearer_chk
    CHECK (cost_bearer IN ('sajat','megelolegezett'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE accommodation_expenses ADD CONSTRAINT acc_exp_recovery_status_chk
    CHECK (recovery_status IS NULL OR recovery_status IN ('nyitott','levonva','megterult','elengedve'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A megelőlegezett tételnek KELL tudnia, kitől jár vissza, és nyitott állapotban indul.
-- Enélkül egy követelés láthatatlanul elveszne a költségek közt.
DO $$ BEGIN
  ALTER TABLE accommodation_expenses ADD CONSTRAINT acc_exp_recoverable_shape_chk
    CHECK (
      (cost_bearer = 'sajat' AND recoverable_from_contractor_id IS NULL AND recovery_status IS NULL)
      OR
      (cost_bearer = 'megelolegezett' AND recoverable_from_contractor_id IS NOT NULL AND recovery_status IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A levont összeg nem haladhatja meg a tételt.
DO $$ BEGIN
  ALTER TABLE accommodation_expenses ADD CONSTRAINT acc_exp_recovered_amount_chk
    CHECK (recovered_amount >= 0 AND recovered_amount <= amount);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_acc_exp_recoverable
  ON accommodation_expenses(recoverable_from_contractor_id, recovery_status)
  WHERE cost_bearer = 'megelolegezett' AND deleted_at IS NULL;

COMMENT ON COLUMN accommodation_expenses.cost_bearer IS
  'sajat = a mi költségünk | megelolegezett = a szállásadó helyett fizettük ki, visszajár tőle (követelés, nem ráfordítás — a kimutatások kihagyják)';
COMMENT ON COLUMN accommodation_expenses.recovered_amount IS
  'Eddig levont összeg. Ha kevesebb az amount-nál, a maradék nyitott marad és a következő havi elszámolásra átfordul.';

-- ── a levonás eseményei ────────────────────────────────────────────────────
-- Külön tábla, mert egy követelés több hónapban is apadhat (ha a havi fizetendő kevesebb,
-- mint a levonandó), és mert utólag meg kell tudni mondani, MELYIK elszámolásban tűnt el
-- egy tétel. Egy összesített "levonva" jelölő ezt a kérdést nem tudná megválaszolni.
CREATE TABLE IF NOT EXISTS expense_recoveries (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id     uuid NOT NULL REFERENCES accommodation_expenses(id) ON DELETE CASCADE,
  contractor_id  uuid NOT NULL REFERENCES contractors(id),
  billing_month  varchar(7) NOT NULL,
  amount         numeric(14,2) NOT NULL CHECK (amount > 0),
  note           text,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT exp_rec_month_chk CHECK (billing_month ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_exp_recoveries_month
  ON expense_recoveries(contractor_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_exp_recoveries_expense
  ON expense_recoveries(expense_id);

COMMENT ON TABLE expense_recoveries IS
  'Egy megelőlegezett tétel levonása egy adott havi szállásadói elszámolásban. Több sor tartozhat egy tételhez, ha a levonás több hónapra oszlik.';

COMMIT;
