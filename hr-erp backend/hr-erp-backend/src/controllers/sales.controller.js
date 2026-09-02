/**
 * Sales pipeline controller — thin HTTP wrapper around sales.service.
 * Scope, validation and the accept-materialisation all live in the service.
 */
const svc = require('../services/sales.service');
const { logger } = require('../utils/logger');

const handle = (fn, label, created = false) => async (req, res) => {
  try {
    const data = await fn(req, res);
    res.status(created ? 201 : 200).json({ success: true, data });
  } catch (err) {
    if (err instanceof svc.SalesError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error(`[sales.${label}]`, err);
    res.status(500).json({ success: false, message: 'Értékesítési művelet hiba' });
  }
};

// leads
const listLeads   = handle((req) => svc.listLeads(req, req.query), 'listLeads');
const createLead  = handle((req) => svc.saveLead(req, null, req.body), 'createLead', true);
const updateLead  = handle((req) => svc.saveLead(req, req.params.id, req.body), 'updateLead');
const convertLead = handle((req) => svc.convertLead(req, req.params.id, req.body), 'convertLead');

// opportunities
const listOpportunities  = handle((req) => svc.listOpportunities(req, req.query), 'listOpportunities');
const createOpportunity  = handle((req) => svc.saveOpportunity(req, null, req.body), 'createOpportunity', true);
const updateOpportunity  = handle((req) => svc.saveOpportunity(req, req.params.id, req.body), 'updateOpportunity');
const board              = handle((req) => svc.pipelineBoard(req), 'board');

// quotes
const listQuotes   = handle((req) => svc.listQuotes(req, req.query), 'listQuotes');
const getQuote     = handle((req) => svc.getQuote(req, req.params.id), 'getQuote');
const createQuote  = handle((req) => svc.saveQuote(req, null, req.body), 'createQuote', true);
const updateQuote  = handle((req) => svc.saveQuote(req, req.params.id, req.body), 'updateQuote');
const sendQuote    = handle((req) => svc.sendQuote(req, req.params.id, req.body), 'sendQuote');
const acceptQuote  = handle((req) => svc.acceptQuote(req, req.params.id, req.body), 'acceptQuote');
const rejectQuote  = handle((req) => svc.rejectQuote(req, req.params.id, req.body), 'rejectQuote');
const shareQuote   = handle((req) => svc.shareQuote(req, req.params.id, req.body), 'shareQuote', true);
const revokeShare  = handle((req) => svc.revokeQuoteShare(req, req.params.id), 'revokeShare');

/** Public, token-only. Expiry and revocation are checked in the service. */
const publicQuote = async (req, res) => {
  try {
    const q = await svc.publicQuoteByToken(req.params.token);
    if (!q) return res.status(404).json({ success: false, message: 'Az ajánlat linkje lejárt vagy visszavonásra került.' });
    res.json({ success: true, data: q });
  } catch (err) {
    logger.error('[sales.publicQuote]', err);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
};

module.exports = {
  listLeads, createLead, updateLead, convertLead,
  listOpportunities, createOpportunity, updateOpportunity, board,
  listQuotes, getQuote, createQuote, updateQuote,
  sendQuote, acceptQuote, rejectQuote, shareQuote, revokeShare,
  publicQuote,
};
