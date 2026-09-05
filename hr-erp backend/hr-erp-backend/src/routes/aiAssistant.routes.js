const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aiAssistant.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Phase 0 Gate A #4. "Every active user can chat" understated what chatting does:
// aiAssistantHandlers.handleTicket runs a real INSERT INTO tickets (+ ticket_history) in
// the staff workflow. So an ungated chat endpoint is a WRITE into the staff queue for
// anyone holding a login — including the resident, megbízó and alvállalkozó roles now
// being created. The assistant is a staff tool; it answers to the staff dashboard
// permission, and the ticket-creating intent additionally checks tickets.create inside
// the handler (a staff member who may chat is not automatically allowed to file).
const staffOnly = checkPermission('dashboard.view');

router.post('/chat',                  staffOnly, ctrl.chat);
router.get('/history',                staffOnly, ctrl.history);
router.post('/feedback/:messageId',   staffOnly, ctrl.feedback);

module.exports = router;
