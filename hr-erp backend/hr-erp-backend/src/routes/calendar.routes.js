const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// GET /api/v1/calendar/events — any authenticated user
router.get('/events', calendarController.getCalendarEvents);

// Shifts — admin only
router.post('/shifts', requireAdmin, calendarController.createShift);
router.put('/shifts/:id', requireAdmin, calendarController.updateShift);
router.delete('/shifts/:id', requireAdmin, calendarController.deleteShift);

// Medical appointments — any authenticated user (ownership enforced in controller)
router.post('/medical-appointments', calendarController.createMedicalAppointment);
router.put('/medical-appointments/:id', calendarController.updateMedicalAppointment);
router.delete('/medical-appointments/:id', calendarController.deleteMedicalAppointment);

// Personal events — any authenticated user (ownership enforced in controller)
router.post('/personal-events', calendarController.createPersonalEvent);
router.put('/personal-events/:id', calendarController.updatePersonalEvent);
router.delete('/personal-events/:id', calendarController.deletePersonalEvent);

module.exports = router;
