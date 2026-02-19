const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Szobák listázása egy szálláshelyhez (lakókkal)
 */
const getRoomsByAccommodation = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify accommodation exists
    const accCheck = await query('SELECT id FROM accommodations WHERE id = $1', [id]);
    if (accCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szálláshely nem található'
      });
    }

    const roomsResult = await query(`
      SELECT
        ar.id,
        ar.accommodation_id,
        ar.room_number,
        ar.floor,
        ar.beds,
        ar.room_type,
        ar.notes,
        ar.is_active,
        ar.created_at,
        ar.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.id,
              'name', CONCAT(e.last_name, ' ', e.first_name),
              'employee_number', e.employee_number
            )
          ) FILTER (WHERE e.id IS NOT NULL AND e.end_date IS NULL),
          '[]'::json
        ) as occupants
      FROM accommodation_rooms ar
      LEFT JOIN employees e ON e.room_id = ar.id AND e.end_date IS NULL
      WHERE ar.accommodation_id = $1 AND ar.is_active = true
      GROUP BY ar.id, ar.accommodation_id, ar.room_number, ar.floor,
               ar.beds, ar.room_type, ar.notes, ar.is_active,
               ar.created_at, ar.updated_at
      ORDER BY ar.room_number
    `, [id]);

    const rooms = roomsResult.rows.map(r => ({
      ...r,
      occupied_beds: r.occupants.length,
      free_beds: r.beds - r.occupants.length,
    }));

    res.json({
      success: true,
      data: { rooms }
    });
  } catch (error) {
    logger.error('Szobák lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szobák lekérési hiba'
    });
  }
};

/**
 * Új szoba létrehozása
 */
const createRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { room_number, floor, beds, room_type, notes } = req.body;

    if (!room_number || !room_number.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Szobaszám megadása kötelező'
      });
    }

    // Verify accommodation exists
    const accCheck = await query('SELECT id FROM accommodations WHERE id = $1', [id]);
    if (accCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szálláshely nem található'
      });
    }

    const result = await query(`
      INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      id,
      room_number.toString().trim(),
      floor != null ? parseInt(floor) : null,
      parseInt(beds) || 1,
      room_type || 'standard',
      notes || null,
    ]);

    logger.info('Új szoba létrehozva', { roomId: result.rows[0].id, accommodationId: id });

    res.status(201).json({
      success: true,
      message: 'Szoba sikeresen létrehozva',
      data: { room: result.rows[0] }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Ez a szobaszám már létezik ennél a szálláshelynél'
      });
    }
    logger.error('Szoba létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szoba létrehozási hiba'
    });
  }
};

/**
 * Szoba frissítése
 */
const updateRoom = async (req, res) => {
  try {
    const { id, roomId } = req.params;
    const { room_number, floor, beds, room_type, notes } = req.body;

    // Verify room belongs to accommodation
    const existing = await query(
      'SELECT id FROM accommodation_rooms WHERE id = $1 AND accommodation_id = $2',
      [roomId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szoba nem található'
      });
    }

    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (room_number !== undefined) {
      fields.push(`room_number = $${paramIndex}`);
      params.push(room_number.toString().trim());
      paramIndex++;
    }
    if (floor !== undefined) {
      fields.push(`floor = $${paramIndex}`);
      params.push(floor != null ? parseInt(floor) : null);
      paramIndex++;
    }
    if (beds !== undefined) {
      fields.push(`beds = $${paramIndex}`);
      params.push(parseInt(beds) || 1);
      paramIndex++;
    }
    if (room_type !== undefined) {
      fields.push(`room_type = $${paramIndex}`);
      params.push(room_type);
      paramIndex++;
    }
    if (notes !== undefined) {
      fields.push(`notes = $${paramIndex}`);
      params.push(notes || null);
      paramIndex++;
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nincs frissítendő mező'
      });
    }

    params.push(roomId);
    const result = await query(`
      UPDATE accommodation_rooms SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);

    logger.info('Szoba frissítve', { roomId, accommodationId: id });

    res.json({
      success: true,
      message: 'Szoba sikeresen frissítve',
      data: { room: result.rows[0] }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Ez a szobaszám már létezik ennél a szálláshelynél'
      });
    }
    logger.error('Szoba frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szoba frissítési hiba'
    });
  }
};

/**
 * Szoba törlése (soft delete)
 */
const deleteRoom = async (req, res) => {
  try {
    const { id, roomId } = req.params;

    // Verify room belongs to accommodation
    const existing = await query(
      'SELECT id FROM accommodation_rooms WHERE id = $1 AND accommodation_id = $2',
      [roomId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szoba nem található'
      });
    }

    // Unassign employees from this room
    await query('UPDATE employees SET room_id = NULL WHERE room_id = $1', [roomId]);

    // Soft delete
    await query(
      'UPDATE accommodation_rooms SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [roomId]
    );

    logger.info('Szoba deaktiválva', { roomId, accommodationId: id });

    res.json({
      success: true,
      message: 'Szoba sikeresen deaktiválva'
    });
  } catch (error) {
    logger.error('Szoba törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Szoba törlési hiba'
    });
  }
};

module.exports = {
  getRoomsByAccommodation,
  createRoom,
  updateRoom,
  deleteRoom,
};
