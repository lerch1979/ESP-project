/**
 * Settlement-sheet routes.
 *
 *   • admin        — mounted at ${API_PREFIX}/settlements, permission-gated
 *   • publicRouter — mounted at /public/settlement, NO auth; the token is the
 *                    authorisation and is bound to one partner + kind + month.
 *
 * Gated with settings.edit, the same audience as the billing surface these documents
 * are built from. NOT in the external-sales allow-list (middleware/moduleScope.js):
 * these carry rates, margins and resident names, all on the never-see list.
 */
const express = require('express');
const ctrl = require('../controllers/settlement.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const admin = express.Router();
admin.use(authenticateToken);
const canView = checkPermission('settings.edit');

// Which partners have a settlement for a month → the picker.
admin.get('/partners', canView, ctrl.listPartners);
// Share links (list/mint/revoke) BEFORE /:kind so the literal paths win over the param.
admin.get('/links', canView, ctrl.listLinks);
admin.post('/links', canView, ctrl.createLink);
admin.delete('/links/:id', canView, ctrl.revokeLink);
// /settlements/landlord|client?partner_id=&month=[&format=xlsx|pdf]
admin.get('/:kind/preview', canView, ctrl.preview);
admin.get('/:kind/download', canView, ctrl.download);

const publicRouter = express.Router();
publicRouter.get('/:token', ctrl.publicView);

module.exports = { admin, publicRouter };
