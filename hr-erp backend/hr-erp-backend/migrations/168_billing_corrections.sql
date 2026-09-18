-- 168: SZÁMLAKORREKCIÓ — előre kiszámlázott ágyszám visszavezetése a tényleges foglaltságra.
--
-- AZ ÜZLETI ESET
-- --------------
-- A havi számla ELŐRE megy ki, a lekötött ágyszámra, mert a hónap elején még nem tudni,
-- ki mikor költözik ki. Amikor a megbízó elviszi az embereket, a különbözet — amit olyanok
-- után számláztunk, akik már nincsenek ott — a KÖVETKEZŐ számlából kerül levonásra.
-- Augusztusra ez 3 583 100 Ft volt, kézzel számolva, házanként.
--
-- MIÉRT NEM ELÉG EGY MÍNUSZ SOR
-- -----------------------------
-- Aki fél év múlva ránéz egy 7 milliós levonásra, nem fogja tudni, miből jött. Ezért a
-- korrekció NEM egy szám: a rekord viszi magával a levezetést (hónap, ház, munkahely,
-- ágy-éjszaka, díj), a kiszámlázott és a tényleges összeget is, és azt, hogy ki és mikor
-- hagyta jóvá.
--
-- A JÓVÁHAGYÁS KÖTELEZŐ LÉPÉS
-- ---------------------------
-- A rendszer JAVASLATOT készít, nem kész tényt. Egy automatikusan a számlára kerülő
-- levonás akkor is elmenne, ha a foglaltsági adat épp hiányos — márpedig a foglaltság a
-- kiléptetések átvezetésén múlik, ami emberi munka. Ezért a 'javaslat' → 'jovahagyva' →
-- 'beszamitva' lánc, és a beszámítás csak jóváhagyott korrekcióból indulhat.
--
-- ⚠️ AMI NEM ESIK A KORREKCIÓ HATÁLYA ALÁ: A PROFIT
-- -------------------------------------------------
-- A profit-kimutatás a TÉNYLEGES foglaltságból számol, nem a kiszámlázott ágyszámból —
-- vagyis a szeptemberi eredmény MÁR a valós bevételt mutatja. Ha a korrekció is
-- csökkentené, ugyanaz a különbözet kétszer jelenne meg: egyszer az érintett hónapban,
-- egyszer a beszámítás hónapjában. A korrekció ezért PÉNZÜGYI tétel (mit számlázunk),
-- nem eredmény-tétel (mennyi a nyereség). A profit kód szándékosan nem olvassa ezt a
-- táblát.

BEGIN;

CREATE TABLE IF NOT EXISTS billing_corrections (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contractor_id     uuid NOT NULL REFERENCES contractors(id),

  -- MELYIK hónapra vonatkozik (ahol a túlszámlázás keletkezett)
  affected_month    varchar(7) NOT NULL,
  -- MELYIK számlán vezetjük vissza (a beszámítás hónapja) — a kettő szándékosan külön
  settled_in_month  varchar(7),

  invoiced_amount   numeric(14,2) NOT NULL,   -- amit előre kiszámláztunk (nettó)
  actual_amount     numeric(14,2) NOT NULL,   -- amit a tényleges foglaltság indokol
  amount            numeric(14,2) NOT NULL,   -- a különbözet, ennyi jár vissza
  settled_amount    numeric(14,2) NOT NULL DEFAULT 0,

  -- A levezetés: házanként/munkahelyenként ágy-éjszaka és díj. Enélkül a szám
  -- ellenőrizhetetlen, és egy vitában nem lehet mögé nézni.
  breakdown         jsonb NOT NULL DEFAULT '[]'::jsonb,

  status            varchar(16) NOT NULL DEFAULT 'javaslat',
  note              text,

  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  approved_by       uuid REFERENCES users(id),
  approved_at       timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT bc_month_chk    CHECK (affected_month ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT bc_settled_chk  CHECK (settled_in_month IS NULL OR settled_in_month ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT bc_status_chk   CHECK (status IN ('javaslat','jovahagyva','beszamitva','elvetve')),
  CONSTRAINT bc_amount_chk   CHECK (amount >= 0 AND settled_amount >= 0 AND settled_amount <= amount),
  -- Jóváhagyás nélkül nem kerülhet számlára: a státusz és a jóváhagyó együtt mozog.
  CONSTRAINT bc_approval_chk CHECK (
    (status IN ('javaslat','elvetve') AND approved_at IS NULL)
    OR (status IN ('jovahagyva','beszamitva') AND approved_at IS NOT NULL)
  )
);

-- Egy megbízóra egy hónapra egy ÉLŐ korrekció; elvetettből lehet több (újraszámolás).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_billing_correction_live
  ON billing_corrections (contractor_id, affected_month)
  WHERE status <> 'elvetve';

CREATE INDEX IF NOT EXISTS idx_billing_corrections_open
  ON billing_corrections (contractor_id, status)
  WHERE status IN ('javaslat','jovahagyva');

COMMENT ON TABLE billing_corrections IS
  'Előre kiszámlázott ágyszám és a tényleges foglaltság különbözete, a következő számlán levonásként. PÉNZÜGYI tétel: a profit-kimutatás NEM olvassa, mert az már a tényleges foglaltságból számol.';

-- ── az augusztusi korrekció, ami már megtörtént ──────────────────────────
-- A tulajdonos kézzel számolta és le is vonta az augusztusi számlából. Azért kerül be,
-- hogy a nyitott állomány és az előzmény egy helyen legyen — 'beszamitva' állapotban,
-- hiszen már érvényesült.
INSERT INTO billing_corrections
  (contractor_id, affected_month, settled_in_month, invoiced_amount, actual_amount,
   amount, settled_amount, status, approved_at, note, breakdown)
SELECT c.id, '2026-08', '2026-08', 0, 0, 3583100, 3583100, 'beszamitva', NOW(),
       'Visszamenőleg rögzítve: a tulajdonos kézzel számolta és az augusztusi számlából '
       || 'már levonta, házanként részletezve. A kiszámlázott/tényleges bontás nem került '
       || 'át — a levezetés a papíron van.',
       '[]'::jsonb
  FROM contractors c
 WHERE c.name = 'Man At Work'
   AND NOT EXISTS (SELECT 1 FROM billing_corrections b
                    WHERE b.contractor_id = c.id AND b.affected_month = '2026-08'
                      AND b.status <> 'elvetve');

COMMIT;
