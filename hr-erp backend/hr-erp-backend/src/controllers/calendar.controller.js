const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const googleCalendarService = require('../services/google-calendar.service');

// ============================================================
// Helpers
// ============================================================

const ADMIN_ROLES = ['superadmin', 'data_controller', 'admin'];

function isAdmin(req) {
  return req.user.roles.some(r => ADMIN_ROLES.includes(r));
}

/**
 * Resolve employee filter based on user role.
 * Admin → req.query.employee_id or null (all)
 * Non-admin → own employee UUID
 * No employee found → 'NO_EMPLOYEE'
 */
async function resolveEmployeeFilter(req) {
  if (isAdmin(req)) {
    return req.query.employee_id || null;
  }
  const result = await query(
    'SELECT id FROM employees WHERE user_id = $1 LIMIT 1',
    [req.user.id]
  );
  if (result.rows.length === 0) return 'NO_EMPLOYEE';
  return result.rows[0].id;
}

/**
 * Lookup the employee id linked to the current user.
 * Returns null if not found.
 */
async function getOwnEmployeeId(req) {
  const result = await query(
    'SELECT id FROM employees WHERE user_id = $1 LIMIT 1',
    [req.user.id]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// ============================================================
// GET /api/v1/calendar/events
// ============================================================

const getCalendarEvents = async (req, res) => {
  try {
    const { event_type, month, year, date_from, date_to } = req.query;

    // 1. Resolve employee filter
    const employeeFilter = await resolveEmployeeFilter(req);
    if (employeeFilter === 'NO_EMPLOYEE') {
      return res.json({
        success: true,
        data: { events: [], summary: {}, dateRange: { from: null, to: null } },
      });
    }

    // 2. Compute date range
    let dateFrom, dateTo;
    if (date_from && date_to) {
      dateFrom = date_from;
      dateTo = date_to;
    } else if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      dateFrom = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    } else {
      const now = new Date();
      dateFrom = now.toISOString().split('T')[0];
      const future = new Date(now);
      future.setMonth(future.getMonth() + 3);
      dateTo = future.toISOString().split('T')[0];
    }

    // 3. Parse event types
    const allTypes = [
      'checkin', 'checkout', 'visa_expiry', 'contract_expiry', 'ticket_deadline',
      'shift', 'medical_appointment', 'personal_event',
    ];
    const selectedTypes = event_type
      ? event_type.split(',').filter(t => allTypes.includes(t.trim()))
      : allTypes;

    if (selectedTypes.length === 0) {
      return res.json({
        success: true,
        data: { events: [], summary: {}, dateRange: { from: dateFrom, to: dateTo } },
      });
    }

    // 4. Build params array
    const params = [dateFrom, dateTo];
    const empCondition = employeeFilter
      ? `AND e.id = $3`
      : '';
    if (employeeFilter) params.push(employeeFilter);

    // 5. Build UNION ALL SQL
    const subQueries = [];

    if (selectedTypes.includes('checkin')) {
      subQueries.push(`
        SELECT
          e.arrival_date AS event_date,
          'checkin' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Érkezés / Check-in' AS description,
          e.id AS related_entity_id,
          'employee' AS related_entity_type
        FROM employees e
        WHERE e.arrival_date BETWEEN $1 AND $2
          ${empCondition}
      `);
    }

    if (selectedTypes.includes('checkout')) {
      subQueries.push(`
        SELECT
          e.end_date AS event_date,
          'checkout' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Távozás / Check-out' AS description,
          e.id AS related_entity_id,
          'employee' AS related_entity_type
        FROM employees e
        WHERE e.end_date BETWEEN $1 AND $2
          AND e.end_date < CURRENT_DATE
          ${empCondition}
      `);
    }

    if (selectedTypes.includes('visa_expiry')) {
      subQueries.push(`
        SELECT
          e.visa_expiry AS event_date,
          'visa_expiry' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Vízum lejárat' AS description,
          e.id AS related_entity_id,
          'employee' AS related_entity_type
        FROM employees e
        WHERE e.visa_expiry BETWEEN $1 AND $2
          AND e.end_date IS NULL
          ${empCondition}
      `);
    }

    if (selectedTypes.includes('contract_expiry')) {
      subQueries.push(`
        SELECT
          e.end_date AS event_date,
          'contract_expiry' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Szerződés lejárat' AS description,
          e.id AS related_entity_id,
          'employee' AS related_entity_type
        FROM employees e
        WHERE e.end_date BETWEEN $1 AND $2
          AND e.end_date >= CURRENT_DATE
          ${empCondition}
      `);
    }

    if (selectedTypes.includes('ticket_deadline')) {
      subQueries.push(`
        SELECT
          t.due_date AS event_date,
          'ticket_deadline' AS type,
          t.title AS title,
          'Hibajegy határidő (#' || t.ticket_number || ')' AS description,
          t.id AS related_entity_id,
          'ticket' AS related_entity_type
        FROM tickets t
        WHERE t.due_date BETWEEN $1 AND $2
          AND t.closed_at IS NULL
      `);
    }

    // --- New personal calendar event types ---

    if (selectedTypes.includes('shift')) {
      subQueries.push(`
        SELECT
          s.shift_date AS event_date,
          'shift' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Műszak: ' || s.shift_type || COALESCE(' - ' || s.location, '') AS description,
          s.id AS related_entity_id,
          'shift' AS related_entity_type
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.shift_date BETWEEN $1 AND $2
          ${employeeFilter ? 'AND s.employee_id = $3' : ''}
      `);
    }

    if (selectedTypes.includes('medical_appointment')) {
      subQueries.push(`
        SELECT
          ma.appointment_date AS event_date,
          'medical_appointment' AS type,
          COALESCE(e.last_name, '') || ' ' || COALESCE(e.first_name, '') AS title,
          'Orvosi: ' || ma.appointment_type || COALESCE(' - ' || ma.doctor_name, '') AS description,
          ma.id AS related_entity_id,
          'medical_appointment' AS related_entity_type
        FROM medical_appointments ma
        JOIN employees e ON e.id = ma.employee_id
        WHERE ma.appointment_date BETWEEN $1 AND $2
          ${employeeFilter ? 'AND ma.employee_id = $3' : ''}
      `);
    }

    if (selectedTypes.includes('personal_event')) {
      subQueries.push(`
        SELECT
          pe.event_date AS event_date,
          'personal_event' AS type,
          pe.title AS title,
          COALESCE(pe.description, pe.event_type) AS description,
          pe.id AS related_entity_id,
          'personal_event' AS related_entity_type
        FROM personal_events pe
        JOIN employees e ON e.id = pe.employee_id
        WHERE pe.event_date BETWEEN $1 AND $2
          ${employeeFilter ? 'AND pe.employee_id = $3' : ''}
      `);
    }

    if (subQueries.length === 0) {
      return res.json({
        success: true,
        data: { events: [], summary: {}, dateRange: { from: dateFrom, to: dateTo } },
      });
    }

    const sql = subQueries.join('\nUNION ALL\n') + '\nORDER BY event_date ASC';
    const result = await query(sql, params);

    // 6. Post-process: urgency + days_until
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const events = result.rows.map(row => {
      const eventDate = new Date(row.event_date);
      eventDate.setHours(0, 0, 0, 0);
      const diffMs = eventDate.getTime() - now.getTime();
      const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));

      let urgency;
      if (daysUntil < 0) urgency = 'past';
      else if (daysUntil < 7) urgency = 'critical';
      else if (daysUntil < 30) urgency = 'warning';
      else urgency = 'normal';

      return {
        ...row,
        event_date: row.event_date ? new Date(row.event_date).toISOString().split('T')[0] : null,
        days_until: daysUntil,
        urgency,
      };
    });

    // 7. Summary counts
    const summary = {
      checkin: 0,
      checkout: 0,
      visa_expiry: 0,
      contract_expiry: 0,
      ticket_deadline: 0,
      shift: 0,
      medical_appointment: 0,
      personal_event: 0,
      critical: 0,
      warning: 0,
      total: events.length,
    };

    events.forEach(ev => {
      if (summary[ev.type] !== undefined) summary[ev.type]++;
      if (ev.urgency === 'critical') summary.critical++;
      if (ev.urgency === 'warning') summary.warning++;
    });

    res.json({
      success: true,
      data: { events, summary, dateRange: { from: dateFrom, to: dateTo } },
    });
  } catch (error) {
    logger.error('Naptár események lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Naptár események lekérési hiba' });
  }
};

// ============================================================
// GET /api/v1/calendar/my  (resident self-service)
// Auth-only, SELF-SCOPED, READ-ONLY / ONE-WAY: returns ONLY the caller's own
// upcoming events. Nothing here reads back into HR-ERP. v1 types only
// (medical/personal excluded for privacy; inspections = v2).
// ============================================================
const getMyCalendarEvents = async (req, res) => {
  try {
    const employeeId = await getOwnEmployeeId(req);
    if (!employeeId) {
      // No linked employee record (e.g. a staff-only login) → nothing to show.
      return res.json({ success: true, data: { events: [], dateRange: { from: null, to: null } } });
    }
    const userId = req.user.id;

    // Upcoming window: optional ?date_from/?date_to, else now → +3 months.
    let dateFrom, dateTo;
    const { date_from, date_to } = req.query;
    if (date_from && date_to) {
      dateFrom = date_from;
      dateTo = date_to;
    } else {
      const now = new Date();
      dateFrom = now.toISOString().split('T')[0];
      const future = new Date(now);
      future.setMonth(future.getMonth() + 3);
      dateTo = future.toISOString().split('T')[0];
    }

    // Every event a resident sees relates to where they live → resolve their own
    // accommodation (name + room) once and attach it to each event.
    const accResult = await query(
      `SELECT acc.name AS accommodation_name, e.room_number, e.accommodation_id
         FROM employees e
         LEFT JOIN accommodations acc ON acc.id = e.accommodation_id
        WHERE e.id = $1`,
      [employeeId]
    );
    const accRow = accResult.rows[0] || {};
    const accommodation = accRow.accommodation_name
      ? { name: accRow.accommodation_name, room: accRow.room_number || null }
      : null;
    const accommodationId = accRow.accommodation_id || null;

    // EVERY subquery is scoped to the caller. CRITICAL: the admin aggregator's
    // ticket_deadline subquery has NO employee filter (admins see all). Here it
    // is strictly limited to the resident's OWN tickets — created_by = the user,
    // OR linked_employee_id = the employee — so a resident can NEVER see another
    // resident's repair deadlines.
    // params: $1 dateFrom, $2 dateTo, $3 employeeId, $4 userId, $5 accommodationId
    // related_id is cast to ::text in EVERY subquery so the UNION column has one
    // consistent type regardless of each source table's PK type.
    const { rows } = await query(
      `
      SELECT e.arrival_date AS event_date, 'checkin' AS type,
             'Beköltözés' AS title, 'Érkezés a szállásra' AS description, e.id::text AS related_id
        FROM employees e
       WHERE e.arrival_date BETWEEN $1 AND $2 AND e.id = $3
      UNION ALL
      SELECT e.end_date, 'checkout',
             'Kiköltözés', 'Távozás a szállásról', e.id::text
        FROM employees e
       WHERE e.end_date BETWEEN $1 AND $2 AND e.end_date < CURRENT_DATE AND e.id = $3
      UNION ALL
      SELECT e.visa_expiry, 'visa_expiry',
             'Vízum lejárat', 'A vízumod ekkor jár le — időben hosszabbítsd meg', e.id::text
        FROM employees e
       WHERE e.visa_expiry BETWEEN $1 AND $2 AND e.end_date IS NULL AND e.id = $3
      UNION ALL
      SELECT e.end_date, 'contract_expiry',
             'Szerződés lejárat', 'A szerződésed ekkor jár le', e.id::text
        FROM employees e
       WHERE e.end_date BETWEEN $1 AND $2 AND e.end_date >= CURRENT_DATE AND e.id = $3
      UNION ALL
      SELECT t.due_date, 'ticket_deadline', t.title,
             'Tervezett javítás határideje (#' || t.ticket_number || ')', t.id::text
        FROM tickets t
       WHERE t.due_date BETWEEN $1 AND $2 AND t.closed_at IS NULL
         AND (t.created_by = $4 OR t.linked_employee_id = $3)
      UNION ALL
      -- Resident's OWN shifts (scoped by employee_id). shift_type is shown as the
      -- description; the localized "Shift" label is applied client-side by type.
      SELECT s.shift_date, 'shift',
             'Műszak', COALESCE(NULLIF(s.shift_type, ''), 'Beosztott műszak'), s.id::text
        FROM shifts s
       WHERE s.shift_date BETWEEN $1 AND $2 AND s.employee_id = $3
      UNION ALL
      -- Upcoming inspection of the resident's OWN accommodation (scoped by
      -- accommodation_id; = $5 is never true when $5 is NULL, so a resident with
      -- no accommodation sees none). Completed/cancelled instances are excluded.
      SELECT ins.scheduled_at::date, 'inspection',
             'Szemle', 'A szállásod ellenőrzése', ins.id::text
        FROM inspections ins
       WHERE ins.scheduled_at::date BETWEEN $1 AND $2
         AND ins.accommodation_id = $5
         AND COALESCE(ins.status, '') NOT IN ('completed', 'cancelled')
      ORDER BY event_date ASC
      `,
      [dateFrom, dateTo, employeeId, userId, accommodationId]
    );

    const events = rows.map((r) => ({
      id: r.related_id,
      type: r.type,
      title: r.title,
      date: r.event_date,
      description: r.description,
      accommodation,
    }));

    return res.json({
      success: true,
      data: { events, dateRange: { from: dateFrom, to: dateTo } },
    });
  } catch (error) {
    logger.error('Saját naptár lekérési hiba:', error);
    return res.status(500).json({ success: false, message: 'Naptár betöltési hiba' });
  }
};

// ============================================================
// .ics export — minimal RFC 5545 VEVENT for one-way "add to my calendar".
// ============================================================
const ICS_TYPES = ['checkin', 'checkout', 'visa_expiry', 'contract_expiry', 'ticket_deadline', 'shift', 'inspection'];

// System-event SUMMARY labels per language (ticket events use the ticket title).
const ICS_LABELS = {
  checkin:         { hu: 'Beköltözés', en: 'Move-in', uk: 'Заселення', tl: 'Pag-check-in', de: 'Einzug' },
  checkout:        { hu: 'Kiköltözés', en: 'Move-out', uk: 'Виселення', tl: 'Pag-check-out', de: 'Auszug' },
  visa_expiry:     { hu: 'Vízum lejárat', en: 'Visa expiry', uk: 'Закінчення візи', tl: 'Pag-expire ng visa', de: 'Visum-Ablauf' },
  contract_expiry: { hu: 'Szerződés lejárat', en: 'Contract expiry', uk: 'Закінчення договору', tl: 'Pag-expire ng kontrata', de: 'Vertragsende' },
  shift:           { hu: 'Műszak', en: 'Shift', uk: 'Зміна', tl: 'Shift', de: 'Schicht' },
  inspection:      { hu: 'Szemle', en: 'Inspection', uk: 'Перевірка', tl: 'Inspeksyon', de: 'Inspektion' },
};

function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Fold long content lines at 75 octets (RFC 5545 §3.1).
function icsFold(line) {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let i = 75;
  while (i < line.length) { out += '\r\n ' + line.slice(i, i + 74); i += 74; }
  return out;
}

function ymd(d) {
  // node-pg returns DATE columns as Date objects (at local midnight). Use the
  // local Y/M/D so the all-day date never shifts across timezones; for a plain
  // 'YYYY-MM-DD…' string just slice it.
  if (d instanceof Date) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(d).slice(0, 10).replace(/-/g, '');
}

function buildIcs({ uid, dateYmd, summary, description, location, dtstamp }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Housing Solutions//HR-ERP//HU',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${dtstamp}`, `DTSTART;VALUE=DATE:${dateYmd}`,
    `SUMMARY:${icsEscape(summary)}`,
    description ? `DESCRIPTION:${icsEscape(description)}` : null,
    location ? `LOCATION:${icsEscape(location)}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).map(icsFold).join('\r\n') + '\r\n';
}

// ============================================================
// GET /api/v1/calendar/my/:type/:id.ics  (resident self-service)
// Auth-only, SELF-SCOPED, READ-ONLY / ONE-WAY: returns a single VEVENT for the
// caller's OWN event so they can add it to ANY calendar app. No SMTP, no OAuth.
// ============================================================
const getMyCalendarEventIcs = async (req, res) => {
  try {
    const employeeId = await getOwnEmployeeId(req);
    if (!employeeId) return res.status(404).json({ success: false, message: 'Esemény nem található' });
    const userId = req.user.id;
    const { type, id } = req.params;
    if (!ICS_TYPES.includes(type)) {
      return res.status(404).json({ success: false, message: 'Ismeretlen eseménytípus' });
    }

    // Accommodation (the resident's own) → LOCATION.
    const accResult = await query(
      `SELECT acc.name AS name, acc.address AS address, e.room_number AS room,
              e.accommodation_id AS accommodation_id
         FROM employees e LEFT JOIN accommodations acc ON acc.id = e.accommodation_id
        WHERE e.id = $1`,
      [employeeId]
    );
    const a = accResult.rows[0] || {};
    const accommodationId = a.accommodation_id || null;
    const location = a.name
      ? [a.name, a.room ? `Szoba ${a.room}` : null, a.address].filter(Boolean).join(', ')
      : '';

    let date, summary, description, uid;

    if (type === 'ticket_deadline') {
      const r = await query(
        `SELECT id, title, ticket_number, due_date
           FROM tickets
          WHERE id = $1 AND closed_at IS NULL
            AND (created_by = $2 OR linked_employee_id = $3)`,
        [id, userId, employeeId]
      );
      if (r.rows.length === 0 || !r.rows[0].due_date) {
        return res.status(404).json({ success: false, message: 'Esemény nem található' });
      }
      const t = r.rows[0];
      date = t.due_date;
      summary = t.title || 'Tervezett javítás';
      description = `Tervezett javítás határideje (#${t.ticket_number})`;
      uid = `ticket-${t.id}@housingsolutions.hu`;
    } else if (type === 'shift') {
      // Self-scoped: the shift MUST belong to the caller's own employee row.
      const r = await query(
        `SELECT id, shift_date, shift_type FROM shifts WHERE id = $1 AND employee_id = $2`,
        [id, employeeId]
      );
      if (r.rows.length === 0 || !r.rows[0].shift_date) {
        return res.status(404).json({ success: false, message: 'Esemény nem található' });
      }
      const s = r.rows[0];
      date = s.shift_date;
      const lang = String(req.query.lang || '').toLowerCase();
      const labels = ICS_LABELS.shift;
      summary = labels[lang] || labels.hu;
      description = s.shift_type ? `${summary} — ${s.shift_type}` : summary;
      uid = `shift-${s.id}@housingsolutions.hu`;
    } else if (type === 'inspection') {
      // Self-scoped: the inspection MUST be for the caller's OWN accommodation.
      const r = await query(
        `SELECT id, scheduled_at FROM inspections
          WHERE id = $1 AND accommodation_id = $2
            AND COALESCE(status, '') NOT IN ('completed', 'cancelled')`,
        [id, accommodationId]
      );
      if (r.rows.length === 0 || !r.rows[0].scheduled_at) {
        return res.status(404).json({ success: false, message: 'Esemény nem található' });
      }
      date = r.rows[0].scheduled_at;
      const lang = String(req.query.lang || '').toLowerCase();
      const labels = ICS_LABELS.inspection;
      summary = labels[lang] || labels.hu;
      description = a.name ? `${summary} — ${a.name}` : summary;
      uid = `inspection-${r.rows[0].id}@housingsolutions.hu`;
    } else {
      // Employee-based event: the :id MUST be the caller's own employee.
      if (id !== employeeId) {
        return res.status(404).json({ success: false, message: 'Esemény nem található' });
      }
      const col = type === 'checkin' ? 'arrival_date'
        : type === 'visa_expiry' ? 'visa_expiry'
        : 'end_date'; // checkout + contract_expiry
      const r = await query(`SELECT ${col} AS d FROM employees WHERE id = $1`, [employeeId]);
      const d = r.rows[0] && r.rows[0].d;
      if (!d) return res.status(404).json({ success: false, message: 'Esemény nem található' });
      date = d;
      const lang = String(req.query.lang || '').toLowerCase();
      const labels = ICS_LABELS[type] || {};
      summary = labels[lang] || labels.hu || type;
      description = a.name ? `${summary} — ${a.name}` : summary;
      uid = `${type}-${employeeId}@housingsolutions.hu`;
    }

    const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = buildIcs({ uid, dateYmd: ymd(date), summary, description, location, dtstamp });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="event.ics"');
    return res.send(ics);
  } catch (error) {
    logger.error('ICS export hiba:', error);
    return res.status(500).json({ success: false, message: 'Naptár export hiba' });
  }
};

// ============================================================
// Shift CRUD (admin only — enforced at route level)
// ============================================================

const createShift = async (req, res) => {
  try {
    const { employee_id, shift_date, shift_start_time, shift_end_time, shift_type, location, notes } = req.body;
    if (!employee_id || !shift_date || !shift_start_time || !shift_end_time || !shift_type) {
      return res.status(400).json({ success: false, message: 'Kötelező mezők: employee_id, shift_date, shift_start_time, shift_end_time, shift_type' });
    }
    const result = await query(
      `INSERT INTO shifts (employee_id, shift_date, shift_start_time, shift_end_time, shift_type, location, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [employee_id, shift_date, shift_start_time, shift_end_time, shift_type, location || null, notes || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });

    // Google Calendar sync (fire-and-forget)
    googleCalendarService.getUserIdForEmployee(employee_id).then(uid => {
      if (uid) googleCalendarService.syncLocalEventToGoogle(uid, result.rows[0], 'shift');
    }).catch(err => logger.warn('Google sync hiba (shift create):', err.message));
  } catch (error) {
    logger.error('Műszak létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Műszak létrehozási hiba' });
  }
};

const updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const { employee_id, shift_date, shift_start_time, shift_end_time, shift_type, location, notes } = req.body;
    const result = await query(
      `UPDATE shifts SET
        employee_id = COALESCE($1, employee_id),
        shift_date = COALESCE($2, shift_date),
        shift_start_time = COALESCE($3, shift_start_time),
        shift_end_time = COALESCE($4, shift_end_time),
        shift_type = COALESCE($5, shift_type),
        location = COALESCE($6, location),
        notes = COALESCE($7, notes)
       WHERE id = $8 RETURNING *`,
      [employee_id, shift_date, shift_start_time, shift_end_time, shift_type, location, notes, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Műszak nem található' });
    }
    res.json({ success: true, data: result.rows[0] });

    // Google Calendar sync (fire-and-forget)
    const shiftRow = result.rows[0];
    googleCalendarService.getUserIdForEmployee(shiftRow.employee_id).then(uid => {
      if (uid) googleCalendarService.syncLocalEventUpdateToGoogle(uid, shiftRow, 'shift');
    }).catch(err => logger.warn('Google sync hiba (shift update):', err.message));
  } catch (error) {
    logger.error('Műszak frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Műszak frissítési hiba' });
  }
};

const deleteShift = async (req, res) => {
  try {
    const { id } = req.params;
    // Get employee_id before delete for sync
    const shiftInfo = await query('SELECT employee_id FROM shifts WHERE id = $1', [id]);
    const result = await query('DELETE FROM shifts WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Műszak nem található' });
    }
    res.json({ success: true, message: 'Műszak törölve' });

    // Google Calendar sync (fire-and-forget)
    if (shiftInfo.rows.length > 0) {
      googleCalendarService.getUserIdForEmployee(shiftInfo.rows[0].employee_id).then(uid => {
        if (uid) googleCalendarService.syncLocalEventDeleteFromGoogle(uid, id, 'shift');
      }).catch(err => logger.warn('Google sync hiba (shift delete):', err.message));
    }
  } catch (error) {
    logger.error('Műszak törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Műszak törlési hiba' });
  }
};

// ============================================================
// Medical Appointment CRUD (own or admin)
// ============================================================

const createMedicalAppointment = async (req, res) => {
  try {
    let { employee_id, appointment_date, appointment_time, doctor_name, clinic_location, appointment_type, notes } = req.body;
    if (!appointment_date || !appointment_type) {
      return res.status(400).json({ success: false, message: 'Kötelező mezők: appointment_date, appointment_type' });
    }
    // Non-admin: force own employee_id
    if (!isAdmin(req)) {
      const ownId = await getOwnEmployeeId(req);
      if (!ownId) return res.status(403).json({ success: false, message: 'Nincs hozzárendelt dolgozói profil' });
      employee_id = ownId;
    } else if (!employee_id) {
      return res.status(400).json({ success: false, message: 'employee_id kötelező' });
    }
    const result = await query(
      `INSERT INTO medical_appointments (employee_id, appointment_date, appointment_time, doctor_name, clinic_location, appointment_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [employee_id, appointment_date, appointment_time || null, doctor_name || null, clinic_location || null, appointment_type, notes || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });

    // Google Calendar sync (fire-and-forget)
    googleCalendarService.getUserIdForEmployee(employee_id).then(uid => {
      if (uid) googleCalendarService.syncLocalEventToGoogle(uid, result.rows[0], 'medical_appointment');
    }).catch(err => logger.warn('Google sync hiba (medical create):', err.message));
  } catch (error) {
    logger.error('Orvosi vizsgálat létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Orvosi vizsgálat létrehozási hiba' });
  }
};

const updateMedicalAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    // Ownership check for non-admin
    if (!isAdmin(req)) {
      const ownId = await getOwnEmployeeId(req);
      const check = await query('SELECT employee_id FROM medical_appointments WHERE id = $1', [id]);
      if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Nem található' });
      if (check.rows[0].employee_id !== ownId) return res.status(403).json({ success: false, message: 'Nincs jogosultság' });
    }
    const { appointment_date, appointment_time, doctor_name, clinic_location, appointment_type, notes } = req.body;
    const result = await query(
      `UPDATE medical_appointments SET
        appointment_date = COALESCE($1, appointment_date),
        appointment_time = COALESCE($2, appointment_time),
        doctor_name = COALESCE($3, doctor_name),
        clinic_location = COALESCE($4, clinic_location),
        appointment_type = COALESCE($5, appointment_type),
        notes = COALESCE($6, notes)
       WHERE id = $7 RETURNING *`,
      [appointment_date, appointment_time, doctor_name, clinic_location, appointment_type, notes, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true, data: result.rows[0] });

    // Google Calendar sync (fire-and-forget)
    const apptRow = result.rows[0];
    googleCalendarService.getUserIdForEmployee(apptRow.employee_id).then(uid => {
      if (uid) googleCalendarService.syncLocalEventUpdateToGoogle(uid, apptRow, 'medical_appointment');
    }).catch(err => logger.warn('Google sync hiba (medical update):', err.message));
  } catch (error) {
    logger.error('Orvosi vizsgálat frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Orvosi vizsgálat frissítési hiba' });
  }
};

const deleteMedicalAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    // Get employee_id before delete for sync
    const apptInfo = await query('SELECT employee_id FROM medical_appointments WHERE id = $1', [id]);
    if (!isAdmin(req)) {
      const ownId = await getOwnEmployeeId(req);
      if (apptInfo.rows.length === 0) return res.status(404).json({ success: false, message: 'Nem található' });
      if (apptInfo.rows[0].employee_id !== ownId) return res.status(403).json({ success: false, message: 'Nincs jogosultság' });
    }
    const result = await query('DELETE FROM medical_appointments WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true, message: 'Orvosi vizsgálat törölve' });

    // Google Calendar sync (fire-and-forget)
    if (apptInfo.rows.length > 0) {
      googleCalendarService.getUserIdForEmployee(apptInfo.rows[0].employee_id).then(uid => {
        if (uid) googleCalendarService.syncLocalEventDeleteFromGoogle(uid, id, 'medical_appointment');
      }).catch(err => logger.warn('Google sync hiba (medical delete):', err.message));
    }
  } catch (error) {
    logger.error('Orvosi vizsgálat törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Orvosi vizsgálat törlési hiba' });
  }
};

// ============================================================
// Personal Event CRUD (own or admin)
// ============================================================

const createPersonalEvent = async (req, res) => {
  try {
    let { employee_id, event_date, event_time, event_type, title, description, all_day } = req.body;
    if (!event_date || !event_type || !title) {
      return res.status(400).json({ success: false, message: 'Kötelező mezők: event_date, event_type, title' });
    }
    if (!isAdmin(req)) {
      const ownId = await getOwnEmployeeId(req);
      if (!ownId) return res.status(403).json({ success: false, message: 'Nincs hozzárendelt dolgozói profil' });
      employee_id = ownId;
    } else if (!employee_id) {
      return res.status(400).json({ success: false, message: 'employee_id kötelező' });
    }
    const result = await query(
      `INSERT INTO personal_events (employee_id, event_date, event_time, event_type, title, description, all_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [employee_id, event_date, event_time || null, event_type, title, description || null, all_day ?? false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });

    // Google Calendar sync (fire-and-forget)
    googleCalendarService.getUserIdForEmployee(employee_id).then(uid => {
      if (uid) googleCalendarService.syncLocalEventToGoogle(uid, result.rows[0], 'personal_event');
    }).catch(err => logger.warn('Google sync hiba (personal create):', err.message));
  } catch (error) {
    logger.error('Személyes esemény létrehozási hiba:', error);
    res.status(500).json({ success: false, message: 'Személyes esemény létrehozási hiba' });
  }
};

const updatePersonalEvent = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isAdmin(req)) {
      const ownId = await getOwnEmployeeId(req);
      const check = await query('SELECT employee_id FROM personal_events WHERE id = $1', [id]);
      if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Nem található' });
      if (check.rows[0].employee_id !== ownId) return res.status(403).json({ success: false, message: 'Nincs jogosultság' });
    }
    const { event_date, event_time, event_type, title, description, all_day } = req.body;
    const result = await query(
      `UPDATE personal_events SET
        event_date = COALESCE($1, event_date),
        event_time = COALESCE($2, event_time),
        event_type = COALESCE($3, event_type),
        title = COALESCE($4, title),
        description = COALESCE($5, description),
        all_day = COALESCE($6, all_day)
       WHERE id = $7 RETURNING *`,
      [event_date, event_time, event_type, title, description, all_day, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true, data: result.rows[0] });

    // Google Calendar sync (fire-and-forget)
    const peRow = result.rows[0];
    googleCalendarService.getUserIdForEmployee(peRow.employee_id).then(uid => {
      if (uid) googleCalendarService.syncLocalEventUpdateToGoogle(uid, peRow, 'personal_event');
    }).catch(err => logger.warn('Google sync hiba (personal update):', err.message));
  } catch (error) {
    logger.error('Személyes esemény frissítési hiba:', error);
    res.status(500).json({ success: false, message: 'Személyes esemény frissítési hiba' });
  }
};

const deletePersonalEvent = async (req, res) => {
  try {
    const { id } = req.params;
    // Get employee_id before delete for sync
    const peInfo = await query('SELECT employee_id FROM personal_events WHERE id = $1', [id]);
    if (!isAdmin(req)) {
      const ownId = await getOwnEmployeeId(req);
      if (peInfo.rows.length === 0) return res.status(404).json({ success: false, message: 'Nem található' });
      if (peInfo.rows[0].employee_id !== ownId) return res.status(403).json({ success: false, message: 'Nincs jogosultság' });
    }
    const result = await query('DELETE FROM personal_events WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true, message: 'Személyes esemény törölve' });

    // Google Calendar sync (fire-and-forget)
    if (peInfo.rows.length > 0) {
      googleCalendarService.getUserIdForEmployee(peInfo.rows[0].employee_id).then(uid => {
        if (uid) googleCalendarService.syncLocalEventDeleteFromGoogle(uid, id, 'personal_event');
      }).catch(err => logger.warn('Google sync hiba (personal delete):', err.message));
    }
  } catch (error) {
    logger.error('Személyes esemény törlési hiba:', error);
    res.status(500).json({ success: false, message: 'Személyes esemény törlési hiba' });
  }
};

module.exports = {
  getCalendarEvents,
  getMyCalendarEvents,
  getMyCalendarEventIcs,
  createShift,
  updateShift,
  deleteShift,
  createMedicalAppointment,
  updateMedicalAppointment,
  deleteMedicalAppointment,
  createPersonalEvent,
  updatePersonalEvent,
  deletePersonalEvent,
};
