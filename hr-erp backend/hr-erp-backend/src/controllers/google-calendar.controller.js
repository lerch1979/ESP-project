const googleCalendarService = require('../services/google-calendar.service');
const { logger } = require('../utils/logger');

// ============================================================
// GET /api/v1/calendar/google/auth
// ============================================================

const startGoogleAuth = async (req, res) => {
  try {
    const source = req.query.source || undefined;
    const authUrl = googleCalendarService.getAuthUrl(req.user.id, source);
    res.json({ success: true, data: { authUrl } });
  } catch (error) {
    logger.error('Google auth URL generálási hiba:', error);
    res.status(500).json({ success: false, message: 'Google hitelesítési URL generálási hiba' });
  }
};

// ============================================================
// GET /auth/google/callback
// ============================================================

const handleGoogleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Decode state to check source
    let source = null;
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
        source = parsed.source;
      } catch {}
    }

    const sendWebResponse = (status, reason) => {
      res.send(`<!DOCTYPE html><html><body><script>
        window.opener && window.opener.postMessage({ type: 'google-auth', status: '${status}', reason: '${reason || ''}' }, '*');
        window.close();
      </script><p>${status === 'success' ? 'Sikeres csatlakozás! Ez az ablak bezáródik...' : 'Hiba történt. Ez az ablak bezáródik...'}</p></body></html>`);
    };

    if (error) {
      logger.warn('Google OAuth hiba:', error);
      if (source === 'web') return sendWebResponse('error', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}?google_auth=error&reason=${error}`);
    }

    if (!code || !state) {
      if (source === 'web') return sendWebResponse('error', 'missing_params');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}?google_auth=error&reason=missing_params`);
    }

    await googleCalendarService.handleCallback(code, state);

    if (source === 'web') return sendWebResponse('success');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}?google_auth=success`);
  } catch (error) {
    logger.error('Google OAuth callback hiba:', error);
    // Try to get source from state for error case
    let source = null;
    if (req.query.state) {
      try {
        const parsed = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
        source = parsed.source;
      } catch {}
    }
    if (source === 'web') {
      return res.send(`<!DOCTYPE html><html><body><script>
        window.opener && window.opener.postMessage({ type: 'google-auth', status: 'error', reason: 'callback_failed' }, '*');
        window.close();
      </script><p>Hiba történt. Ez az ablak bezáródik...</p></body></html>`);
    }
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}?google_auth=error&reason=callback_failed`);
  }
};

// ============================================================
// POST /api/v1/calendar/google/sync
// ============================================================

const triggerSync = async (req, res) => {
  try {
    await googleCalendarService.triggerFullSync(req.user.id);
    res.json({ success: true, message: 'Google Calendar szinkronizálás elindítva' });
  } catch (error) {
    logger.error('Google Calendar szinkron hiba:', error);
    res.status(500).json({ success: false, message: error.message || 'Google Calendar szinkronizálási hiba' });
  }
};

// ============================================================
// GET /api/v1/calendar/google/status
// ============================================================

const getStatus = async (req, res) => {
  try {
    const status = await googleCalendarService.getConnectionStatus(req.user.id);
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Google Calendar státusz lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Google Calendar státusz lekérési hiba' });
  }
};

// ============================================================
// DELETE /api/v1/calendar/google/disconnect
// ============================================================

const disconnectGoogle = async (req, res) => {
  try {
    await googleCalendarService.disconnect(req.user.id);
    res.json({ success: true, message: 'Google Calendar lecsatlakoztatva' });
  } catch (error) {
    logger.error('Google Calendar lecsatlakoztatási hiba:', error);
    res.status(500).json({ success: false, message: 'Google Calendar lecsatlakoztatási hiba' });
  }
};

// ============================================================
// POST /api/v1/calendar/google/webhook
// ============================================================

const handleWebhook = async (req, res) => {
  // Respond 200 immediately (Google expects fast response)
  res.status(200).end();

  const channelId = req.headers['x-goog-channel-id'];
  const resourceId = req.headers['x-goog-resource-id'];

  if (!channelId || !resourceId) return;

  // Process async
  googleCalendarService.processWebhookNotification(channelId, resourceId).catch(err =>
    logger.error('Webhook feldolgozási hiba:', err.message)
  );
};

module.exports = {
  startGoogleAuth,
  handleGoogleCallback,
  triggerSync,
  getStatus,
  disconnectGoogle,
  handleWebhook,
};
