const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wellmind.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// Self-service endpoints expose the caller's own GDPR Art-9 health data
// (mood, burnout, interventions, coaching). They are NOT open to every
// authenticated user — they require the explicit `wellbeing.self` permission,
// which residents (accommodated_employee) do not hold.
const selfService = checkPermission('wellbeing.self');

// ── Employee endpoints ─────────────────────────────────────────────

// Pulse surveys
router.post('/pulse', selfService, ctrl.submitPulse);
router.get('/pulse/history', selfService, ctrl.getPulseHistory);
router.get('/pulse/today', selfService, ctrl.getTodayPulse);

// Assessments
router.post('/assessment', selfService, ctrl.submitAssessment);
router.get('/assessment/history', selfService, ctrl.getAssessmentHistory);
router.get('/assessment/questions', selfService, ctrl.getAssessmentQuestions);

// Dashboard
router.get('/my-dashboard', selfService, ctrl.getMyDashboard);

// Overtime (employee)
router.get('/overtime/my', selfService, ctrl.getMyOvertime);

// Admin: overtime & sick leave analytics
router.get('/admin/overtime-correlation',
  checkPermission('blue_colibri.admin.view'),
  ctrl.getOvertimeCorrelation
);
router.get('/admin/sick-leave-correlation',
  checkPermission('blue_colibri.admin.view'),
  ctrl.getSickLeaveCorrelation
);

// Interventions
router.get('/interventions', selfService, ctrl.getInterventions);
router.post('/interventions/:id/accept', selfService, ctrl.acceptIntervention);
router.post('/interventions/:id/complete', selfService, ctrl.completeIntervention);
router.post('/interventions/:id/skip', selfService, ctrl.skipIntervention);

// Coaching
router.get('/coaching-sessions', selfService, ctrl.getCoachingSessions);
router.post('/coaching-sessions/:id/feedback', selfService, ctrl.rateCoachingSession);

// ── Manager endpoints ──────────────────────────────────────────────

router.get('/team/:teamId/metrics',
  checkPermission('blue_colibri.team.view'),
  ctrl.getTeamMetrics
);

// ── Admin endpoints ────────────────────────────────────────────────

router.get('/admin/dashboard',
  checkPermission('blue_colibri.admin.view'),
  ctrl.getAdminDashboard
);

router.get('/admin/risk-employees',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.getRiskEmployees
);

router.get('/admin/trends',
  checkPermission('blue_colibri.admin.view'),
  ctrl.getTrends
);

router.post('/admin/questions',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.createQuestion
);

router.put('/admin/questions/:id',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.updateQuestion
);

router.delete('/admin/questions/:id',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.deleteQuestion
);

router.get('/admin/questions',
  checkPermission('blue_colibri.admin.view'),
  ctrl.getQuestions
);

router.post('/admin/bulk-intervention',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.bulkIntervention
);

module.exports = router;
