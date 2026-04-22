-- Migration 092: Backfill residents_snapshot with email + language
--
-- Before this migration the snapshot stored `employees.id AS user_id` and
-- missed email + language entirely. Email notification delivery silently
-- dropped every legacy resident because the notifier couldn't look up
-- email/preferred_language from a field it wasn't given.
--
-- Strategy:
--   For each resident object in residents_snapshot, look up the
--   corresponding employees row (by treating the stored user_id as an
--   employee PK — which is what the old code wrote) and splice in:
--     - employee_id  (the employee PK, same value as legacy user_id)
--     - user_id      (re-resolved to employees.user_id if that user exists)
--     - email        (personal_email, falling back to users.email)
--     - language     (users.preferred_language, defaults to 'hu')
--
-- Rows where the enrichment fails (e.g. employee was deleted) keep their
-- original shape so the email notifier's runtime fallback can still try
-- to do something useful at send-time.

BEGIN;

WITH expanded AS (
  SELECT ri.id AS room_inspection_id,
         elem.ordinality AS idx,
         elem.value AS original,
         e.id       AS employee_id,
         e.user_id  AS real_user_id,
         e.first_name || ' ' || e.last_name AS name,
         COALESCE(NULLIF(e.personal_email, ''), u.email) AS email,
         COALESCE(u.preferred_language, 'hu') AS language
  FROM room_inspections ri
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ri.residents_snapshot, '[]'::jsonb)) WITH ORDINALITY AS elem(value, ordinality)
  LEFT JOIN employees e ON e.id = (elem.value->>'user_id')::uuid
  LEFT JOIN users     u ON u.id = e.user_id
  WHERE ri.residents_snapshot IS NOT NULL
    AND jsonb_array_length(ri.residents_snapshot) > 0
    AND e.id IS NOT NULL
    AND (
      NOT (elem.value ? 'email')
      OR (elem.value->>'email') IS NULL
      OR (elem.value->>'email') = ''
    )
),
rebuilt AS (
  SELECT room_inspection_id,
         jsonb_agg(
           jsonb_build_object(
             'employee_id', employee_id,
             'user_id',     real_user_id,
             'name',        name,
             'email',       email,
             'language',    language,
             'move_in_date', original->>'move_in_date'
           )
           ORDER BY idx
         ) AS new_snapshot
  FROM expanded
  GROUP BY room_inspection_id
)
UPDATE room_inspections ri
SET residents_snapshot = rebuilt.new_snapshot
FROM rebuilt
WHERE ri.id = rebuilt.room_inspection_id;

COMMIT;
