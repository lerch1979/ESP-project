-- 111: Rename the two seeded sla_policies entries to Hungarian (live-test
-- cleanup). The B3 commit renamed every UI string from "SLA" to
-- "Megoldási határidő", but the value shown in the ticket sidebar comes
-- from sla_policies.name — and that's still the English seed name.
--
-- Safe to re-run: the WHERE clause matches the seed value verbatim, so
-- if someone already renamed a row by hand, it gets left alone.

BEGIN;

UPDATE sla_policies
SET    name = 'Standard megoldási határidő'
WHERE  name = 'Standard SLA';

UPDATE sla_policies
SET    name = 'Prémium megoldási határidő'
WHERE  name = 'Prémium SLA';

COMMIT;
