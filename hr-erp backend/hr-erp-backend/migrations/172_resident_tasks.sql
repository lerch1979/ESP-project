-- 172: LAKÓNAK SZÓLÓ FELADAT — a "róla" és a "neki" szétválasztása.
--
-- AZ ESET (2026-09-22)
-- -------------------
-- A tulajdonos szuperadminként feladatot hozott létre Eszti tesztfiókjának, és nem kapott
-- értesítést. A vizsgálat kimutatta, hogy ez a viselkedés HELYES volt: a feladat
-- `assigned_to` mezője az IRODÁRA mutatott, a `related_employee_id` pedig Esztire —
-- vagyis a feladat RÓLA szólt, nem NEKI. A rendszerben nem is létezett "lakónak szóló
-- feladat" fogalom: mind a 13 feladat irodai felelősre volt szignálva, nulla lakóira.
--
-- A KÉT FOGALOM, AMIT SZÉT KELL TARTANI
-- -------------------------------------
--   related_employee_id      → "a lakóról szól"  — BELSŐ. A lakó SOHA nem látja.
--                              (pl. "beszélni kell vele a rendetlenség miatt")
--   assigned_to_employee_id  → "a lakónak szól"  — a lakó látja, push-t kap, kész-re állíthatja
--                              (pl. "hozd le a szerződésedet aláírásra")
--
-- MIÉRT ÚJ MEZŐ, ÉS MIÉRT NEM AZ assigned_to
-- ------------------------------------------
-- Az `assigned_to` a `users` táblára mutat, és MINDEN belső nézet arra épül (Teendők
-- lista, GTD, "elvégzendő feladataim" widget, terhelés-elosztás). Ha lakói user-fiókokat
-- kezdenénk oda írni, a belső teendő-lista megtelne lakói sorokkal, és az iroda
-- munkaterhelés-számítása is elcsúszna. Egy külön mező kimondja a szándékot, és a belső
-- nézetek érintetlenek maradnak.
--
-- ⚠️ A BIZTONSÁGI FELTÉTEL, AMI MIATT EZ NEM CSAK KÉNYELMI KÉRDÉS
-- A lakói végpont KIZÁRÓLAG az `assigned_to_employee_id`-ra szűrhet, SOHA nem a
-- `related_employee_id`-ra. Egy belső feljegyzés a lakó telefonján bizalmi kérdés, nem
-- szépséghiba. A FUNCTEST RESTASK-05 pont ezt méri, és a mező kommentje is kimondja.

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assigned_to_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  -- A lakó visszajelzése. Külön a `status`-tól: az az IRODA munkafolyamata (todo /
  -- review / done), ez pedig azt mondja, mit üzent vissza a lakó. A kettő elcsúszhat —
  -- a lakó jelezheti, hogy kész, az iroda meg még ellenőrizni akarja —, és ez így helyes.
  ADD COLUMN IF NOT EXISTS resident_status varchar(16),
  ADD COLUMN IF NOT EXISTS resident_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS resident_note text;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_resident_status_chk;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_resident_status_chk CHECK (
    resident_status IS NULL OR resident_status IN ('lattam','folyamatban','kesz')
  );

-- A lakói visszajelzés csak olyan feladaton értelmes, ami NEKI szól. Enélkül egy belső
-- feladatra is kerülhetne lakói állapot, ami azt sugallná, hogy a lakó látta — pedig nem.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_resident_status_needs_assignee_chk;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_resident_status_needs_assignee_chk CHECK (
    resident_status IS NULL OR assigned_to_employee_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_tasks_resident_assignee
  ON tasks (assigned_to_employee_id)
  WHERE assigned_to_employee_id IS NOT NULL;

COMMENT ON COLUMN tasks.assigned_to_employee_id IS
  'A LAKÓNAK szóló feladat címzettje. A lakó ezt látja az appban, push-t kap róla, és visszajelezhet. NEM keverendő a related_employee_id-val, ami a lakóRÓL szóló BELSŐ feladatot jelöli — azt a lakó soha nem láthatja.';

COMMENT ON COLUMN tasks.related_employee_id IS
  'A feladat erről a munkavállalóról SZÓL (belső). A lakó SOHA nem látja. A lakói végpont kizárólag az assigned_to_employee_id-ra szűrhet.';

COMMIT;
