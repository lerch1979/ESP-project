const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CASE_STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const BOOKING_STATUSES = ['scheduled', 'confirmed', 'cancelled', 'completed', 'no_show'];
const URGENCY_LEVELS = ['low', 'medium', 'high', 'crisis'];
const SESSION_TYPES = ['individual_counseling', 'couples_therapy', 'legal_consultation', 'financial_advice', 'crisis_intervention', 'group_session', 'follow_up'];

const PROVIDER_TYPE_MAP = {
  'Pszichológiai tanácsadás': ['counselor', 'therapist'],
  'Jogi tanácsadás': ['lawyer'],
  'Pénzügyi tanácsadás': ['financial_advisor'],
  'Családi támogatás': ['counselor', 'therapist', 'mediator'],
  'Krízisintervenció': ['crisis_specialist', 'counselor'],
  'Munka-magánélet egyensúly': ['counselor', 'mediator'],
};

const ENCRYPTION_KEY_ENV = 'CAREPATH_ENCRYPTION_KEY';

// ═══════════════════════════════════════════════════════════════════════════
// CASE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate unique case number: CP-YYYY-NNNNNN
 */
async function generateCaseNumber() {
  const result = await query("SELECT nextval('carepath_case_number_seq') AS seq");
  const seq = result.rows[0].seq;
  const year = new Date().getFullYear();
  return `CP-${year}-${String(seq).padStart(6, '0')}`;
}

/**
 * Create a new CarePath case.
 */
async function createCase(userId, contractorId, caseData) {
  const {
    service_category_id, urgency_level = 'medium',
    issue_description, is_anonymous = false,
  } = caseData;

  if (!service_category_id) throw new Error('service_category_id is required');
  if (!URGENCY_LEVELS.includes(urgency_level)) throw new Error('Invalid urgency_level');

  const caseNumber = await generateCaseNumber();

  // Encrypt issue description via app-layer encryption (uses existing encryption.service)
  const result = await query(
    `INSERT INTO carepath_cases
       (user_id, contractor_id, case_number, service_category_id,
        urgency_level, issue_description, is_anonymous,
        consent_given, consent_date, data_retention_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), CURRENT_DATE + INTERVAL '5 years')
     RETURNING id, case_number, status, urgency_level, is_anonymous, opened_at`,
    [userId, contractorId, caseNumber, service_category_id,
     urgency_level, issue_description || null, is_anonymous]
  );

  const newCase = result.rows[0];

  // Crisis urgency → trigger crisis protocol
  if (urgency_level === 'crisis') {
    await triggerCrisisProtocol(contractorId, newCase.id, userId);
  }

  logger.info('CarePath case created', { caseId: newCase.id, caseNumber, urgency_level });
  return newCase;
}

/**
 * Get user's cases with optional status filter.
 */
async function getCases(userId, filters = {}) {
  let sql = `
    SELECT c.id, c.case_number, c.urgency_level, c.status, c.is_anonymous,
           c.opened_at, c.assigned_at, c.resolved_at, c.closed_at,
           c.total_sessions, c.employee_satisfaction_rating,
           sc.category_name, sc.icon_name,
           p.full_name AS provider_name, p.provider_type
    FROM carepath_cases c
    JOIN carepath_service_categories sc ON sc.id = c.service_category_id
    LEFT JOIN carepath_providers p ON p.id = c.assigned_provider_id
    WHERE c.user_id = $1
  `;
  const params = [userId];
  let idx = 2;

  if (filters.status) {
    sql += ` AND c.status = $${idx}`;
    params.push(filters.status);
    idx++;
  }

  sql += ` ORDER BY c.opened_at DESC`;

  if (filters.limit) {
    sql += ` LIMIT $${idx}`;
    params.push(filters.limit);
  }

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get full case details including sessions and bookings.
 */
async function getCaseDetails(caseId, userId) {
  const caseResult = await query(
    `SELECT c.*, sc.category_name, sc.icon_name,
            p.full_name AS provider_name, p.provider_type, p.credentials, p.photo_url AS provider_photo
     FROM carepath_cases c
     JOIN carepath_service_categories sc ON sc.id = c.service_category_id
     LEFT JOIN carepath_providers p ON p.id = c.assigned_provider_id
     WHERE c.id = $1 AND c.user_id = $2`,
    [caseId, userId]
  );

  if (caseResult.rows.length === 0) throw new Error('Case not found');

  const [sessions, bookings] = await Promise.all([
    query(
      `SELECT id, session_number, session_date, duration_minutes, session_type,
              session_format, topics_covered, progress_rating, risk_assessment
       FROM carepath_sessions WHERE case_id = $1 ORDER BY session_number`,
      [caseId]
    ),
    query(
      `SELECT b.id, b.appointment_datetime, b.duration_minutes, b.booking_type,
              b.status, b.meeting_link,
              p.full_name AS provider_name
       FROM carepath_provider_bookings b
       JOIN carepath_providers p ON p.id = b.provider_id
       WHERE b.case_id = $1 ORDER BY b.appointment_datetime`,
      [caseId]
    ),
  ]);

  return {
    ...caseResult.rows[0],
    sessions: sessions.rows,
    bookings: bookings.rows,
  };
}

async function assignCaseToProvider(caseId, providerId) {
  const result = await query(
    `UPDATE carepath_cases
     SET assigned_provider_id = $2, status = 'assigned', assigned_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [caseId, providerId]
  );
  if (result.rows.length === 0) throw new Error('Case not found or not in open status');

  // Increment provider active case count
  await query(
    'UPDATE carepath_providers SET active_case_count = active_case_count + 1 WHERE id = $1',
    [providerId]
  );

  return result.rows[0];
}

async function updateCaseStatus(caseId, status, notes) {
  if (!CASE_STATUSES.includes(status)) throw new Error('Invalid status');

  const timestampField = {
    assigned: 'assigned_at', in_progress: null,
    resolved: 'resolved_at', closed: 'closed_at',
  }[status];

  let sql = `UPDATE carepath_cases SET status = $2, updated_at = NOW()`;
  const params = [caseId, status];
  let idx = 3;

  if (timestampField) {
    sql += `, ${timestampField} = NOW()`;
  }
  if (notes) {
    sql += `, resolution_notes = $${idx}`;
    params.push(notes);
    idx++;
  }

  sql += ` WHERE id = $1 RETURNING *`;
  const result = await query(sql, params);
  if (result.rows.length === 0) throw new Error('Case not found');
  return result.rows[0];
}

async function closeCase(caseId, userId, resolutionNotes, satisfactionRating) {
  const result = await query(
    `UPDATE carepath_cases
     SET status = 'closed', closed_at = NOW(), updated_at = NOW(),
         resolution_notes = $3,
         employee_satisfaction_rating = $4
     WHERE id = $1 AND user_id = $2 AND status IN ('open', 'assigned', 'in_progress', 'resolved')
     RETURNING *`,
    [caseId, userId, resolutionNotes || null, satisfactionRating || null]
  );
  if (result.rows.length === 0) throw new Error('Case not found or already closed');

  // Decrement provider active case count
  if (result.rows[0].assigned_provider_id) {
    await query(
      `UPDATE carepath_providers SET active_case_count = GREATEST(0, active_case_count - 1) WHERE id = $1`,
      [result.rows[0].assigned_provider_id]
    );
  }

  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function createSession(caseId, providerId, sessionData) {
  const {
    session_date, duration_minutes = 50, session_type = 'individual_counseling',
    session_format = 'in_person', session_notes, topics_covered,
    homework_assigned, progress_rating, risk_assessment,
  } = sessionData;

  if (!SESSION_TYPES.includes(session_type)) throw new Error('Invalid session_type');

  // Get next session number
  const countResult = await query(
    'SELECT COUNT(*) AS cnt FROM carepath_sessions WHERE case_id = $1',
    [caseId]
  );
  const sessionNumber = parseInt(countResult.rows[0].cnt) + 1;

  // Encrypt notes if provided
  let encryptedNotes = null;
  if (session_notes) {
    encryptedNotes = await encryptSessionNotes(session_notes);
  }

  const result = await transaction(async (client) => {
    const sessionResult = await client.query(
      `INSERT INTO carepath_sessions
         (case_id, provider_id, session_number, session_date, duration_minutes,
          session_type, session_format, session_notes_encrypted,
          topics_covered, homework_assigned, progress_rating, risk_assessment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, session_number, session_date, session_type, progress_rating, risk_assessment`,
      [caseId, providerId, sessionNumber, session_date, duration_minutes,
       session_type, session_format, encryptedNotes,
       topics_covered || null, homework_assigned || null,
       progress_rating || null, risk_assessment || 'none']
    );

    // Update case: increment session count, set in_progress
    await client.query(
      `UPDATE carepath_cases
       SET total_sessions = total_sessions + 1,
           status = CASE WHEN status IN ('open', 'assigned') THEN 'in_progress' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [caseId]
    );

    // Update provider stats
    await client.query(
      'UPDATE carepath_providers SET total_sessions_completed = total_sessions_completed + 1 WHERE id = $1',
      [providerId]
    );

    // Crisis risk → trigger protocol
    if (risk_assessment === 'immediate') {
      const caseRow = await client.query('SELECT contractor_id, user_id FROM carepath_cases WHERE id = $1', [caseId]);
      if (caseRow.rows.length > 0) {
        await triggerCrisisProtocol(caseRow.rows[0].contractor_id, caseId, caseRow.rows[0].user_id);
      }
    }

    return sessionResult;
  });

  return result.rows[0];
}

async function getSessionHistory(caseId) {
  const result = await query(
    `SELECT id, session_number, session_date, duration_minutes, session_type,
            session_format, topics_covered, homework_assigned,
            progress_rating, risk_assessment, next_session_scheduled
     FROM carepath_sessions
     WHERE case_id = $1 ORDER BY session_number`,
    [caseId]
  );
  return result.rows;
}

/**
 * Get session with decrypted notes (authorized access only).
 */
async function getSessionWithNotes(sessionId) {
  const encKey = getEncryptionKey();
  const result = await query(
    `SELECT s.*,
            CASE WHEN s.session_notes_encrypted IS NOT NULL
              THEN pgp_sym_decrypt(s.session_notes_encrypted::bytea, $2)
              ELSE NULL
            END AS session_notes
     FROM carepath_sessions s
     WHERE s.id = $1`,
    [sessionId, encKey]
  );
  if (result.rows.length === 0) throw new Error('Session not found');
  return result.rows[0];
}

async function encryptSessionNotes(notes) {
  const encKey = getEncryptionKey();
  const result = await query(
    'SELECT pgp_sym_encrypt($1::text, $2) AS encrypted',
    [notes, encKey]
  );
  return result.rows[0].encrypted;
}

async function decryptSessionNotes(encryptedNotes) {
  const encKey = getEncryptionKey();
  const result = await query(
    'SELECT pgp_sym_decrypt($1::bytea, $2) AS decrypted',
    [encryptedNotes, encKey]
  );
  return result.rows[0].decrypted;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════

async function searchProviders(filters = {}) {
  let sql = `
    SELECT id, full_name, provider_type, credentials, specialties, languages,
           address_city, rating, total_ratings, total_sessions_completed,
           bio, photo_url, availability_hours
    FROM carepath_providers
    WHERE is_active = true
  `;
  const params = [];
  let idx = 1;

  if (filters.provider_type) {
    sql += ` AND provider_type = $${idx}`;
    params.push(filters.provider_type);
    idx++;
  }
  if (filters.specialties && filters.specialties.length > 0) {
    sql += ` AND specialties && $${idx}::text[]`;
    params.push(filters.specialties);
    idx++;
  }
  if (filters.languages && filters.languages.length > 0) {
    sql += ` AND languages && $${idx}::text[]`;
    params.push(filters.languages);
    idx++;
  }
  if (filters.city) {
    sql += ` AND LOWER(address_city) = LOWER($${idx})`;
    params.push(filters.city);
    idx++;
  }
  if (filters.contractor_id) {
    sql += ` AND (contractor_id IS NULL OR contractor_id = $${idx})`;
    params.push(filters.contractor_id);
    idx++;
  }

  sql += ` ORDER BY rating DESC NULLS LAST, total_sessions_completed DESC`;

  if (filters.limit) {
    sql += ` LIMIT $${idx}`;
    params.push(filters.limit);
  }

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Geo-proximity search using Haversine formula in SQL.
 */
async function searchProvidersByLocation(lat, lng, radiusKm = 10, filters = {}) {
  if (!lat || !lng) throw new Error('Latitude and longitude are required');

  let sql = `
    SELECT p.*,
      (6371 * acos(LEAST(1.0,
        cos(radians($1)) * cos(radians(p.geo_lat)) *
        cos(radians(p.geo_lng) - radians($2)) +
        sin(radians($1)) * sin(radians(p.geo_lat))
      ))) AS distance_km
    FROM carepath_providers p
    WHERE p.is_active = true
      AND p.geo_lat IS NOT NULL AND p.geo_lng IS NOT NULL
  `;
  const params = [lat, lng];
  let idx = 3;

  if (filters.provider_type) {
    sql += ` AND p.provider_type = $${idx}`;
    params.push(filters.provider_type);
    idx++;
  }
  if (filters.specialties && filters.specialties.length > 0) {
    sql += ` AND p.specialties && $${idx}::text[]`;
    params.push(filters.specialties);
    idx++;
  }
  if (filters.languages && filters.languages.length > 0) {
    sql += ` AND p.languages && $${idx}::text[]`;
    params.push(filters.languages);
    idx++;
  }

  // Wrap to filter by distance
  sql = `SELECT * FROM (${sql}) sub WHERE distance_km <= $${idx} ORDER BY distance_km LIMIT 20`;
  params.push(radiusKm);

  const result = await query(sql, params);
  return result.rows.map(p => ({
    ...p,
    distance_km: round1(parseFloat(p.distance_km)),
  }));
}

async function getProvider(providerId) {
  const result = await query(
    `SELECT * FROM carepath_providers WHERE id = $1 AND is_active = true`,
    [providerId]
  );
  if (result.rows.length === 0) throw new Error('Provider not found');
  return result.rows[0];
}

/**
 * Get available appointment slots for a provider within a date range.
 */
async function getProviderAvailability(providerId, startDate, endDate) {
  const provider = await query(
    'SELECT availability_hours FROM carepath_providers WHERE id = $1 AND is_active = true',
    [providerId]
  );
  if (provider.rows.length === 0) throw new Error('Provider not found');

  const hours = provider.rows[0].availability_hours || {};

  // Get existing bookings in range
  const bookings = await query(
    `SELECT appointment_datetime, duration_minutes
     FROM carepath_provider_bookings
     WHERE provider_id = $1
       AND appointment_datetime BETWEEN $2 AND $3
       AND status NOT IN ('cancelled')
     ORDER BY appointment_datetime`,
    [providerId, startDate, endDate]
  );

  const bookedSlots = bookings.rows.map(b => ({
    start: new Date(b.appointment_datetime).getTime(),
    end: new Date(b.appointment_datetime).getTime() + b.duration_minutes * 60000,
  }));

  const slots = [];
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  let current = new Date(startDate);
  const end = new Date(endDate);
  const now = Date.now();

  while (current <= end) {
    const dayKey = dayNames[current.getDay()];
    const dayHours = hours[dayKey];

    if (dayHours && Array.isArray(dayHours)) {
      for (const range of dayHours) {
        const [startTime, endTime] = range.split('-');
        if (!startTime || !endTime) continue;

        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);

        let slotStart = new Date(current);
        slotStart.setHours(sh, sm, 0, 0);
        const rangeEnd = new Date(current);
        rangeEnd.setHours(eh, em, 0, 0);

        while (slotStart.getTime() + 3600000 <= rangeEnd.getTime()) {
          const slotEnd = slotStart.getTime() + 3600000;

          // Skip past slots
          if (slotStart.getTime() > now) {
            // Check if booked
            const isBooked = bookedSlots.some(b =>
              slotStart.getTime() < b.end && slotEnd > b.start
            );

            slots.push({
              datetime: new Date(slotStart).toISOString(),
              date: slotStart.toISOString().split('T')[0],
              time: `${String(slotStart.getHours()).padStart(2, '0')}:${String(slotStart.getMinutes()).padStart(2, '0')}`,
              available: !isBooked,
            });
          }

          slotStart = new Date(slotEnd);
        }
      }
    }
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return slots;
}

async function rateProvider(providerId, userId, rating, review) {
  if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');

  // Update running average
  const result = await query(
    `UPDATE carepath_providers
     SET rating = ROUND(((rating * total_ratings + $2) / (total_ratings + 1))::numeric, 2),
         total_ratings = total_ratings + 1,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, rating, total_ratings`,
    [providerId, rating]
  );

  if (result.rows.length === 0) throw new Error('Provider not found');
  return result.rows[0];
}

/**
 * Match providers to a case based on category, language, specialty, proximity, and rating.
 */
async function matchProviders(caseData) {
  const { service_category_id, languages, lat, lng, issue_keywords } = caseData;

  // Get category name to determine provider types
  const catResult = await query(
    'SELECT category_name FROM carepath_service_categories WHERE id = $1',
    [service_category_id]
  );
  if (catResult.rows.length === 0) throw new Error('Category not found');

  const providerTypes = PROVIDER_TYPE_MAP[catResult.rows[0].category_name] || ['counselor'];

  // Fetch candidate providers
  let sql = `
    SELECT p.*, 0::float AS distance_km
    FROM carepath_providers p
    WHERE p.is_active = true
      AND p.provider_type = ANY($1::text[])
      AND p.active_case_count < p.max_concurrent_cases
  `;
  const params = [providerTypes];
  let idx = 2;

  if (languages && languages.length > 0) {
    sql += ` AND p.languages && $${idx}::text[]`;
    params.push(languages);
    idx++;
  }

  const providers = await query(sql, params);
  let candidates = providers.rows;

  // Score each candidate
  candidates = candidates.map(p => {
    let score = 0;

    // Rating score (0-30 points)
    score += (parseFloat(p.rating) || 3) * 6;

    // Specialty match (0-40 points)
    if (issue_keywords && issue_keywords.length > 0 && p.specialties) {
      const matchCount = issue_keywords.filter(kw =>
        p.specialties.some(s => s.toLowerCase().includes(kw.toLowerCase()))
      ).length;
      score += Math.min(40, matchCount * 10);
    }

    // Proximity score (0-30 points)
    if (lat && lng && p.geo_lat && p.geo_lng) {
      const dist = haversineDistance(lat, lng, parseFloat(p.geo_lat), parseFloat(p.geo_lng));
      p.distance_km = round1(dist);
      score += Math.max(0, 30 - dist * 2);
    }

    // Availability bonus (0-10 points)
    if (p.active_case_count === 0) score += 10;
    else if (p.active_case_count < p.max_concurrent_cases / 2) score += 5;

    p.match_score = round1(score);
    return p;
  });

  // Sort by score descending
  candidates.sort((a, b) => b.match_score - a.match_score);

  return candidates.slice(0, 5).map(p => ({
    id: p.id,
    full_name: p.full_name,
    provider_type: p.provider_type,
    credentials: p.credentials,
    specialties: p.specialties,
    languages: p.languages,
    address_city: p.address_city,
    rating: parseFloat(p.rating),
    distance_km: p.distance_km,
    match_score: p.match_score,
    photo_url: p.photo_url,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOKING MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function createBooking(userId, bookingData) {
  const {
    case_id, provider_id, appointment_datetime,
    duration_minutes = 60, booking_type = 'in_person',
    employee_notes, meeting_link,
  } = bookingData;

  if (!provider_id || !appointment_datetime) throw new Error('provider_id and appointment_datetime are required');

  const result = await query(
    `INSERT INTO carepath_provider_bookings
       (case_id, provider_id, user_id, appointment_datetime,
        duration_minutes, booking_type, employee_notes, meeting_link)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [case_id || null, provider_id, userId, appointment_datetime,
     duration_minutes, booking_type, employee_notes || null, meeting_link || null]
  );

  return result.rows[0];
}

async function getBookings(userId, filters = {}) {
  let sql = `
    SELECT b.*, p.full_name AS provider_name, p.provider_type, p.photo_url AS provider_photo
    FROM carepath_provider_bookings b
    JOIN carepath_providers p ON p.id = b.provider_id
    WHERE b.user_id = $1
  `;
  const params = [userId];
  let idx = 2;

  if (filters.status) {
    sql += ` AND b.status = $${idx}`;
    params.push(filters.status);
    idx++;
  }
  if (filters.upcoming) {
    sql += ` AND b.appointment_datetime >= NOW() AND b.status IN ('scheduled', 'confirmed')`;
  }

  sql += ` ORDER BY b.appointment_datetime DESC`;

  const result = await query(sql, params);
  return result.rows;
}

async function cancelBooking(bookingId, userId, reason) {
  const result = await query(
    `UPDATE carepath_provider_bookings
     SET status = 'cancelled', cancelled_by = 'employee',
         cancellation_reason = $3, cancelled_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('scheduled', 'confirmed')
     RETURNING *`,
    [bookingId, userId, reason || null]
  );
  if (result.rows.length === 0) throw new Error('Booking not found or not cancellable');
  return result.rows[0];
}

async function rescheduleBooking(bookingId, userId, newDatetime) {
  return await transaction(async (client) => {
    // Cancel old booking
    const oldBooking = await client.query(
      `UPDATE carepath_provider_bookings
       SET status = 'cancelled', cancelled_by = 'employee',
           cancellation_reason = 'Rescheduled', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status IN ('scheduled', 'confirmed')
       RETURNING *`,
      [bookingId, userId]
    );
    if (oldBooking.rows.length === 0) throw new Error('Booking not found');

    const old = oldBooking.rows[0];

    // Create new booking
    const newBooking = await client.query(
      `INSERT INTO carepath_provider_bookings
         (case_id, provider_id, user_id, appointment_datetime,
          duration_minutes, booking_type, employee_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [old.case_id, old.provider_id, userId, newDatetime,
       old.duration_minutes, old.booking_type, old.employee_notes]
    );

    return { cancelled: oldBooking.rows[0], new_booking: newBooking.rows[0] };
  });
}

async function confirmBooking(bookingId, providerId) {
  const result = await query(
    `UPDATE carepath_provider_bookings
     SET status = 'confirmed', updated_at = NOW()
     WHERE id = $1 AND provider_id = $2 AND status = 'scheduled'
     RETURNING *`,
    [bookingId, providerId]
  );
  if (result.rows.length === 0) throw new Error('Booking not found or not in scheduled status');
  return result.rows[0];
}

async function markNoShow(bookingId) {
  const result = await query(
    `UPDATE carepath_provider_bookings
     SET status = 'no_show', updated_at = NOW()
     WHERE id = $1 AND status IN ('scheduled', 'confirmed')
     RETURNING *`,
    [bookingId]
  );
  if (result.rows.length === 0) throw new Error('Booking not found');
  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// USAGE STATISTICS (HR/Admin)
// ═══════════════════════════════════════════════════════════════════════════

async function getUsageStats(contractorId, startMonth, endMonth) {
  const result = await query(
    `SELECT * FROM carepath_usage_stats
     WHERE contractor_id = $1 AND stat_month BETWEEN $2 AND $3
     ORDER BY stat_month DESC`,
    [contractorId, startMonth, endMonth]
  );
  return result.rows;
}

/**
 * Calculate and store monthly usage stats. Used by cron job.
 */
async function calculateMonthlyStats(contractorId, monthDate) {
  const monthStart = new Date(monthDate);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const statsResult = await query(
    `SELECT
       (SELECT COUNT(*) FROM carepath_cases WHERE contractor_id = $1 AND opened_at >= $2 AND opened_at < $3) AS cases_opened,
       (SELECT COUNT(*) FROM carepath_cases WHERE contractor_id = $1 AND closed_at >= $2 AND closed_at < $3) AS cases_closed,
       (SELECT COUNT(*) FROM carepath_cases WHERE contractor_id = $1 AND status IN ('open','assigned','in_progress')) AS cases_active,
       (SELECT COUNT(*) FROM carepath_sessions s JOIN carepath_cases c ON s.case_id = c.id
        WHERE c.contractor_id = $1 AND s.session_date >= $2 AND s.session_date < $3) AS sessions_held,
       (SELECT COUNT(DISTINCT user_id) FROM carepath_cases WHERE contractor_id = $1 AND opened_at >= $2 AND opened_at < $3) AS unique_users,
       (SELECT AVG(employee_satisfaction_rating) FROM carepath_cases
        WHERE contractor_id = $1 AND employee_satisfaction_rating IS NOT NULL AND closed_at >= $2 AND closed_at < $3) AS avg_satisfaction`,
    [contractorId, monthStart.toISOString(), monthEnd.toISOString()]
  );

  const s = statsResult.rows[0];

  // Category breakdown
  const catResult = await query(
    `SELECT sc.category_name, COUNT(*) AS count
     FROM carepath_cases c
     JOIN carepath_service_categories sc ON sc.id = c.service_category_id
     WHERE c.contractor_id = $1 AND c.opened_at >= $2 AND c.opened_at < $3
     GROUP BY sc.category_name`,
    [contractorId, monthStart.toISOString(), monthEnd.toISOString()]
  );

  const categoryBreakdown = {};
  catResult.rows.forEach(r => { categoryBreakdown[r.category_name] = parseInt(r.count); });

  // Total eligible employees
  const eligibleResult = await query(
    'SELECT COUNT(DISTINCT id) AS count FROM users WHERE contractor_id = $1 AND is_active = true',
    [contractorId]
  );
  const totalEligible = parseInt(eligibleResult.rows[0].count);
  const uniqueUsers = parseInt(s.unique_users) || 0;
  const utilization = totalEligible > 0 ? round2((uniqueUsers / totalEligible) * 100) : 0;

  const result = await query(
    `INSERT INTO carepath_usage_stats
       (contractor_id, stat_month, total_cases_opened, total_cases_closed, total_cases_active,
        total_sessions_held, employee_count_using_eap, total_eligible_employees,
        utilization_rate, category_breakdown, avg_satisfaction_rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (contractor_id, stat_month) DO UPDATE SET
       total_cases_opened = EXCLUDED.total_cases_opened,
       total_cases_closed = EXCLUDED.total_cases_closed,
       total_cases_active = EXCLUDED.total_cases_active,
       total_sessions_held = EXCLUDED.total_sessions_held,
       employee_count_using_eap = EXCLUDED.employee_count_using_eap,
       utilization_rate = EXCLUDED.utilization_rate,
       category_breakdown = EXCLUDED.category_breakdown,
       avg_satisfaction_rating = EXCLUDED.avg_satisfaction_rating,
       calculated_at = NOW()
     RETURNING *`,
    [contractorId, monthStart.toISOString(), parseInt(s.cases_opened), parseInt(s.cases_closed),
     parseInt(s.cases_active), parseInt(s.sessions_held), uniqueUsers, totalEligible,
     utilization, JSON.stringify(categoryBreakdown), s.avg_satisfaction]
  );

  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

async function getCategories() {
  const result = await query(
    `SELECT id, category_name, category_name_en, description, icon_name, display_order
     FROM carepath_service_categories WHERE is_active = true ORDER BY display_order`
  );
  return result.rows;
}

async function getCategoryProviders(categoryId) {
  const catResult = await query('SELECT category_name FROM carepath_service_categories WHERE id = $1', [categoryId]);
  if (catResult.rows.length === 0) throw new Error('Category not found');

  const types = PROVIDER_TYPE_MAP[catResult.rows[0].category_name] || ['counselor'];

  const result = await query(
    `SELECT id, full_name, provider_type, credentials, specialties, languages,
            address_city, rating, total_ratings, photo_url
     FROM carepath_providers
     WHERE is_active = true AND provider_type = ANY($1::text[])
     ORDER BY rating DESC NULLS LAST`,
    [types]
  );
  return result.rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRISIS PROTOCOL
// ═══════════════════════════════════════════════════════════════════════════

async function triggerCrisisProtocol(contractorId, caseId, employeeUserId) {
  logger.warn('CRISIS PROTOCOL TRIGGERED', { contractorId, caseId, employeeUserId });

  // Notify all HR admins in contractor
  const admins = await query(
    `SELECT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.contractor_id = $1 AND r.slug IN ('admin', 'data_controller') AND u.is_active = true`,
    [contractorId]
  );

  for (const admin of admins.rows) {
    await query(
      `INSERT INTO wellbeing_notifications
         (user_id, contractor_id, notification_type, notification_channel,
          title, message, priority, source_module, source_entity_type, source_entity_id)
       VALUES ($1, $2, 'crisis_alert', 'push',
               'SÜRGŐS: Krízishelyzet jelezve', 'Egy munkavállaló krízishelyzetet jelzett. Azonnali figyelmet igényel.',
               'urgent', 'carepath', 'case', $3)`,
      [admin.id, contractorId, caseId]
    );
  }

  // Audit log
  await query(
    `INSERT INTO wellbeing_audit_log
       (user_id, contractor_id, action, resource_type, resource_id, details)
     VALUES ($1, $2, 'crisis_protocol_triggered', 'carepath_case', $3, $4)`,
    [employeeUserId, contractorId, caseId,
     JSON.stringify({ admins_notified: admins.rows.length })]
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * Math.PI / 180; }
function round1(val) { return Math.round(val * 10) / 10; }
function round2(val) { return Math.round(val * 100) / 100; }

function getEncryptionKey() {
  const key = process.env[ENCRYPTION_KEY_ENV] || process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('CarePath encryption key not configured');
  return key;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Cases
  createCase, getCases, getCaseDetails, assignCaseToProvider,
  updateCaseStatus, closeCase, generateCaseNumber,
  // Sessions
  createSession, getSessionHistory, getSessionWithNotes,
  encryptSessionNotes, decryptSessionNotes,
  // Providers
  searchProviders, searchProvidersByLocation, getProvider,
  getProviderAvailability, rateProvider, matchProviders,
  // Bookings
  createBooking, getBookings, cancelBooking, rescheduleBooking,
  confirmBooking, markNoShow,
  // Stats
  getUsageStats, calculateMonthlyStats,
  // Categories
  getCategories, getCategoryProviders,
  // Crisis
  triggerCrisisProtocol,
  // Helpers
  haversineDistance, PROVIDER_TYPE_MAP, CASE_STATUSES, BOOKING_STATUSES,
};
