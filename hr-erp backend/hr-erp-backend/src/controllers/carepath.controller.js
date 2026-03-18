const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const carepathService = require('../services/carepath.service');
const integrationService = require('../services/wellbeingIntegration.service');
const gamificationService = require('../services/gamification.service');

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/carepath/categories */
const getCategories = async (req, res) => {
  try {
    const categories = await carepathService.getCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/carepath/cases */
const createCase = async (req, res) => {
  try {
    const { service_category_id, is_anonymous, urgency_level, issue_description } = req.body;

    if (!service_category_id) {
      return res.status(400).json({ success: false, message: 'service_category_id kötelező' });
    }

    const newCase = await carepathService.createCase(
      req.user.id, req.user.contractorId,
      { service_category_id, urgency_level, issue_description, is_anonymous }
    );

    // Match providers for the case
    let matchedProviders = [];
    try {
      matchedProviders = await carepathService.matchProviders({
        service_category_id,
        languages: ['hu'],
        issue_keywords: issue_description ? issue_description.split(/\s+/).slice(0, 5) : [],
      });
    } catch (e) {
      // Non-critical — case created even if matching fails
      logger.warn('Provider matching failed:', e.message);
    }

    await integrationService.logDataAccess(
      req.user.id, req.user.id, req.user.contractorId,
      'create_carepath_case', 'carepath_case', newCase.id, 'Case created'
    );

    res.status(201).json({
      success: true,
      data: { case: newCase, matched_providers: matchedProviders }
    });
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('Invalid')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error creating case:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/carepath/my-cases */
const getMyCases = async (req, res) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.limit) filters.limit = parseInt(req.query.limit);

    const cases = await carepathService.getCases(req.user.id, filters);

    const active = cases.filter(c => ['open', 'assigned', 'in_progress'].includes(c.status)).length;
    const closed = cases.filter(c => ['resolved', 'closed'].includes(c.status)).length;

    res.json({ success: true, data: { cases, active_count: active, closed_count: closed } });
  } catch (error) {
    logger.error('Error fetching cases:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/carepath/cases/:id */
const getCaseDetails = async (req, res) => {
  try {
    const caseData = await carepathService.getCaseDetails(req.params.id, req.user.id);

    await integrationService.logDataAccess(
      req.user.id, req.user.id, req.user.contractorId,
      'view_carepath_case', 'carepath_case', req.params.id, 'Case detail view'
    );

    res.json({ success: true, data: caseData });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Eset nem található' });
    }
    logger.error('Error fetching case details:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/carepath/cases/:id/close */
const closeCase = async (req, res) => {
  try {
    const { resolution_notes, employee_satisfaction_rating } = req.body;

    if (employee_satisfaction_rating && (employee_satisfaction_rating < 1 || employee_satisfaction_rating > 5)) {
      return res.status(400).json({ success: false, message: 'Értékelés 1-5 között legyen' });
    }

    const closedCase = await carepathService.closeCase(
      req.params.id, req.user.id, resolution_notes, employee_satisfaction_rating
    );

    // Schedule follow-up WellMind assessment in 30 days
    try {
      await integrationService.createNotification({
        user_id: req.user.id, contractor_id: req.user.contractorId,
        notification_type: 'wellmind_assessment_suggested',
        notification_channel: 'push',
        title: 'Követő értékelés',
        message: 'Hogyan érzed magad a CarePath támogatás óta? Töltsd ki a közérzeti felmérést.',
        action_url: '/wellmind/assessment',
        priority: 'normal',
        scheduled_for: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        source_module: 'carepath',
      });
    } catch (e) {
      logger.warn('Follow-up notification scheduling failed:', e.message);
    }

    // Award gamification points for case resolution
    gamificationService.awardPoints(
      req.user.id, req.user.contractorId, 'carepath_case_resolved', req.params.id
    ).catch(err => logger.error('Gamification error (carepath):', err));

    res.json({ success: true, data: { case: closedCase, followup_scheduled: true } });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('already closed')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    logger.error('Error closing case:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/carepath/providers/search */
const searchProviders = async (req, res) => {
  try {
    const { lat, lng, radius, provider_type, specialties, languages, city } = req.query;

    let providers;
    if (lat && lng) {
      providers = await carepathService.searchProvidersByLocation(
        parseFloat(lat), parseFloat(lng),
        parseInt(radius) || 10,
        {
          provider_type,
          specialties: specialties ? specialties.split(',') : undefined,
          languages: languages ? languages.split(',') : undefined,
        }
      );
    } else {
      providers = await carepathService.searchProviders({
        provider_type,
        specialties: specialties ? specialties.split(',') : undefined,
        languages: languages ? languages.split(',') : undefined,
        city,
        contractor_id: req.user.contractorId,
        limit: 20,
      });
    }

    res.json({ success: true, data: providers });
  } catch (error) {
    if (error.message.includes('Latitude')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error searching providers:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/carepath/providers/:id */
const getProvider = async (req, res) => {
  try {
    const provider = await carepathService.getProvider(req.params.id);
    res.json({ success: true, data: provider });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Szolgáltató nem található' });
    }
    logger.error('Error fetching provider:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/carepath/providers/:id/availability */
const getProviderAvailability = async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date().toISOString();
    const endDate = req.query.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const slots = await carepathService.getProviderAvailability(req.params.id, startDate, endDate);
    res.json({ success: true, data: slots });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Szolgáltató nem található' });
    }
    logger.error('Error fetching availability:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/carepath/bookings */
const createBooking = async (req, res) => {
  try {
    const { case_id, provider_id, appointment_datetime, duration_minutes, booking_type, employee_notes } = req.body;

    if (!provider_id || !appointment_datetime) {
      return res.status(400).json({ success: false, message: 'provider_id és appointment_datetime kötelező' });
    }

    const booking = await carepathService.createBooking(req.user.id, {
      case_id, provider_id, appointment_datetime,
      duration_minutes: duration_minutes || 60,
      booking_type: booking_type || 'in_person',
      employee_notes,
    });

    // Send confirmation notification
    try {
      await integrationService.createNotification({
        user_id: req.user.id, contractor_id: req.user.contractorId,
        notification_type: 'carepath_booking_confirmed',
        notification_channel: 'push',
        title: 'Foglalás megerősítve',
        message: `Időpontod: ${new Date(appointment_datetime).toLocaleString('hu-HU')}`,
        action_url: `/carepath/bookings/${booking.id}`,
        priority: 'high', source_module: 'carepath',
      });
    } catch (e) {
      logger.warn('Booking notification failed:', e.message);
    }

    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ez az időpont már foglalt' });
    }
    if (error.message.includes('required')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error creating booking:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/carepath/my-bookings */
const getMyBookings = async (req, res) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.upcoming === 'true') filters.upcoming = true;

    const bookings = await carepathService.getBookings(req.user.id, filters);

    const upcoming = bookings.filter(b =>
      ['scheduled', 'confirmed'].includes(b.status) && new Date(b.appointment_datetime) > new Date()
    ).length;

    res.json({ success: true, data: { bookings, upcoming_count: upcoming } });
  } catch (error) {
    logger.error('Error fetching bookings:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/carepath/bookings/:id/cancel */
const cancelBooking = async (req, res) => {
  try {
    const { cancellation_reason } = req.body;
    const booking = await carepathService.cancelBooking(req.params.id, req.user.id, cancellation_reason);
    res.json({ success: true, data: booking });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('not cancellable')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    logger.error('Error cancelling booking:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/carepath/bookings/:id/reschedule */
const rescheduleBooking = async (req, res) => {
  try {
    const { new_appointment_datetime } = req.body;
    if (!new_appointment_datetime) {
      return res.status(400).json({ success: false, message: 'new_appointment_datetime kötelező' });
    }

    const result = await carepathService.rescheduleBooking(req.params.id, req.user.id, new_appointment_datetime);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Az új időpont már foglalt' });
    }
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Foglalás nem található' });
    }
    logger.error('Error rescheduling booking:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/v1/carepath/provider/sessions */
const createSession = async (req, res) => {
  try {
    const { case_id, session_date, duration_minutes, session_type, session_notes,
            topics_covered, homework_assigned, progress_rating, risk_assessment } = req.body;

    if (!case_id || !session_date || !duration_minutes || !session_type) {
      return res.status(400).json({ success: false, message: 'Kötelező mezők hiányoznak' });
    }

    // Get provider ID from the user (provider's user account)
    const providerResult = await query(
      `SELECT id FROM carepath_providers WHERE email = (SELECT email FROM users WHERE id = $1) AND is_active = true`,
      [req.user.id]
    );

    let providerId;
    if (providerResult.rows.length > 0) {
      providerId = providerResult.rows[0].id;
    } else {
      // Fallback: check if any provider is assigned to this case
      const caseResult = await query(
        'SELECT assigned_provider_id FROM carepath_cases WHERE id = $1',
        [case_id]
      );
      providerId = caseResult.rows[0]?.assigned_provider_id;
      if (!providerId) {
        return res.status(403).json({ success: false, message: 'Nem vagy hozzárendelve ehhez az esethez' });
      }
    }

    const session = await carepathService.createSession(case_id, providerId, {
      session_date, duration_minutes, session_type,
      session_format: req.body.session_format || 'in_person',
      session_notes, topics_covered, homework_assigned,
      progress_rating, risk_assessment,
    });

    await integrationService.logDataAccess(
      req.user.id, null, req.user.contractorId,
      'create_carepath_session', 'carepath_session', session.id,
      'Provider recorded session'
    );

    res.status(201).json({ success: true, data: { ...session, session_notes_encrypted: !!session_notes } });
  } catch (error) {
    if (error.message.includes('Invalid session_type')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error creating session:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/carepath/provider/cases */
const getProviderCases = async (req, res) => {
  try {
    // Find provider record for this user
    const providerResult = await query(
      `SELECT id FROM carepath_providers WHERE email = (SELECT email FROM users WHERE id = $1)`,
      [req.user.id]
    );

    if (providerResult.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Szolgáltatói profil nem található' });
    }

    const providerId = providerResult.rows[0].id;
    const status = req.query.status;

    let sql = `
      SELECT c.id, c.case_number, c.urgency_level, c.status, c.is_anonymous,
             c.opened_at, c.total_sessions,
             sc.category_name, sc.icon_name
      FROM carepath_cases c
      JOIN carepath_service_categories sc ON sc.id = c.service_category_id
      WHERE c.assigned_provider_id = $1
    `;
    const params = [providerId];

    if (status) {
      sql += ` AND c.status = $2`;
      params.push(status);
    } else {
      sql += ` AND c.status IN ('assigned', 'in_progress')`;
    }

    sql += ` ORDER BY c.opened_at DESC`;

    const result = await query(sql, params);

    // Strip user identity for anonymous cases
    const cases = result.rows.map(c => {
      if (c.is_anonymous) {
        return { ...c, user_id: null, user_name: 'Anonim' };
      }
      return c;
    });

    res.json({ success: true, data: cases });
  } catch (error) {
    logger.error('Error fetching provider cases:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/v1/carepath/admin/usage-stats */
const getUsageStats = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const startMonth = req.query.startMonth || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endMonth = req.query.endMonth || new Date().toISOString().split('T')[0];

    const stats = await carepathService.getUsageStats(contractorId, startMonth, endMonth);

    await integrationService.logDataAccess(
      req.user.id, null, req.user.contractorId,
      'view_carepath_stats', 'carepath_usage_stats', null, 'Admin stats view'
    );

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Error fetching usage stats:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** GET /api/v1/carepath/admin/providers */
const getAdminProviders = async (req, res) => {
  try {
    const filters = {};
    if (req.query.provider_type) filters.provider_type = req.query.provider_type;
    if (req.query.city) filters.city = req.query.city;
    if (req.query.contractor_id) filters.contractor_id = req.query.contractor_id;

    // Admin sees all providers including inactive
    const result = await query(
      `SELECT * FROM carepath_providers
       WHERE (contractor_id IS NULL OR contractor_id = $1)
       ORDER BY is_active DESC, full_name`,
      [req.query.contractor_id || req.user.contractorId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching admin providers:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** POST /api/v1/carepath/admin/providers */
const createProvider = async (req, res) => {
  try {
    const {
      provider_type, full_name, credentials, specialties, languages,
      phone, email, address_street, address_city, address_zip,
      geo_location, availability_hours, bio, photo_url,
    } = req.body;

    if (!provider_type || !full_name || !email) {
      return res.status(400).json({ success: false, message: 'provider_type, full_name, email kötelező' });
    }

    const result = await query(
      `INSERT INTO carepath_providers
         (contractor_id, provider_type, full_name, credentials, specialties, languages,
          phone, email, address_street, address_city, address_zip,
          geo_lat, geo_lng, availability_hours, bio, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        req.user.contractorId, provider_type, full_name, credentials || null,
        specialties || [], languages || ['hu'],
        phone || null, email, address_street || null, address_city || null, address_zip || null,
        geo_location?.lat || null, geo_location?.lng || null,
        availability_hours ? JSON.stringify(availability_hours) : null,
        bio || null, photo_url || null,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating provider:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

/** PUT /api/v1/carepath/admin/providers/:id */
const updateProvider = async (req, res) => {
  try {
    const allowedFields = [
      'full_name', 'credentials', 'specialties', 'languages', 'phone', 'email',
      'address_street', 'address_city', 'address_zip', 'availability_hours',
      'bio', 'photo_url', 'is_active', 'provider_type', 'max_concurrent_cases',
    ];

    const updates = [];
    const params = [req.params.id];
    let idx = 2;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const value = field === 'availability_hours' ? JSON.stringify(req.body[field]) : req.body[field];
        updates.push(`${field} = $${idx}`);
        params.push(value);
        idx++;
      }
    }

    // Handle geo_location separately
    if (req.body.geo_location) {
      updates.push(`geo_lat = $${idx}`, `geo_lng = $${idx + 1}`);
      params.push(req.body.geo_location.lat, req.body.geo_location.lng);
      idx += 2;
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs frissítendő mező' });
    }

    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE carepath_providers SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Szolgáltató nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating provider:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

module.exports = {
  getCategories,
  createCase, getMyCases, getCaseDetails, closeCase,
  searchProviders, getProvider, getProviderAvailability,
  createBooking, getMyBookings, cancelBooking, rescheduleBooking,
  createSession, getProviderCases,
  getUsageStats, getAdminProviders, createProvider, updateProvider,
};
