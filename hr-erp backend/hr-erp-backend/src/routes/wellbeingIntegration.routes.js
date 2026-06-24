const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wellbeingIntegration.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Self-service (the caller's own wellbeing referrals/notifications/feedback)
// requires the explicit `wellbeing.self` permission — not open to residents.
const selfService = checkPermission('wellbeing.self');

// Referrals
router.post('/referrals', selfService, ctrl.createReferral);
router.get('/my-referrals', selfService, ctrl.getMyReferrals);
router.put('/referrals/:id/accept', selfService, ctrl.acceptReferral);
router.put('/referrals/:id/decline', selfService, ctrl.declineReferral);

// Notifications
router.get('/notifications', selfService, ctrl.getNotifications);
router.put('/notifications/:id/read', selfService, ctrl.markNotificationRead);
router.put('/notifications/read-all', selfService, ctrl.markAllNotificationsRead);

// Feedback
router.post('/feedback', selfService, ctrl.submitFeedback);

// Admin: cross-employee conflict + predictive mental-health analytics. These
// were previously UNGATED — any authenticated user could read them (and inject
// ?contractorId to cross tenants). Lock to the health-analytics permission.
router.get('/admin/conflicts/stats', checkPermission('wellbeing.admin.view'), ctrl.getConflictStats);
router.get('/admin/conflicts/trends', checkPermission('wellbeing.admin.view'), ctrl.getConflictTrends);
router.get('/admin/conflicts/critical', checkPermission('wellbeing.admin.view'), ctrl.getCriticalIncidents);

// Admin: Question Rotation
router.get('/admin/question-rotation', checkPermission('wellbeing.admin.view'), ctrl.getQuestionRotation);
router.put('/admin/question-rotation', checkPermission('wellbeing.admin.manage'), ctrl.updateQuestionRotation);

// Admin: Predictive Analytics
router.get('/admin/predictive', checkPermission('wellbeing.admin.view'), ctrl.getPredictiveAnalytics);

module.exports = router;
