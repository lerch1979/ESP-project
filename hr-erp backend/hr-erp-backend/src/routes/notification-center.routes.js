const express = require('express');
const router = express.Router();
const notificationCenterController = require('../controllers/notification-center.controller');
const { authenticateToken } = require('../middleware/auth');

// Minden felhasznalo lathaja a sajat ertesiteseit (nem kell admin)
router.use(authenticateToken);

/**
 * GET /api/v1/notification-center
 * Ertesitesek listazasa (lapozassal)
 */
router.get('/', notificationCenterController.getNotifications);

/**
 * GET /api/v1/notification-center/unread-count
 * Olvasatlan ertesitesek szama
 */
router.get('/unread-count', notificationCenterController.getUnreadCount);

/**
 * POST /api/v1/notification-center/mark-all-read
 * Osszes ertesites olvasottnak jelolese
 */
router.post('/mark-all-read', notificationCenterController.markAllAsRead);

/**
 * PATCH /api/v1/notification-center/mark-all-read
 * Alias for POST /mark-all-read — same handler, lets PATCH-style clients
 * issue the bulk update without breaking the existing POST consumer
 * (NotificationBell).
 */
router.patch('/mark-all-read', notificationCenterController.markAllAsRead);

/**
 * PUT /api/v1/notification-center/:id/read
 * Egy ertesites olvasottnak jelolese
 */
router.put('/:id/read', notificationCenterController.markAsRead);

/**
 * PATCH /api/v1/notification-center/:id/read
 * Alias for PUT /:id/read — same handler, lets PATCH-style clients work
 * without breaking existing PUT consumers (e.g. NotificationBell).
 */
router.patch('/:id/read', notificationCenterController.markAsRead);

/**
 * DELETE /api/v1/notification-center/:id
 * Owner-only delete. Broadcast notifications (user_id IS NULL) are NOT
 * deletable through this endpoint — see controller.
 */
router.delete('/:id', notificationCenterController.deleteNotification);

module.exports = router;
