/**
 * Natural ordering for room numbers.
 *
 * `accommodation_rooms.room_number` is varchar, because real room labels are not
 * integers: "2", "10", "113", but also "9 /B2", "A/4", "földszint 1". Sorting that
 * column as text puts "10" before "2" and "113" before "9", which is what a tester
 * reported and what anyone reading a settlement sheet would call broken.
 *
 * The fix is to sort on the LEADING integer when there is one, and fall back to the raw
 * text otherwise:
 *
 *   "2"      -> 2
 *   "10"     -> 10
 *   "113"    -> 113
 *   "9 /B2"  -> 9      (ties fall back to text, so "9 /B2" < "9 /B3")
 *   "A/4"    -> NULL   (no leading digits — sorts after the numbered rooms, by text)
 *
 * Known limit: the tiebreaker is plain text, so "9 /B10" sorts before "9 /B2". Sorting
 * every embedded number segment would fix that, and is not worth the complexity until a
 * site actually has more than nine sub-rooms behind one number.
 *
 * NULLS LAST is deliberate: a house with rooms 1..10 plus a "Konyha" should list the
 * numbered rooms in order and put the named ones at the end, not first.
 *
 * Used by every place that lists rooms so the order is the same everywhere — the room
 * list, the occupancy view, inspections, the inspection PDF and the exports. The
 * settlement sheet sorts in JS and already passes { numeric: true } to localeCompare,
 * which is the same rule.
 */

/**
 * ORDER BY fragment for a room-number column.
 * @param {string} col qualified column, e.g. 'ar.room_number'
 * @returns {string} SQL suitable for direct interpolation into ORDER BY
 */
const byRoomNumber = (col) =>
  `NULLIF(substring(${col} FROM '^[0-9]+'), '')::bigint NULLS LAST, ${col}`;

/** The same rule for arrays already in memory (JS side). */
const compareRoomNumbers = (a, b) =>
  String(a ?? '').localeCompare(String(b ?? ''), 'hu', { numeric: true, sensitivity: 'base' });

module.exports = { byRoomNumber, compareRoomNumbers };
