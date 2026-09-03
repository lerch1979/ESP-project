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

const pdfSvc = require('../services/quotePdf.service');

/** Send a rendered quote PDF. Shared by the admin and public routes. */
async function sendQuotePdf(res, q) {
  const buf = await pdfSvc.renderQuotePdf(q, { partner_name: q.partner_name, opportunity_title: q.opportunity_title });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfSvc.quoteFileBase(q, { partner_name: q.partner_name })}.pdf"`);
  res.send(buf);
}

/** Admin PDF — scope-checked first, so it cannot become a way around row visibility. */
const quotePdf = async (req, res) => {
  try {
    await svc.getQuote(req, req.params.id);          // 404s if not visible to this caller
    const q = await svc.quoteForDocument(req.params.id);
    await sendQuotePdf(res, q);
  } catch (err) {
    if (err instanceof svc.SalesError) return res.status(err.status).json({ success: false, message: err.message });
    logger.error('[sales.quotePdf]', err);
    res.status(500).json({ success: false, message: 'Ajánlat PDF hiba' });
  }
};

/** Public PDF by share token — same expiry/revocation gate as the JSON view. */
const publicQuotePdf = async (req, res) => {
  try {
    const pub = await svc.publicQuoteByToken(req.params.token);
    if (!pub) return res.status(404).json({ success: false, message: 'Az ajánlat linkje lejárt vagy visszavonásra került.' });
    const q = await svc.quoteForDocument(pub.id);
    await sendQuotePdf(res, q);
  } catch (err) {
    logger.error('[sales.publicQuotePdf]', err);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
};

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
  publicQuote, quotePdf, publicQuotePdf,
};
