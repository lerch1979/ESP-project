const express = require('express');
const router = express.Router();
const googleCalendarController = require('../controllers/google-calendar.controller');
const { authenticateToken } = require('../middleware/auth');

// Authenticated routes
router.get('/auth', authenticateToken, googleCalendarController.startGoogleAuth);
router.post('/sync', authenticateToken, googleCalendarController.triggerSync);
router.get('/status', authenticateToken, googleCalendarController.getStatus);
router.delete('/disconnect', authenticateToken, googleCalendarController.disconnectGoogle);

// Webhook — NO AUTH (Google calls this directly)
router.post('/webhook', googleCalendarController.handleWebhook);

module.exports = router;
