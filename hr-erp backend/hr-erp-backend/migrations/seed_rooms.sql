-- Seed rooms for existing accommodations based on their capacity
-- Run: psql -U postgres -d hr_erp_db -f migrations/seed_rooms.sql

DO $$
DECLARE
  acc RECORD;
  room_count INTEGER;
  beds_per_room INTEGER;
  remaining_beds INTEGER;
  i INTEGER;
  new_room_id UUID;
  emp RECORD;
  room_idx INTEGER;
  room_ids UUID[];
BEGIN
  -- For each active accommodation, create rooms if none exist yet
  FOR acc IN
    SELECT id, name, COALESCE(capacity, 1) as capacity
    FROM accommodations
    WHERE is_active = true
  LOOP
    -- Skip if rooms already exist for this accommodation
    IF EXISTS (SELECT 1 FROM accommodation_rooms WHERE accommodation_id = acc.id) THEN
      CONTINUE;
    END IF;

    -- Calculate rooms: 2 beds per room by default
    beds_per_room := 2;
    room_count := GREATEST(1, CEIL(acc.capacity::numeric / beds_per_room));
    remaining_beds := acc.capacity;
    room_ids := ARRAY[]::UUID[];

    FOR i IN 1..room_count LOOP
      INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type)
      VALUES (
        acc.id,
        LPAD(i::text, 2, '0'),
        1,
        LEAST(beds_per_room, remaining_beds),
        'standard'
      )
      RETURNING id INTO new_room_id;

      room_ids := array_append(room_ids, new_room_id);
      remaining_beds := remaining_beds - beds_per_room;
    END LOOP;

    -- Assign existing employees to rooms (round-robin)
    room_idx := 1;
    FOR emp IN
      SELECT id FROM employees
      WHERE accommodation_id = acc.id
        AND end_date IS NULL
      ORDER BY arrival_date ASC NULLS LAST, created_at ASC
    LOOP
      UPDATE employees
      SET room_id = room_ids[room_idx]
      WHERE id = emp.id;

      room_idx := room_idx + 1;
      IF room_idx > array_length(room_ids, 1) THEN
        room_idx := 1;
      END IF;
    END LOOP;

  END LOOP;

  RAISE NOTICE 'Room seeding completed successfully';
END $$;
