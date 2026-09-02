const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/billing.controller');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All billing config/runs are admin-gated (settings.edit). DRAFT runs only —
// finalize/invoice (the money/client-facing L1 step) stays a separate action.
router.use(authenticateToken);

// client_night_rates CRUD
router.get('/rates', checkPermission('settings.edit'), ctrl.listRates);
router.post('/rates', checkPermission('settings.edit'), ctrl.createRate);
router.put('/rates/:id', checkPermission('settings.edit'), ctrl.updateRate);
router.delete('/rates/:id', checkPermission('settings.edit'), ctrl.deleteRate);

// per-client billing profile (invoicing on/off · legal type · VAT-exempt reason)
router.get('/profiles', checkPermission('settings.edit'), ctrl.listProfiles);
router.put('/profiles/:contractorId', checkPermission('settings.edit'), ctrl.upsertProfile);

// rate coverage (who would bill $0) + per-accommodation utilities-billing flag
router.get('/rate-coverage', checkPermission('settings.edit'), ctrl.rateCoverage);
router.get('/accommodations', checkPermission('settings.edit'), ctrl.listAccommodationsUtil);
router.put('/accommodations/:id/utilities', checkPermission('settings.edit'), ctrl.setUtilities);

// per-worker billing_client (who pays for housing)
router.put('/employees/:id/client', checkPermission('settings.edit'), ctrl.setEmployeeClient);
router.post('/employees/bulk-client', checkPermission('settings.edit'), ctrl.bulkSetEmployeeClient);

// draft run + listing
router.post('/runs', checkPermission('settings.edit'), ctrl.runDraft);
router.get('/runs', checkPermission('settings.edit'), ctrl.listRuns);
router.get('/runs/:id/billings', checkPermission('settings.edit'), ctrl.getRunBillings);

// ── month close ──
// Which months are closed vs still draft (drives the UI's status column).
router.get('/months', checkPermission('settings.edit'), ctrl.monthStatus);
// Close a month: the run becomes immutable and the engine refuses to re-bill it.
router.post('/runs/:id/finalize', checkPermission('settings.edit'), ctrl.finalizeRun);
// Reopen a closed month. SUPERADMIN ONLY — deliberately stricter than closing.
// Closing is routine month-end housekeeping; reopening makes the figures behind an
// ISSUED INVOICE movable again, which is a financial act, not an administrative one.
// It additionally requires a reason (enforced in the controller AND by a DB CHECK on
// billing_month_lock_events) and logs at warn level.
router.post('/runs/:id/reopen', requireSuperAdmin, ctrl.reopenRun);

module.exports = router;
