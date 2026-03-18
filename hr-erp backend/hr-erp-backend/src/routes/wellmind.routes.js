const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wellmind.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// ── Employee endpoints ─────────────────────────────────────────────

// Pulse surveys
router.post('/pulse', ctrl.submitPulse);
router.get('/pulse/history', ctrl.getPulseHistory);
router.get('/pulse/today', ctrl.getTodayPulse);

// Assessments
router.post('/assessment', ctrl.submitAssessment);
router.get('/assessment/history', ctrl.getAssessmentHistory);
router.get('/assessment/questions', ctrl.getAssessmentQuestions);

// Dashboard
router.get('/my-dashboard', ctrl.getMyDashboard);

// Interventions
router.get('/interventions', ctrl.getInterventions);
router.post('/interventions/:id/accept', ctrl.acceptIntervention);
router.post('/interventions/:id/complete', ctrl.completeIntervention);
router.post('/interventions/:id/skip', ctrl.skipIntervention);

// Coaching
router.get('/coaching-sessions', ctrl.getCoachingSessions);
router.post('/coaching-sessions/:id/feedback', ctrl.rateCoachingSession);

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
