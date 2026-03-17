const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/carepath.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// ── Employee endpoints ─────────────────────────────────────────────

router.get('/categories', ctrl.getCategories);

// Cases
router.post('/cases', ctrl.createCase);
router.get('/my-cases', ctrl.getMyCases);
router.get('/cases/:id', ctrl.getCaseDetails);
router.put('/cases/:id/close', ctrl.closeCase);

// Providers
router.get('/providers/search', ctrl.searchProviders);
router.get('/providers/:id/availability', ctrl.getProviderAvailability);
router.get('/providers/:id', ctrl.getProvider);

// Bookings
router.post('/bookings', ctrl.createBooking);
router.get('/my-bookings', ctrl.getMyBookings);
router.put('/bookings/:id/cancel', ctrl.cancelBooking);
router.put('/bookings/:id/reschedule', ctrl.rescheduleBooking);

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
