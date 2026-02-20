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
 * PUT /api/v1/notification-center/:id/read
 * Egy ertesites olvasottnak jelolese
 */
router.put('/:id/read', notificationCenterController.markAsRead);

module.exports = router;
