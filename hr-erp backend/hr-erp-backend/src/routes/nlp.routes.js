const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nlp.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// ── Employee endpoints (consent) ───────────────────────────────────────
router.get('/consent', ctrl.getConsent);
router.post('/consent', ctrl.updateConsent);

// ── Admin endpoints ────────────────────────────────────────────────────
router.get('/config',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.getConfig
);

router.put('/config',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.updateConfig
);

router.get('/stats',
  checkPermission('blue_colibri.admin.view'),
  ctrl.getStats
);

router.get('/alerts',
  checkPermission('blue_colibri.admin.view'),
  ctrl.getAlerts
);

router.put('/alerts/:id/review',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.reviewAlert
);

router.get('/sentiment-history',
  checkPermission('blue_colibri.admin.view'),
  ctrl.getSentimentHistory
);

router.post('/test',
  checkPermission('blue_colibri.admin.manage'),
  ctrl.testAnalysis
);

module.exports = router;
