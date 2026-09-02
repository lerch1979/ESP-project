/**
 * Partner module routes — contacts + contracts.
 *
 * Gated with `settings.view` / `settings.edit`, the same pair the finance and billing
 * surfaces use: partner contracts carry commercial terms, so they belong to the same
 * audience as the rate editor, not to the broader employees.view crowd.
 *
 * NOTE for Phase 4: these paths are NOT in the external-sales allow-list
 * (middleware/moduleScope.js). An external agent reaching /partners gets 403 by
 * default, which is intended — contract values are on the never-see list.
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/partner.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

const canView = checkPermission('settings.view');
const canEdit = checkPermission('settings.edit');

// ── contacts ── /partners/contacts?contractor_id=… | ?accommodation_id=…
router.get('/contacts',        canView, ctrl.listContacts);
router.post('/contacts',       canEdit, ctrl.createContact);
router.put('/contacts/:id',    canEdit, ctrl.updateContact);
router.delete('/contacts/:id', canEdit, ctrl.deleteContact);

// ── contracts ──
// GET /partners/contracts                     → the Szerződések board (all partner types)
//   ?within_days=90                           → "actionable in the next quarter"
//   ?leases_only=true                         → only accommodation leases
//   ?contractor_id= / ?accommodation_id= / ?contract_role= / ?status=
router.get('/contracts',        canView, ctrl.listContracts);
router.get('/contracts/:id',    canView, ctrl.getContract);
router.post('/contracts',       canEdit, ctrl.createContract);
router.put('/contracts/:id',    canEdit, ctrl.updateContract);
router.delete('/contracts/:id', canEdit, ctrl.deleteContract);

module.exports = router;
