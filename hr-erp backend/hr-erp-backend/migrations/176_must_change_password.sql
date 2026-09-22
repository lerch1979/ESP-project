-- 176 — kötelező jelszócsere az első belépéskor
--
-- MIÉRT: az adminisztrátor által létrehozott vagy visszaállított fiók IDEIGLENES
-- jelszóval indul, és ezt a jelszót a lakók PAPÍRON kapják meg. Egy papírra írt jelszó
-- annyi ember kezén megy át, ahányan hozzáférnek a papírhoz — a szállásfelelőstől a
-- szobatársig. Amíg a lakó nem cseréli le, a fiókja gyakorlatilag közös tulajdon.
--
-- Ezért a jelzőt a rendszer maga állítja be (admin-létrehozás és admin-visszaállítás),
-- és a felhasználó CSAK a saját jelszóváltásával tudja levenni. Amíg fent van, a
-- kötelező-csere kapu mindent elzár a jelszóváltáson kívül.
--
-- ALAPÉRTELMEZÉS false, és a MEGLÉVŐ fiókokat nem érinti: aki ma bent van, azt nem
-- akarjuk holnap reggel egy váratlan jelszócsere-képernyővel fogadni. A jelző innentől
-- csak az újonnan létrehozott és a visszaállított fiókokra kerül fel.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.must_change_password IS
  'Ideiglenes jelszóval jött létre vagy admin állította vissza — az első belépéskor '
  'kötelező cserélni. Csak a saját jelszóváltás veszi le.';

-- Részleges index: a lekérdezés mindig csak a fennálló eseteket keresi, és azokból
-- kevés van. Teljes index a ritkán igaz oszlopon fölösleges helyfoglalás lenne.
CREATE INDEX IF NOT EXISTS idx_users_must_change_password
  ON users (id) WHERE must_change_password;
