-- 171: a lakói szerepkör `tickets.create` joga — ÉLESBEN MEGVOLT, MIGRÁCIÓBAN NEM.
--
-- HOGYAN DERÜLT KI
-- ----------------
-- A 2026-09-22-i fordítási hiba vizsgálatakor írtam egy functestet, ami LAKÓI fiókkal
-- nyit hibajegyet — pontosan azt az utat járva, ami élesben elromlott. A teszt 500-zal
-- elszállt, mert a sandboxban a lakó nem hozhat létre jegyet. Élesben viszont igen:
--
--   éles    accommodated_employee → tickets.create  ✔
--   sandbox accommodated_employee → (semmi)         �’
--
-- A jogot valaki kézzel adta meg az éles adatbázisban, migráció nélkül. Ennek két
-- következménye volt, és a második a súlyosabb:
--   1. egy friss környezet (CI, dev, sandbox) NEM ugyanazt a rendszert építi fel, mint
--      ami élesben fut,
--   2. a functest SOHA nem tudta járni a lakói jegynyitás útját — tehát pont az a
--      folyamat volt lefedetlen, amiből a lakói mobilapp él.
--
-- Ez a migráció a MEGLÉVŐ éles állapotot teszi reprodukálhatóvá. Élesben nem változtat
-- semmit (a jog már ott van), a többi környezetben pótolja.
--
-- A jog szűk: `tickets.create`. A lakó a SAJÁT jegyeit a `/tickets/my` önhatáskörű
-- végpontokon látja (Path B, 2026-06-09-i döntés) — `tickets.view`-t továbbra sem kap,
-- mert az minden jegyet megnyitna neki.

BEGIN;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.slug = 'accommodated_employee'
   AND p.slug = 'tickets.create'
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
   );

COMMIT;
