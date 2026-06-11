/**
 * GDPR anonymization routes. Erasure actions are SUPERADMIN-only (irreversible);
 * consent recording is allowed for admins (HR). Mounted at ${API_PREFIX}/anonymization.
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/gdprAnonymization.controller');
const { authenticateToken, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

router.use(authenticateToken);

// Consent recording — HR admins.
router.post('/consent', requireAdmin, ctrl.recordConsent);

// Everything erasure-related — superadmin only.
router.get('/config', requireSuperAdmin, ctrl.getConfig);
router.put('/config', requireSuperAdmin, ctrl.updateConfig);
router.get('/proposals', requireSuperAdmin, ctrl.listProposals);
router.post('/preview', requireSuperAdmin, ctrl.preview);
router.post('/execute', requireSuperAdmin, ctrl.execute);
router.get('/logs', requireSuperAdmin, ctrl.getLogs);

module.exports = router;
