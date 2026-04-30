-- 110: Add 2 ticket statuses requested by operators (live-test feedback Bug 1).
--
-- Why:
--   The existing 10 statuses conflate two distinct operator concepts:
--     * "Megoldott" (resolved)   = the work has been done but the ticket
--                                  is not yet officially closed (e.g. waiting
--                                  on resident confirmation).
--     * "Lezárt - Sikertelen"    = officially closed, but the resolution
--                                  failed (different from `rejected`, which
--                                  means we declined the request upfront).
--
-- Order of finals after this migration:
--    8  resolved             (NEW)
--    9  completed            (was 8)  — "Sikeresen lezárva"
--   10  closed_unsuccessful  (NEW)
--   11  rejected             (was 9)
--   12  not_feasible         (was 10)

BEGIN;

-- Make room in the sequence for the two new finals.
-- order_index has no unique constraint, but doing UPDATEs first
-- keeps the table tidy in case anyone reads it mid-migration.
UPDATE ticket_statuses SET order_index = 9  WHERE slug = 'completed';
UPDATE ticket_statuses SET order_index = 11 WHERE slug = 'rejected';
UPDATE ticket_statuses SET order_index = 12 WHERE slug = 'not_feasible';

INSERT INTO ticket_statuses (slug, name, description, color, order_index, is_final)
VALUES
  ('resolved',
   'Megoldott',
   'A munka elvégezve, lezárásra vár',
   '#22c55e',
   8,
   true),
  ('closed_unsuccessful',
   'Lezárt (Sikertelen)',
   'Lezárva, nem sikerült megoldani',
   '#991b1b',
   10,
   true)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
