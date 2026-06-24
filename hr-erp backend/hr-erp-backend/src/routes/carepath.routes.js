const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/carepath.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// CarePath is the EAP (employee assistance / counseling) programme — its
// self-service endpoints expose the caller's own GDPR Art-9 health data
// (mental-health cases, counseling bookings). Require the explicit
// `wellbeing.self` permission; residents (accommodated_employee) do not hold it.
const selfService = checkPermission('wellbeing.self');

// ── Employee endpoints ─────────────────────────────────────────────

router.get('/categories', selfService, ctrl.getCategories);

// Cases
router.post('/cases', selfService, ctrl.createCase);
router.get('/my-cases', selfService, ctrl.getMyCases);
router.get('/cases/:id', selfService, ctrl.getCaseDetails);
router.put('/cases/:id/close', selfService, ctrl.closeCase);

// Providers
router.get('/providers/search', selfService, ctrl.searchProviders);
router.get('/providers/:id/availability', selfService, ctrl.getProviderAvailability);
router.get('/providers/:id', selfService, ctrl.getProvider);

// Bookings
router.post('/bookings', selfService, ctrl.createBooking);
router.get('/my-bookings', selfService, ctrl.getMyBookings);
router.put('/bookings/:id/cancel', selfService, ctrl.cancelBooking);
router.put('/bookings/:id/reschedule', selfService, ctrl.rescheduleBooking);

// ── Provider endpoints ─────────────────────────────────────────────

router.post('/provider/sessions',
  checkPermission('eap.provider.sessions'),
  ctrl.createSession
);

router.get('/provider/cases',
  checkPermission('eap.provider.sessions'),
  ctrl.getProviderCases
);

// ── Admin endpoints ────────────────────────────────────────────────

router.get('/admin/usage-stats',
  checkPermission('eap.admin.stats'),
  ctrl.getUsageStats
);

router.get('/admin/providers',
  checkPermission('eap.providers.manage'),
  ctrl.getAdminProviders
);

router.post('/admin/providers',
  checkPermission('eap.providers.manage'),
  ctrl.createProvider
);

router.put('/admin/providers/:id',
  checkPermission('eap.providers.manage'),
  ctrl.updateProvider
);

module.exports = router;
