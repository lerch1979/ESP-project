const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication (any role can view calendar)
router.use(authenticateToken);

/**
 * GET /api/v1/calendar/events
 * Naptár események lekérése
 */
router.get('/events', calendarController.getCalendarEvents);

module.exports = router;
