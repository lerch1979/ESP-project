const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wellbeingIntegration.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Referrals
router.post('/referrals', ctrl.createReferral);
router.get('/my-referrals', ctrl.getMyReferrals);
router.put('/referrals/:id/accept', ctrl.acceptReferral);
router.put('/referrals/:id/decline', ctrl.declineReferral);

// Notifications
router.get('/notifications', ctrl.getNotifications);
router.put('/notifications/:id/read', ctrl.markNotificationRead);
router.put('/notifications/read-all', ctrl.markAllNotificationsRead);

// Feedback
router.post('/feedback', ctrl.submitFeedback);

module.exports = router;
