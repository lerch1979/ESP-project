const express = require('express');
const router = express.Router();
const residentSelf = require('../controllers/residentSelf.controller');
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
router.get('/tickets/my/:id', residentSelf.getMyTicketById);
router.get('/accommodations/my', residentSelf.getMyAccommodation);

module.exports = router;
