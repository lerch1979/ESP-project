-- 169: BÉRBEADÓI REZSI-JELZÉS — költség szállítói számla nélkül.
--
-- AZ ÜZLETI ESET
-- --------------
-- A magánszemélytől bérelt lakásoknál (Győr, Budapest Ungvár u., Szigetszentmiklós) a
-- közüzemi szerződés a BÉRBEADÓ nevén van. Ő kifizeti a szolgáltatót, majd JELZI nekünk
-- az összeget — esetleg a számla fotójával —, és mi átutaljuk neki. Számla a mi nevünkre
-- SOHA nem keletkezik.
--
-- MIÉRT NEM ELÉG A 'manual' FORRÁS
-- --------------------------------
-- Számla nélküli költséget eddig is lehetett rögzíteni `source='manual'`-ként, de az
-- nem mondja meg, MIÉRT nincs számla: ugyanaz az érték takarja a "kézzel gépeltem be egy
-- számláról" és a "a bérbeadó szólt, hogy ennyi" esetet. A könyvelő szempontjából viszont
-- ez a kettő nem ugyanaz, és a különbség csak akkor kérdezhető le, ha külön érték.
--
-- ⚠️ ADÓÜGYI KÖVETKEZMÉNY: NINCS LEVONHATÓ ÁFA
-- Nevünkre szóló számla híján a 27% nem igényelhető vissza, tehát a jelzett összeg a
-- TELJES költség, áfabontás nélkül. Ez nem blokkol semmit — tulajdonosi döntés, hogy a
-- rendszer jelezze, ne akadályozza —, de a tételek egy lekérdezéssel átadhatók a
-- könyvelőnek (`GET /expenses/no-document`).
--
-- MIÉRT KELL A payable_to_contractor_id
-- -------------------------------------
-- A `recoverable_from_contractor_id` azt mondja meg, KI TARTOZIK NEKÜNK. Nem volt párja
-- arra, hogy KINEK TARTOZUNK MI — pedig a rezsit nem a szolgáltatónak utaljuk, hanem a
-- bérbeadónak. A kettő együtt fedi le mindkét irányt ugyanazon a soron, és ettől jön ki
-- magától a szállásadói lap egyenlege (Gede: 16 877 fizetendő − 23 000 követelés = −6 123).

BEGIN;

-- ── 1. Az új forrás-típus ────────────────────────────────────────────────
-- A `source` varchar(20) volt, a 'landlord_utility_notice' pedig 23 karakter. A mező
-- szélesítése előbb kell, mint a CHECK: enélkül a beszúrás nem a megszorításon bukna el,
-- hanem egy "value too long" hibán, amiből nem derül ki, hogy a névvel van a baj.
ALTER TABLE accommodation_expenses ALTER COLUMN source TYPE varchar(32);

ALTER TABLE accommodation_expenses DROP CONSTRAINT IF EXISTS acc_exp_source_check;
ALTER TABLE accommodation_expenses
  ADD CONSTRAINT acc_exp_source_check CHECK (
    source IN ('manual','ai','email_ocr','import','invoice','landlord_utility_notice')
  );

-- ── 2. Kinek fizetjük ────────────────────────────────────────────────────
ALTER TABLE accommodation_expenses
  ADD COLUMN IF NOT EXISTS payable_to_contractor_id uuid REFERENCES contractors(id);

COMMENT ON COLUMN accommodation_expenses.payable_to_contractor_id IS
  'Kinek utaljuk az összeget, ha nem a számlát kiállító szállítónak — jellemzően a bérbeadónak, aki a közüzemi számlát a saját nevén fizette ki. A recoverable_from_contractor_id párja: az "ő tartozik nekünk", ez a "mi tartozunk neki".';

-- A bérbeadói jelzésnél KÖTELEZŐ, hogy tudjuk, kinek utalunk: enélkül a tétel nem kerül
-- rá egyetlen elszámoló lapra sem, és némán eltűnne a szállásadó felé menő egyenlegből.
ALTER TABLE accommodation_expenses DROP CONSTRAINT IF EXISTS acc_exp_notice_payable_chk;
ALTER TABLE accommodation_expenses
  ADD CONSTRAINT acc_exp_notice_payable_chk CHECK (
    source <> 'landlord_utility_notice' OR payable_to_contractor_id IS NOT NULL
  );

-- Bérbeadói jelzésnél nincs szállítói számla — az invoice_id üresen kell maradjon,
-- különben a költség két úton is bekerülne (a jelzésből és a számlából).
ALTER TABLE accommodation_expenses DROP CONSTRAINT IF EXISTS acc_exp_notice_noinvoice_chk;
ALTER TABLE accommodation_expenses
  ADD CONSTRAINT acc_exp_notice_noinvoice_chk CHECK (
    source <> 'landlord_utility_notice' OR invoice_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_acc_exp_payable_to
  ON accommodation_expenses (payable_to_contractor_id, billing_month)
  WHERE payable_to_contractor_id IS NOT NULL AND deleted_at IS NULL;

-- ── 3. A rezsi-mátrix jelölése ───────────────────────────────────────────
-- ÚJ MEZŐ NEM KELL: a mátrixban már ott a `who_pays` (ki viseli) ÉS a `contract_holder`
-- (kinek a nevén van a közüzemi szerződés). A "mi fizetjük, bérbeadói jelzés alapján"
-- pontosan a who_pays='mi' + contract_holder='szallasado' pár — eddig csak nem töltötte
-- ki senki. A felület ezt a kombinációt nevezi meg egy szóval.
COMMENT ON COLUMN accommodation_utility_lines.contract_holder IS
  'Kinek a nevén van a közüzemi szerződés. who_pays=mi + contract_holder=szallasado = a bérbeadó fizeti a szolgáltatót, jelzi nekünk az összeget, és mi neki utaljuk — szállítói számla a mi nevünkre nem keletkezik.';

COMMIT;
