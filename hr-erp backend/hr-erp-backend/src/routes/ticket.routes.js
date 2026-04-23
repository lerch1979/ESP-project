const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticket.controller');
const { authenticateToken, checkContractorAccess } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Minden ticket route-hoz authentikáció szükséges
router.use(authenticateToken);
router.use(checkContractorAccess);

/**
 * GET /api/v1/tickets
 * Ticketek listázása (szűrőkkel, lapozással)
 * Query paraméterek: status, category, priority, assigned_to, search, page, limit
 */
router.get('/', checkPermission('tickets.view'), ticketController.getTickets);

/**
 * GET /api/v1/tickets/:id
 * Egy ticket részletei (megjegyzésekkel, csatolmányokkal, történettel)
 */
router.get('/:id', checkPermission('tickets.view'), ticketController.getTicketById);

/**
 * POST /api/v1/tickets
 * Új ticket létrehozása
 * Body: { title, description, category_id, priority_id, assigned_to }
 */
router.post('/', checkPermission('tickets.create'), ticketController.createTicket);

/**
 * PATCH /api/v1/tickets/:id
 * Ticket általános szerkesztése (cím, leírás, kategória, prioritás,
 * felelős, kapcsolódó dolgozó). Minden változás ticket_history sorként.
 * Body: { title?, description?, category_id?, priority_id?, assigned_to?, linked_employee_id? }
 */
router.patch('/:id', checkPermission('tickets.edit'), ticketController.updateTicket);

/**
 * PATCH /api/v1/tickets/:id/status
 * Ticket státusz frissítése
 * Body: { status_id, comment }
 */
router.patch('/:id/status', checkPermission('tickets.change_status'), ticketController.updateTicketStatus);

/**
 * POST /api/v1/tickets/:id/comments
 * Megjegyzés hozzáadása tickethez
 * Body: { comment, is_internal }
 */
router.post('/:id/comments', checkPermission('tickets.view'), ticketController.addComment);

module.exports = router;
