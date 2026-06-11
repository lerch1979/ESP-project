const express = require('express');
const router = express.Router();
const residentSelf = require('../controllers/residentSelf.controller');
const ticketMessages = require('../controllers/ticketMessages.controller');
const ticketAttachments = require('../controllers/ticketAttachments.controller');
const { authenticateToken } = require('../middleware/auth');

/**
 * Resident self-service routes — auth-only (NO permission gate), self-scoped.
 * Mounted at API_PREFIX BEFORE the staff /tickets and /accommodations routers
 * so these specific paths win and staff route files stay untouched.
 *
 *   GET /tickets/my          → own tickets only
 *   GET /tickets/my/:id      → own ticket (404 if not theirs)
 *   GET /accommodations/my   → own room only
 */
router.use(authenticateToken);

router.get('/tickets/my', residentSelf.getMyTickets);
// MUST be before /tickets/my/:id so "categories" isn't captured as an :id.
router.get('/tickets/my/categories', residentSelf.getMyCategories);
router.get('/tickets/my/:id', residentSelf.getMyTicketById);
router.get('/accommodations/my', residentSelf.getMyAccommodation);

// Resident ticket chat — self-scoped to OWN ticket (requireOwnTicket guard),
// then reuse the shared staff thread controllers so messages land in the same
// ticket_messages thread staff already see.
router.get('/tickets/my/:ticketId/messages', residentSelf.requireOwnTicket, ticketMessages.list);
router.post('/tickets/my/:ticketId/messages', residentSelf.requireOwnTicket, ticketMessages.send);

// Resident photo attachments — self-scoped to OWN ticket (create-time upload).
router.post('/tickets/my/:ticketId/attachments', residentSelf.requireOwnTicket, ticketAttachments.uploadPhoto, ticketAttachments.uploadMine);
router.get('/tickets/my/:ticketId/attachments/:attId', residentSelf.requireOwnTicket, ticketAttachments.streamMine);

module.exports = router;
