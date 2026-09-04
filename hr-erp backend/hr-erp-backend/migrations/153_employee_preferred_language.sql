-- 153: a resident's own language, on the employee record.
--
-- WHY IT CANNOT STAY ON `users`
-- -----------------------------
-- `users.preferred_language` exists and defaults to 'hu'. But a resident only gets a
-- users row when someone provisions a login, and on production that is 0 of 279 people.
-- So today there is nowhere to record that an arrival speaks Ukrainian or Tagalog, and
-- every translation and language-targeting feature resolves to Hungarian by default —
-- the features are not misconfigured, they are unreachable.
--
-- The language belongs to the PERSON, not to their login: we know it at intake, months
-- before anyone issues credentials, and it must survive an account being disabled. The
-- users column stays as the UI preference for staff; this is the resident's own language.
--
-- Deliberately NULL by default rather than 'hu'. A default of 'hu' is indistinguishable
-- from "we asked and they said Hungarian", which is exactly the confusion that makes the
-- current data useless — NULL means "not yet asked" and shows up in Hiányzó adatok.

BEGIN;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS preferred_language varchar(5);

-- The five locales the resident app ships (scripts/check-i18n-coverage.js enforces the
-- same set); NULL stays allowed and means "not recorded".
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_preferred_language_chk;
ALTER TABLE employees ADD CONSTRAINT employees_preferred_language_chk
  CHECK (preferred_language IS NULL OR preferred_language IN ('hu','en','uk','tl','de'));

CREATE INDEX IF NOT EXISTS idx_employees_preferred_language
  ON employees(preferred_language) WHERE preferred_language IS NOT NULL;

COMMENT ON COLUMN employees.preferred_language IS
  'A lakó saját nyelve (hu/en/uk/tl/de). NULL = még nem rögzítettük. NEM azonos a users.preferred_language-dzsel, ami a belépő felhasználó felületi nyelve — a lakóknak jellemzően nincs is felhasználójuk.';

COMMIT;
