const { query, transaction } = require('../database/connection');
const { byRoomNumber } = require('../utils/roomOrder');
const { logger } = require('../utils/logger');
const accHistory = require('../services/accommodationHistory.service');

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
      ORDER BY ${byRoomNumber('ar.room_number')}
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

    const number = room_number.toString().trim();
    const cols = [
      floor != null ? parseInt(floor) : null,
      parseInt(beds) || 1,
      room_type || 'standard',
      notes || null,
    ];

    // A deleted room is only DEACTIVATED (see deleteRoom), but the table carries a hard
    // UNIQUE (accommodation_id, room_number) that knows nothing about is_active. So the
    // number stays taken after a delete and recreating it used to fail with "already
    // exists" against a row the user could no longer see. Reactivate that row instead:
    // reusing the id also keeps the room's inspections and occupancy history attached,
    // which is what someone re-adding the same room number actually means.
    const dormant = await query(
      `SELECT id FROM accommodation_rooms
        WHERE accommodation_id = $1 AND room_number = $2 AND is_active = false`,
      [id, number]);

    if (dormant.rows.length > 0) {
      const revived = await query(
        `UPDATE accommodation_rooms
            SET is_active = true, floor = $1, beds = $2, room_type = $3, notes = $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $5 RETURNING *`,
        [...cols, dormant.rows[0].id]);
      logger.info('Korábban törölt szoba visszaállítva', { roomId: dormant.rows[0].id, accommodationId: id });
      return res.status(201).json({
        success: true,
        message: 'Ez a szobaszám korábban törölve lett — a szoba visszaállítva a korábbi előzményeivel együtt',
        data: { room: revived.rows[0], restored: true }
      });
    }

    const result = await query(`
      INSERT INTO accommodation_rooms (accommodation_id, room_number, floor, beds, room_type, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, number, ...cols]);

    logger.info('Új szoba létrehozva', { roomId: result.rows[0].id, accommodationId: id });

    res.status(201).json({
      success: true,
      message: 'Szoba sikeresen létrehozva',
      data: { room: result.rows[0], restored: false }
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
/**
 * Szoba törlése.
 *
 * TWO THINGS THIS HAS TO GET RIGHT
 * --------------------------------
 * 1. Deleting a room UN-ROOMS whoever lives in it. That is a housing change with billing
 *    and consolidation consequences, so it must never happen as a side effect of a click
 *    the user thought was tidying up an empty room. The first call reports how many
 *    people would be displaced and refuses; the caller has to come back with
 *    `?confirm=true` to mean it.
 *
 * 2. A room that has never been used is DELETED OUTRIGHT, not deactivated. The table has
 *    a hard UNIQUE (accommodation_id, room_number), so a soft-deleted row keeps its
 *    number reserved forever — which is why recreating a just-deleted room came back
 *    "already exists" against a row the user could no longer see. A room with real
 *    history (occupancy, inspections, compensations) still soft-deletes, because that
 *    history must keep pointing at something; createRoom reactivates such a row if the
 *    same number is added again.
 */
const deleteRoom = async (req, res) => {
  try {
    const { id, roomId } = req.params;
    const confirmed = req.query.confirm === 'true' || req.body?.confirm === true;

    const existing = await query(
      'SELECT id, room_number FROM accommodation_rooms WHERE id = $1 AND accommodation_id = $2',
      [roomId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Szoba nem található' });
    }

    const occupants = await query(
      `SELECT id, CONCAT(last_name, ' ', first_name) AS name, employee_number
         FROM employees
        WHERE room_id = $1 AND (end_date IS NULL OR end_date > CURRENT_DATE)
        ORDER BY last_name, first_name`,
      [roomId]
    );

    if (occupants.rows.length > 0 && !confirmed) {
      return res.status(409).json({
        success: false,
        requires_confirmation: true,
        message: `Ebben a szobában ${occupants.rows.length} lakó van. Törlés esetén kikerülnek a szobából `
               + '(a szálláshelyen maradnak, de szoba nélkül). Biztosan törlöd?',
        data: {
          room_number: existing.rows[0].room_number,
          occupant_count: occupants.rows.length,
          occupants: occupants.rows,
        },
      });
    }

    // Has this room any trace beyond the current occupants? If not, it can go for good
    // and its number becomes free again.
    const refs = await query(
      `SELECT
         (SELECT count(*) FROM employee_accommodation_history WHERE room_id = $1) AS history,
         (SELECT count(*) FROM occupancy_snapshots            WHERE room_id = $1) AS snapshots,
         (SELECT count(*) FROM room_inspections               WHERE room_id = $1) AS inspections,
         (SELECT count(*) FROM compensations                  WHERE room_id = $1) AS compensations`,
      [roomId]
    );
    const r = refs.rows[0];
    const referenced = Number(r.history) + Number(r.snapshots)
                     + Number(r.inspections) + Number(r.compensations) > 0;

    await transaction(async (client) => {
      const unassigned = await client.query(
        'UPDATE employees SET room_id = NULL WHERE room_id = $1 RETURNING id, accommodation_id, end_date',
        [roomId]
      );
      for (const emp of unassigned.rows) {
        if (emp.end_date) continue;
        await accHistory.syncAssignment(client, {
          employeeId: emp.id, accommodationId: emp.accommodation_id, roomId: null,
          reason: 'room deleted', changedBy: req.user?.id || null,
        });
      }

      if (referenced) {
        await client.query(
          'UPDATE accommodation_rooms SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [roomId]
        );
      } else {
        await client.query('DELETE FROM accommodation_rooms WHERE id = $1', [roomId]);
      }
    });

    logger.info(referenced ? 'Szoba deaktiválva (van előzménye)' : 'Szoba véglegesen törölve', {
      roomId, accommodationId: id, unhoused: occupants.rows.length,
    });

    res.json({
      success: true,
      message: referenced
        ? 'Szoba deaktiválva. Volt előzménye, ezért megőriztük — ugyanezzel a szobaszámmal újra létrehozva visszaáll.'
        : 'Szoba törölve. A szobaszám újra használható.',
      data: {
        hard_deleted: !referenced,
        unhoused_count: occupants.rows.length,
        unhoused: occupants.rows,
      },
    });
  } catch (error) {
    logger.error('Szoba törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Szoba törlési hiba' });
  }
};

/**
 * Lakó beköltöztetése / kiköltöztetése egy szobába — közvetlenül a szobalistából.
 *
 * The assignment used to live only on the Employees side, so someone who had just added
 * rooms to an accommodation had no way to fill them from where they were standing. Both
 * write occupancy history, because both ARE housing changes.
 */
const assignOccupant = async (req, res) => {
  try {
    const { id, roomId } = req.params;
    const { employee_id } = req.body;
    if (!employee_id) {
      return res.status(400).json({ success: false, message: 'employee_id megadása kötelező' });
    }

    const room = await query(
      `SELECT ar.id, ar.beds, ar.room_number,
              (SELECT count(*) FROM employees e
                WHERE e.room_id = ar.id AND (e.end_date IS NULL OR e.end_date > CURRENT_DATE)) AS occupied
         FROM accommodation_rooms ar
        WHERE ar.id = $1 AND ar.accommodation_id = $2 AND ar.is_active = true`,
      [roomId, id]
    );
    if (room.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Szoba nem található' });
    }
    if (Number(room.rows[0].occupied) >= Number(room.rows[0].beds)) {
      return res.status(409).json({
        success: false,
        message: `A(z) ${room.rows[0].room_number} szoba tele van (${room.rows[0].occupied}/${room.rows[0].beds}).`,
      });
    }

    const emp = await query(
      'SELECT id, accommodation_id, end_date FROM employees WHERE id = $1', [employee_id]);
    if (emp.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Munkavállaló nem található' });
    }

    await transaction(async (client) => {
      await client.query(
        'UPDATE employees SET room_id = $1, accommodation_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [roomId, id, employee_id]);
      if (!emp.rows[0].end_date) {
        await accHistory.syncAssignment(client, {
          employeeId: employee_id, accommodationId: id, roomId,
          reason: 'room assignment', changedBy: req.user?.id || null,
        });
      }
    });

    logger.info('Lakó szobához rendelve', { roomId, employeeId: employee_id });
    res.json({ success: true, message: 'Lakó beköltöztetve' });
  } catch (error) {
    logger.error('Lakó beköltöztetési hiba:', error);
    res.status(500).json({ success: false, message: 'Lakó beköltöztetési hiba' });
  }
};

const removeOccupant = async (req, res) => {
  try {
    const { id, roomId, employeeId } = req.params;
    const emp = await query(
      'SELECT id, accommodation_id, end_date FROM employees WHERE id = $1 AND room_id = $2',
      [employeeId, roomId]);
    if (emp.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ez a lakó nem ebben a szobában van' });
    }

    await transaction(async (client) => {
      // They stay AT the accommodation, just no longer in this room — the same semantics
      // as deleting the room out from under them.
      await client.query(
        'UPDATE employees SET room_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [employeeId]);
      if (!emp.rows[0].end_date) {
        await accHistory.syncAssignment(client, {
          employeeId, accommodationId: emp.rows[0].accommodation_id, roomId: null,
          reason: 'room unassignment', changedBy: req.user?.id || null,
        });
      }
    });

    logger.info('Lakó kiköltöztetve a szobából', { roomId, employeeId });
    res.json({ success: true, message: 'Lakó kiköltöztetve a szobából' });
  } catch (error) {
    logger.error('Lakó kiköltöztetési hiba:', error);
    res.status(500).json({ success: false, message: 'Lakó kiköltöztetési hiba' });
  }
};

module.exports = {
  getRoomsByAccommodation,
  createRoom,
  updateRoom,
  deleteRoom,
  assignOccupant,
  removeOccupant,
};
