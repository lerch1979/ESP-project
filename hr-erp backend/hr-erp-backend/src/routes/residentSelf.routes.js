const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const residentSelf = require('../controllers/residentSelf.controller');
const ticketMessages = require('../controllers/ticketMessages.controller');
const ticketAttachments = require('../controllers/ticketAttachments.controller');
const calendarController = require('../controllers/calendar.controller');
const { authenticateToken } = require('../middleware/auth');

// Resident profile-photo upload — same on-disk pipeline as the admin uploader
// (raw file → sharp resizes to thumb/orig in the controller). 5 MB cap, images
// only. Self-scope is enforced in the controller (employees.user_id = caller).
const empPhotoDir = path.join(__dirname, '..', '..', 'uploads', 'employees');
if (!fs.existsSync(empPhotoDir)) fs.mkdirSync(empPhotoDir, { recursive: true });
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, empPhotoDir),
    filename: (req, file, cb) =>
      cb(null, 'raw_' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  // Reject non-images SILENTLY (cb(null, false)) so req.file stays undefined and
  // the controller returns a clean 400 — rather than throwing to the global
  // error handler (500). Same pattern as ticket attachments.
  fileFilter: (req, file, cb) =>
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

/**
 * Resident self-service routes — auth-only (NO permission gate), self-scoped.
 * Mounted at API_PREFIX BEFORE the staff /tickets and /accommodations routers
 * so these specific paths win and staff route files stay untouched.
 *
 *   GET /tickets/my          → own tickets only
 *   GET /tickets/my/:id      → own ticket (404 if not theirs)
 *   GET /accommodations/my   → own room only
 *
 * ⚠️ Auth is attached PER-ROUTE, not via a router-level `router.use(...)`.
 * This router is mounted at the BARE `${API_PREFIX}` (so its concrete paths
 * win over the staff routers), which means a path-less `router.use(authenticateToken)`
 * would run for EVERY `/api/v1/*` request entering this router — 401-gating
 * public endpoints mounted after it (it previously broke the public chatbot
 * FAQ endpoints). Keep `authenticateToken` on each route definition instead.
 */
router.get('/tickets/my', authenticateToken, residentSelf.getMyTickets);
// MUST be before /tickets/my/:id so "categories"/"suggest-category" aren't
// captured as an :id.
router.get('/tickets/my/categories', authenticateToken, residentSelf.getMyCategories);
router.post('/tickets/my/suggest-category', authenticateToken, residentSelf.suggestMyCategory);
router.get('/tickets/my/:id', authenticateToken, residentSelf.getMyTicketById);
router.get('/accommodations/my', authenticateToken, residentSelf.getMyAccommodation);

// Resident profile photo — self-scoped (own employee only). GET own profile,
// upload/replace (multipart 'photo'), delete. PROFILE PICTURE ONLY — never used
// for biometric/face-recognition processing. Mounted BEFORE the staff
// /employees router so '/employees/my*' wins over '/employees/:id'.
router.get('/employees/my', authenticateToken, residentSelf.getMyEmployee);
router.post('/employees/my/photo', authenticateToken, photoUpload.single('photo'), residentSelf.uploadMyPhoto);
router.delete('/employees/my/photo', authenticateToken, residentSelf.deleteMyPhoto);

// Resident calendar — auth-only, self-scoped, READ-ONLY (one-way). Returns ONLY
// the caller's own upcoming events (repairs, check-in/out, visa/contract expiry).
router.get('/calendar/my', authenticateToken, calendarController.getMyCalendarEvents);
// Per-event .ics export — self-scoped (a resident can only export their OWN
// events); one-way, no SMTP/OAuth. Feeds the mobile "add to my calendar" sheet.
router.get('/calendar/my/:type/:id.ics', authenticateToken, calendarController.getMyCalendarEventIcs);

// Resident ticket chat — self-scoped to OWN ticket (requireOwnTicket guard),
// then reuse the shared staff thread controllers so messages land in the same
// ticket_messages thread staff already see.
router.get('/tickets/my/:ticketId/messages', authenticateToken, residentSelf.requireOwnTicket, ticketMessages.list);
router.post('/tickets/my/:ticketId/messages', authenticateToken, residentSelf.requireOwnTicket, ticketMessages.send);

// Resident photo attachments — self-scoped to OWN ticket (create-time upload).
router.post('/tickets/my/:ticketId/attachments', authenticateToken, residentSelf.requireOwnTicket, ticketAttachments.uploadPhoto, ticketAttachments.uploadMine);
router.get('/tickets/my/:ticketId/attachments/:attId', authenticateToken, residentSelf.requireOwnTicket, ticketAttachments.streamMine);

module.exports = router;
