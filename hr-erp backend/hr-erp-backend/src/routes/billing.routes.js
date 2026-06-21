const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/billing.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All billing config/runs are admin-gated (settings.edit). DRAFT runs only —
// finalize/invoice (the money/client-facing L1 step) stays a separate action.
router.use(authenticateToken);

// client_night_rates CRUD
router.get('/rates', checkPermission('settings.edit'), ctrl.listRates);
router.post('/rates', checkPermission('settings.edit'), ctrl.createRate);
router.put('/rates/:id', checkPermission('settings.edit'), ctrl.updateRate);
router.delete('/rates/:id', checkPermission('settings.edit'), ctrl.deleteRate);

// per-worker billing_client (who pays for housing)
router.put('/employees/:id/client', checkPermission('settings.edit'), ctrl.setEmployeeClient);
router.post('/employees/bulk-client', checkPermission('settings.edit'), ctrl.bulkSetEmployeeClient);

// draft run + listing
router.post('/runs', checkPermission('settings.edit'), ctrl.runDraft);
router.get('/runs', checkPermission('settings.edit'), ctrl.listRuns);
router.get('/runs/:id/billings', checkPermission('settings.edit'), ctrl.getRunBillings);

module.exports = router;
