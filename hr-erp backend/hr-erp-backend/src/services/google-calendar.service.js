const { google } = require('googleapis');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// OAuth2 Client Factory
// ============================================================

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ============================================================
// Auth URL Generation
// ============================================================

function getAuthUrl(userId, source) {
  const client = createOAuth2Client();
  const stateObj = { userId };
  if (source) stateObj.source = source;
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  });
}

// ============================================================
// OAuth Callback Handler
// ============================================================

async function handleCallback(code, state) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Decode state to get userId
  const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());

  // Get Google email
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const userInfo = await oauth2.userinfo.get();
  const googleEmail = userInfo.data.email;

  // Upsert tokens
  await query(
    `INSERT INTO google_calendar_tokens (user_id, access_token, refresh_token, token_expiry, google_email)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expiry = EXCLUDED.token_expiry,
       google_email = EXCLUDED.google_email,
       sync_enabled = TRUE,
       updated_at = NOW()`,
    [
      userId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      googleEmail,
    ]
  );

  // Setup webhook (non-blocking)
  setupWebhookWatch(userId).catch(err =>
    logger.warn('Google webhook beállítási hiba (nem kritikus):', err.message)
  );

  return { userId, googleEmail };
}

// ============================================================
// Authenticated Client (auto-refresh)
// ============================================================

async function getAuthenticatedClient(userId) {
  const result = await query(
    'SELECT * FROM google_calendar_tokens WHERE user_id = $1 AND sync_enabled = TRUE',
    [userId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const client = createOAuth2Client();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : null,
  });

  // Auto-persist refreshed tokens
  client.on('tokens', async (newTokens) => {
    try {
      await query(
        `UPDATE google_calendar_tokens SET
           access_token = COALESCE($1, access_token),
           refresh_token = COALESCE($2, refresh_token),
           token_expiry = COALESCE($3, token_expiry),
           updated_at = NOW()
         WHERE user_id = $4`,
        [
          newTokens.access_token,
          newTokens.refresh_token,
          newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
          userId,
        ]
      );
    } catch (err) {
      logger.error('Google token frissítés mentési hiba:', err.message);
    }
  });

  return { client, calendarId: row.calendar_id || 'primary' };
}

// ============================================================
// Connection Status
// ============================================================

async function getConnectionStatus(userId) {
  const result = await query(
    'SELECT google_email, last_sync_at, sync_enabled, calendar_id FROM google_calendar_tokens WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return { connected: false };
  }

  const row = result.rows[0];
  return {
    connected: true,
    googleEmail: row.google_email,
    lastSync: row.last_sync_at,
    syncEnabled: row.sync_enabled,
    calendarId: row.calendar_id,
  };
}

// ============================================================
// Disconnect
// ============================================================

async function disconnect(userId) {
  const authData = await getAuthenticatedClient(userId);
  if (authData) {
    try {
      await authData.client.revokeToken(authData.client.credentials.access_token);
    } catch (err) {
      logger.warn('Google token visszavonási hiba (nem kritikus):', err.message);
    }
  }

  await query('DELETE FROM google_calendar_sync_map WHERE user_id = $1', [userId]);
  await query('DELETE FROM google_calendar_tokens WHERE user_id = $1', [userId]);
}

// ============================================================
// Helper: get user_id for an employee_id
// ============================================================

async function getUserIdForEmployee(employeeId) {
  const result = await query('SELECT user_id FROM employees WHERE id = $1', [employeeId]);
  return result.rows.length > 0 ? result.rows[0].user_id : null;
}

// ============================================================
// Convert local event → Google Calendar event
// ============================================================

function localEventToGoogleEvent(event, type) {
  let summary, description, startDateTime, endDateTime, allDay;

  switch (type) {
    case 'shift': {
      summary = `[HR-ERP] Műszak: ${event.shift_type}`;
      description = [event.location, event.notes].filter(Boolean).join('\n');
      const dateStr = typeof event.shift_date === 'string'
        ? event.shift_date.split('T')[0]
        : new Date(event.shift_date).toISOString().split('T')[0];
      startDateTime = `${dateStr}T${event.shift_start_time}`;
      endDateTime = `${dateStr}T${event.shift_end_time}`;
      allDay = false;
      break;
    }
    case 'medical_appointment': {
      summary = `[HR-ERP] Orvosi: ${event.appointment_type}`;
      description = [event.doctor_name, event.clinic_location, event.notes].filter(Boolean).join('\n');
      const dateStr = typeof event.appointment_date === 'string'
        ? event.appointment_date.split('T')[0]
        : new Date(event.appointment_date).toISOString().split('T')[0];
      if (event.appointment_time) {
        startDateTime = `${dateStr}T${event.appointment_time}`;
        // Default 1 hour appointment
        const [h, m] = event.appointment_time.split(':').map(Number);
        const endH = String(h + 1).padStart(2, '0');
        endDateTime = `${dateStr}T${endH}:${String(m).padStart(2, '0')}:00`;
      } else {
        allDay = true;
        startDateTime = dateStr;
        endDateTime = dateStr;
      }
      break;
    }
    case 'personal_event': {
      summary = `[HR-ERP] ${event.title}`;
      description = event.description || '';
      const dateStr = typeof event.event_date === 'string'
        ? event.event_date.split('T')[0]
        : new Date(event.event_date).toISOString().split('T')[0];
      if (event.all_day || !event.event_time) {
        allDay = true;
        startDateTime = dateStr;
        endDateTime = dateStr;
      } else {
        startDateTime = `${dateStr}T${event.event_time}`;
        const [h, m] = event.event_time.split(':').map(Number);
        const endH = String(h + 1).padStart(2, '0');
        endDateTime = `${dateStr}T${endH}:${String(m).padStart(2, '0')}:00`;
      }
      break;
    }
    default:
      return null;
  }

  const googleEvent = {
    summary,
    description,
    extendedProperties: {
      private: { hrerpEventId: event.id, hrerpEventType: type },
    },
  };

  if (allDay) {
    googleEvent.start = { date: startDateTime };
    // Google all-day events: end date is exclusive, so add 1 day
    const endDate = new Date(endDateTime + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1);
    googleEvent.end = { date: endDate.toISOString().split('T')[0] };
  } else {
    googleEvent.start = { dateTime: startDateTime, timeZone: 'Europe/Budapest' };
    googleEvent.end = { dateTime: endDateTime, timeZone: 'Europe/Budapest' };
  }

  return googleEvent;
}

// ============================================================
// Sync: Push local event → Google
// ============================================================

async function syncLocalEventToGoogle(userId, event, type) {
  const authData = await getAuthenticatedClient(userId);
  if (!authData) return;

  const calendar = google.calendar({ version: 'v3', auth: authData.client });
  const googleEvent = localEventToGoogleEvent(event, type);
  if (!googleEvent) return;

  try {
    const created = await calendar.events.insert({
      calendarId: authData.calendarId,
      requestBody: googleEvent,
    });

    await query(
      `INSERT INTO google_calendar_sync_map
        (user_id, local_event_id, local_event_type, google_event_id, google_calendar_id, sync_direction, last_synced_at, local_updated_at)
       VALUES ($1, $2, $3, $4, $5, 'outbound', NOW(), NOW())
       ON CONFLICT (user_id, local_event_id, local_event_type) WHERE local_event_id IS NOT NULL
       DO UPDATE SET google_event_id = EXCLUDED.google_event_id, last_synced_at = NOW(), local_updated_at = NOW()`,
      [userId, event.id, type, created.data.id, authData.calendarId]
    );

    logger.info(`Google Calendar szinkron: ${type} ${event.id} → ${created.data.id}`);
  } catch (err) {
    handleSyncError(err, userId, 'syncLocalEventToGoogle');
  }
}

// ============================================================
// Sync: Update local event → Google
// ============================================================

async function syncLocalEventUpdateToGoogle(userId, event, type) {
  const authData = await getAuthenticatedClient(userId);
  if (!authData) return;

  // Find mapping
  const mapResult = await query(
    `SELECT google_event_id FROM google_calendar_sync_map
     WHERE user_id = $1 AND local_event_id = $2 AND local_event_type = $3`,
    [userId, event.id, type]
  );

  if (mapResult.rows.length === 0) {
    // Not synced yet — create instead
    return syncLocalEventToGoogle(userId, event, type);
  }

  const googleEventId = mapResult.rows[0].google_event_id;
  const calendar = google.calendar({ version: 'v3', auth: authData.client });
  const googleEvent = localEventToGoogleEvent(event, type);
  if (!googleEvent) return;

  try {
    await calendar.events.update({
      calendarId: authData.calendarId,
      eventId: googleEventId,
      requestBody: googleEvent,
    });

    await query(
      `UPDATE google_calendar_sync_map SET last_synced_at = NOW(), local_updated_at = NOW()
       WHERE user_id = $1 AND local_event_id = $2 AND local_event_type = $3`,
      [userId, event.id, type]
    );

    logger.info(`Google Calendar frissítés: ${type} ${event.id} → ${googleEventId}`);
  } catch (err) {
    if (err.code === 404 || err.code === 410) {
      // Event deleted on Google side — remove mapping and re-create
      await query(
        'DELETE FROM google_calendar_sync_map WHERE user_id = $1 AND local_event_id = $2 AND local_event_type = $3',
        [userId, event.id, type]
      );
      return syncLocalEventToGoogle(userId, event, type);
    }
    handleSyncError(err, userId, 'syncLocalEventUpdateToGoogle');
  }
}

// ============================================================
// Sync: Delete local event → remove from Google
// ============================================================

async function syncLocalEventDeleteFromGoogle(userId, eventId, type) {
  const authData = await getAuthenticatedClient(userId);
  if (!authData) return;

  const mapResult = await query(
    `SELECT google_event_id FROM google_calendar_sync_map
     WHERE user_id = $1 AND local_event_id = $2 AND local_event_type = $3`,
    [userId, eventId, type]
  );

  if (mapResult.rows.length === 0) return;

  const googleEventId = mapResult.rows[0].google_event_id;
  const calendar = google.calendar({ version: 'v3', auth: authData.client });

  try {
    await calendar.events.delete({
      calendarId: authData.calendarId,
      eventId: googleEventId,
    });
    logger.info(`Google Calendar törlés: ${type} ${eventId} → ${googleEventId}`);
  } catch (err) {
    if (err.code !== 404 && err.code !== 410) {
      handleSyncError(err, userId, 'syncLocalEventDeleteFromGoogle');
    }
  }

  // Always clean up mapping
  await query(
    'DELETE FROM google_calendar_sync_map WHERE user_id = $1 AND local_event_id = $2 AND local_event_type = $3',
    [userId, eventId, type]
  );
}

// ============================================================
// Full Sync (push all local + pull from Google)
// ============================================================

async function triggerFullSync(userId) {
  const authData = await getAuthenticatedClient(userId);
  if (!authData) {
    throw new Error('Google Calendar nincs csatlakoztatva');
  }

  // Get employee_id for this user
  const empResult = await query('SELECT id FROM employees WHERE user_id = $1 LIMIT 1', [userId]);
  const employeeId = empResult.rows.length > 0 ? empResult.rows[0].id : null;

  // 1. Push unsynced local events
  await pushUnsyncedEvents(userId, employeeId, authData);

  // 2. Pull Google events
  if (employeeId) {
    await pullGoogleEvents(userId, employeeId, authData);
  }

  // Update last_sync_at
  await query(
    'UPDATE google_calendar_tokens SET last_sync_at = NOW() WHERE user_id = $1',
    [userId]
  );
}

// ============================================================
// Push unsynced local events
// ============================================================

async function pushUnsyncedEvents(userId, employeeId, authData) {
  if (!employeeId) return;

  const calendar = google.calendar({ version: 'v3', auth: authData.client });

  // Shifts
  const shifts = await query(
    `SELECT s.* FROM shifts s
     LEFT JOIN google_calendar_sync_map m ON m.local_event_id = s.id AND m.local_event_type = 'shift' AND m.user_id = $1
     WHERE s.employee_id = $2 AND m.id IS NULL AND s.shift_date >= CURRENT_DATE`,
    [userId, employeeId]
  );
  for (const shift of shifts.rows) {
    await syncSingleEvent(userId, shift, 'shift', calendar, authData.calendarId);
  }

  // Medical appointments
  const appointments = await query(
    `SELECT ma.* FROM medical_appointments ma
     LEFT JOIN google_calendar_sync_map m ON m.local_event_id = ma.id AND m.local_event_type = 'medical_appointment' AND m.user_id = $1
     WHERE ma.employee_id = $2 AND m.id IS NULL AND ma.appointment_date >= CURRENT_DATE`,
    [userId, employeeId]
  );
  for (const appt of appointments.rows) {
    await syncSingleEvent(userId, appt, 'medical_appointment', calendar, authData.calendarId);
  }

  // Personal events
  const events = await query(
    `SELECT pe.* FROM personal_events pe
     LEFT JOIN google_calendar_sync_map m ON m.local_event_id = pe.id AND m.local_event_type = 'personal_event' AND m.user_id = $1
     WHERE pe.employee_id = $2 AND m.id IS NULL AND pe.event_date >= CURRENT_DATE`,
    [userId, employeeId]
  );
  for (const evt of events.rows) {
    await syncSingleEvent(userId, evt, 'personal_event', calendar, authData.calendarId);
  }
}

async function syncSingleEvent(userId, event, type, calendar, calendarId) {
  const googleEvent = localEventToGoogleEvent(event, type);
  if (!googleEvent) return;

  try {
    const created = await calendar.events.insert({
      calendarId,
      requestBody: googleEvent,
    });

    await query(
      `INSERT INTO google_calendar_sync_map
        (user_id, local_event_id, local_event_type, google_event_id, google_calendar_id, sync_direction, last_synced_at, local_updated_at)
       VALUES ($1, $2, $3, $4, $5, 'outbound', NOW(), NOW())
       ON CONFLICT (user_id, local_event_id, local_event_type) WHERE local_event_id IS NOT NULL DO NOTHING`,
      [userId, event.id, type, created.data.id, calendarId]
    );
  } catch (err) {
    logger.warn(`Google push hiba (${type} ${event.id}):`, err.message);
  }
}

// ============================================================
// Pull Google Events → HR-ERP personal_events
// ============================================================

async function pullGoogleEvents(userId, employeeId, authData) {
  const calendar = google.calendar({ version: 'v3', auth: authData.client });

  try {
    const now = new Date();
    const threeMonthsLater = new Date(now);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const listResult = await calendar.events.list({
      calendarId: authData.calendarId,
      timeMin: now.toISOString(),
      timeMax: threeMonthsLater.toISOString(),
      q: '[HR-ERP]',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const googleEvents = listResult.data.items || [];

    for (const gEvent of googleEvents) {
      // Skip events that originated from HR-ERP (they have hrerpEventId in extendedProperties)
      const hrerpId = gEvent.extendedProperties?.private?.hrerpEventId;
      if (hrerpId) continue;

      // Check if already imported
      const existing = await query(
        'SELECT id FROM google_calendar_sync_map WHERE user_id = $1 AND google_event_id = $2',
        [userId, gEvent.id]
      );
      if (existing.rows.length > 0) {
        // Update existing local event
        await updateLocalFromGoogle(userId, employeeId, gEvent, existing.rows[0]);
        continue;
      }

      // Import as personal_event
      await importGoogleEvent(userId, employeeId, gEvent, authData.calendarId);
    }

    // Check for deleted Google events (inbound sync_map entries without matching Google event)
    await cleanDeletedGoogleEvents(userId, googleEvents);

  } catch (err) {
    handleSyncError(err, userId, 'pullGoogleEvents');
  }
}

async function importGoogleEvent(userId, employeeId, gEvent, calendarId) {
  try {
    const title = (gEvent.summary || '').replace(/^\[HR-ERP\]\s*/, '');
    const eventDate = gEvent.start.date || (gEvent.start.dateTime ? gEvent.start.dateTime.split('T')[0] : null);
    if (!eventDate) return;

    const eventTime = gEvent.start.dateTime
      ? gEvent.start.dateTime.split('T')[1]?.substring(0, 8)
      : null;
    const allDay = !!gEvent.start.date;

    const insertResult = await query(
      `INSERT INTO personal_events (employee_id, event_date, event_time, event_type, title, description, all_day)
       VALUES ($1, $2, $3, 'other', $4, $5, $6) RETURNING id`,
      [employeeId, eventDate, eventTime, title || 'Google esemény', gEvent.description || null, allDay]
    );

    const localId = insertResult.rows[0].id;

    await query(
      `INSERT INTO google_calendar_sync_map
        (user_id, local_event_id, local_event_type, google_event_id, google_calendar_id, sync_direction, last_synced_at, google_updated_at)
       VALUES ($1, $2, 'personal_event', $3, $4, 'inbound', NOW(), $5)`,
      [userId, localId, gEvent.id, calendarId, gEvent.updated ? new Date(gEvent.updated) : new Date()]
    );

    logger.info(`Google esemény importálva: ${gEvent.id} → ${localId}`);
  } catch (err) {
    logger.warn(`Google esemény importálási hiba (${gEvent.id}):`, err.message);
  }
}

async function updateLocalFromGoogle(userId, employeeId, gEvent, syncRow) {
  try {
    const mapResult = await query(
      `SELECT local_event_id, google_updated_at FROM google_calendar_sync_map
       WHERE user_id = $1 AND google_event_id = $2 AND sync_direction = 'inbound'`,
      [userId, gEvent.id]
    );
    if (mapResult.rows.length === 0) return;

    const map = mapResult.rows[0];
    const googleUpdated = gEvent.updated ? new Date(gEvent.updated) : null;
    const lastKnownUpdate = map.google_updated_at ? new Date(map.google_updated_at) : null;

    // Skip if not changed
    if (googleUpdated && lastKnownUpdate && googleUpdated <= lastKnownUpdate) return;

    const title = (gEvent.summary || '').replace(/^\[HR-ERP\]\s*/, '');
    const eventDate = gEvent.start.date || (gEvent.start.dateTime ? gEvent.start.dateTime.split('T')[0] : null);
    const eventTime = gEvent.start.dateTime
      ? gEvent.start.dateTime.split('T')[1]?.substring(0, 8)
      : null;
    const allDay = !!gEvent.start.date;

    await query(
      `UPDATE personal_events SET
         title = $1, description = $2, event_date = $3, event_time = $4, all_day = $5
       WHERE id = $6`,
      [title || 'Google esemény', gEvent.description || null, eventDate, eventTime, allDay, map.local_event_id]
    );

    await query(
      `UPDATE google_calendar_sync_map SET last_synced_at = NOW(), google_updated_at = $1
       WHERE user_id = $2 AND google_event_id = $3`,
      [googleUpdated, userId, gEvent.id]
    );
  } catch (err) {
    logger.warn(`Google esemény frissítési hiba (${gEvent.id}):`, err.message);
  }
}

async function cleanDeletedGoogleEvents(userId, currentGoogleEvents) {
  try {
    const googleIds = currentGoogleEvents.map(e => e.id);

    const inboundMaps = await query(
      `SELECT id, local_event_id, google_event_id FROM google_calendar_sync_map
       WHERE user_id = $1 AND sync_direction = 'inbound'`,
      [userId]
    );

    for (const map of inboundMaps.rows) {
      if (!googleIds.includes(map.google_event_id)) {
        // Google event was deleted — remove local personal_event
        await query('DELETE FROM personal_events WHERE id = $1', [map.local_event_id]);
        await query('DELETE FROM google_calendar_sync_map WHERE id = $1', [map.id]);
        logger.info(`Törölt Google esemény eltávolítva: ${map.google_event_id} → ${map.local_event_id}`);
      }
    }
  } catch (err) {
    logger.warn('Google törölt események tisztítási hiba:', err.message);
  }
}

// ============================================================
// Webhook: Setup watch
// ============================================================

async function setupWebhookWatch(userId) {
  const webhookUrl = process.env.GOOGLE_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('GOOGLE_WEBHOOK_URL nincs beállítva, webhook kihagyva');
    return;
  }

  const authData = await getAuthenticatedClient(userId);
  if (!authData) return;

  const calendar = google.calendar({ version: 'v3', auth: authData.client });
  const channelId = uuidv4();

  try {
    const watchResult = await calendar.events.watch({
      calendarId: authData.calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    await query(
      `UPDATE google_calendar_tokens SET
         webhook_channel_id = $1,
         webhook_resource_id = $2,
         webhook_expiry = $3
       WHERE user_id = $4`,
      [channelId, watchResult.data.resourceId, new Date(parseInt(watchResult.data.expiration)), userId]
    );

    logger.info(`Google webhook beállítva: user=${userId}, channel=${channelId}`);
  } catch (err) {
    logger.warn('Google webhook beállítási hiba:', err.message);
  }
}

// ============================================================
// Webhook: Process incoming notification
// ============================================================

async function processWebhookNotification(channelId, resourceId) {
  try {
    const result = await query(
      'SELECT user_id FROM google_calendar_tokens WHERE webhook_channel_id = $1 AND webhook_resource_id = $2',
      [channelId, resourceId]
    );

    if (result.rows.length === 0) {
      logger.warn(`Ismeretlen webhook channel: ${channelId}`);
      return;
    }

    const userId = result.rows[0].user_id;
    logger.info(`Google webhook értesítés feldolgozása: user=${userId}`);

    // Trigger full sync (non-blocking)
    triggerFullSync(userId).catch(err =>
      logger.error('Webhook sync hiba:', err.message)
    );
  } catch (err) {
    logger.error('Webhook feldolgozási hiba:', err.message);
  }
}

// ============================================================
// Webhook: Refresh expiring channels
// ============================================================

async function refreshWebhookChannels() {
  try {
    const result = await query(
      `SELECT user_id FROM google_calendar_tokens
       WHERE sync_enabled = TRUE
         AND webhook_expiry IS NOT NULL
         AND webhook_expiry < NOW() + INTERVAL '1 day'`
    );

    for (const row of result.rows) {
      await setupWebhookWatch(row.user_id).catch(err =>
        logger.warn(`Webhook megújítási hiba (user=${row.user_id}):`, err.message)
      );
    }

    logger.info(`${result.rows.length} Google webhook megújítva`);
  } catch (err) {
    logger.error('Webhook megújítási hiba:', err.message);
  }
}

// ============================================================
// Error handling helper
// ============================================================

function handleSyncError(err, userId, context) {
  // Token revoked or invalid
  if (err.code === 401 || (err.response && err.response.status === 401) ||
      (err.message && err.message.includes('invalid_grant'))) {
    logger.warn(`Google token érvénytelen (user=${userId}, context=${context}), szinkron kikapcsolva`);
    query(
      'UPDATE google_calendar_tokens SET sync_enabled = FALSE WHERE user_id = $1',
      [userId]
    ).catch(e => logger.error('sync_enabled frissítési hiba:', e.message));
    return;
  }

  logger.error(`Google Calendar szinkron hiba (${context}):`, err.message);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  handleCallback,
  getAuthenticatedClient,
  getConnectionStatus,
  disconnect,
  getUserIdForEmployee,
  syncLocalEventToGoogle,
  syncLocalEventUpdateToGoogle,
  syncLocalEventDeleteFromGoogle,
  triggerFullSync,
  pullGoogleEvents,
  localEventToGoogleEvent,
  processWebhookNotification,
  setupWebhookWatch,
  refreshWebhookChannels,
};
