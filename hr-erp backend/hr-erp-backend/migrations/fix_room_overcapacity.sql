-- Fix room assignments to respect bed capacity
-- Clears all room_id, then re-assigns employees up to each room's bed limit
-- Run: psql -U postgres -d hr_erp_db -f migrations/fix_room_overcapacity.sql

DO $$
DECLARE
  acc RECORD;
  room RECORD;
  emp RECORD;
  filled INTEGER;
BEGIN
  -- Clear all room assignments
  UPDATE employees SET room_id = NULL WHERE room_id IS NOT NULL;

  -- For each accommodation, assign employees to rooms respecting bed limits
  FOR acc IN
    SELECT id FROM accommodations WHERE is_active = true
  LOOP
    FOR room IN
      SELECT id, beds
      FROM accommodation_rooms
      WHERE accommodation_id = acc.id AND is_active = true
      ORDER BY room_number
    LOOP
      filled := 0;

      FOR emp IN
        SELECT e.id FROM employees e
        WHERE e.accommodation_id = acc.id
          AND e.end_date IS NULL
          AND e.room_id IS NULL
        ORDER BY e.arrival_date ASC NULLS LAST, e.created_at ASC
      LOOP
        EXIT WHEN filled >= room.beds;

        UPDATE employees SET room_id = room.id WHERE id = emp.id;
        filled := filled + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Room overcapacity fix completed';
END $$;
