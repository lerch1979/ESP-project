/**
 * Sales pipeline routes.
 *
 *   • admin        — ${API_PREFIX}/sales, permission-gated
 *   • publicRouter — /public/quote, NO auth; the share token is the authorisation
 *
 * Gated on `settings.edit` for now — the same audience as the rest of the partner and
 * billing surface. The dedicated `sales.*` permission namespace ships with the external
 * agent role in Phase 4; these paths are deliberately NOT in the module-scope allow-list
 * (middleware/moduleScope.js) until then, so an external role added later reaches them
 * only when someone opts them in explicitly.
 */
const express = require('express');
const ctrl = require('../controllers/sales.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const admin = express.Router();
admin.use(authenticateToken);
const gate = checkPermission('settings.edit');

admin.get('/leads',                gate, ctrl.listLeads);
admin.post('/leads',               gate, ctrl.createLead);
admin.put('/leads/:id',            gate, ctrl.updateLead);
admin.post('/leads/:id/convert',   gate, ctrl.convertLead);

admin.get('/board',                gate, ctrl.board);
admin.get('/opportunities',        gate, ctrl.listOpportunities);
admin.post('/opportunities',       gate, ctrl.createOpportunity);
admin.put('/opportunities/:id',    gate, ctrl.updateOpportunity);

admin.get('/quotes',               gate, ctrl.listQuotes);
admin.post('/quotes',              gate, ctrl.createQuote);
admin.get('/quotes/:id',           gate, ctrl.getQuote);
admin.put('/quotes/:id',           gate, ctrl.updateQuote);
admin.post('/quotes/:id/send',     gate, ctrl.sendQuote);
// Accept writes a partner_contracts row AND client_night_rates rows in one transaction.
admin.post('/quotes/:id/accept',   gate, ctrl.acceptQuote);
admin.post('/quotes/:id/reject',   gate, ctrl.rejectQuote);
admin.post('/quotes/:id/share',    gate, ctrl.shareQuote);
admin.delete('/quotes/:id/share',  gate, ctrl.revokeShare);

const publicRouter = express.Router();
publicRouter.get('/:token', ctrl.publicQuote);

module.exports = { admin, publicRouter };
