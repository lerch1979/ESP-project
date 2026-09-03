/**
 * Sales pipeline routes.
 *
 *   • admin        — ${API_PREFIX}/sales, permission-gated
 *   • publicRouter — /public/quote, NO auth; the share token is the authorisation
 *
 * Gated on the `sales.*` namespace (mig 151), granted today to superadmin + admin so
 * nothing changes for current users. The point is the direction of the next change:
 * narrowing access for real salespeople is then a REMOVED grant, not a refactor.
 *
 * These paths are deliberately NOT in the module-scope allow-list
 * (middleware/moduleScope.js), so an external role added in Phase 4 reaches them only
 * when someone opts them in explicitly.
 */
const express = require('express');
const ctrl = require('../controllers/sales.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const admin = express.Router();
admin.use(authenticateToken);
// The sales.* namespace (mig 151). Read and write are separated, and ACCEPT is its own
// permission because it writes a contract and a billing rate — a money action, not an
// edit. An external agent (Phase 4) gets view+edit and never accept.
const canView   = checkPermission('sales.view');
const canEdit   = checkPermission('sales.edit');
const canAccept = checkPermission('sales.quotes.accept');

admin.get('/leads',                canView, ctrl.listLeads);
admin.post('/leads',               canEdit, ctrl.createLead);
admin.put('/leads/:id',            canEdit, ctrl.updateLead);
admin.post('/leads/:id/convert',   canEdit, ctrl.convertLead);

admin.get('/board',                canView, ctrl.board);
admin.get('/opportunities',        canView, ctrl.listOpportunities);
admin.post('/opportunities',       canEdit, ctrl.createOpportunity);
admin.put('/opportunities/:id',    canEdit, ctrl.updateOpportunity);

admin.get('/quotes',               canView, ctrl.listQuotes);
admin.post('/quotes',              canEdit, ctrl.createQuote);
admin.get('/quotes/:id',           canView, ctrl.getQuote);
admin.put('/quotes/:id',           canEdit, ctrl.updateQuote);
admin.post('/quotes/:id/send',     canEdit, ctrl.sendQuote);
// Accept writes a partner_contracts row AND client_night_rates rows in one transaction.
admin.post('/quotes/:id/accept',   canAccept, ctrl.acceptQuote);
admin.post('/quotes/:id/reject',   canEdit, ctrl.rejectQuote);
admin.post('/quotes/:id/share',    canEdit, ctrl.shareQuote);
admin.delete('/quotes/:id/share',  canEdit, ctrl.revokeShare);

const publicRouter = express.Router();
publicRouter.get('/:token', ctrl.publicQuote);

module.exports = { admin, publicRouter };
