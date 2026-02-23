const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// GET /api/v1/calendar/events — any authenticated user with calendar.view
router.get('/events', checkPermission('calendar.view'), calendarController.getCalendarEvents);

// Shifts — require calendar.create/edit/delete
router.post('/shifts', checkPermission('calendar.create'), calendarController.createShift);
router.put('/shifts/:id', checkPermission('calendar.edit'), calendarController.updateShift);
router.delete('/shifts/:id', checkPermission('calendar.delete'), calendarController.deleteShift);

// Medical appointments — require calendar permissions (ownership enforced in controller)
router.post('/medical-appointments', checkPermission('calendar.create'), calendarController.createMedicalAppointment);
router.put('/medical-appointments/:id', checkPermission('calendar.edit'), calendarController.updateMedicalAppointment);
router.delete('/medical-appointments/:id', checkPermission('calendar.delete'), calendarController.deleteMedicalAppointment);

// Personal events — require calendar permissions (ownership enforced in controller)
router.post('/personal-events', checkPermission('calendar.create'), calendarController.createPersonalEvent);
router.put('/personal-events/:id', checkPermission('calendar.edit'), calendarController.updatePersonalEvent);
router.delete('/personal-events/:id', checkPermission('calendar.delete'), calendarController.deletePersonalEvent);

module.exports = router;
