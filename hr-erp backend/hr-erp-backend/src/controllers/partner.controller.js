/**
 * Partner controller — thin HTTP wrapper around partner.service.
 * Scope + validation live in the service; this only maps errors to status codes.
 */
const svc = require('../services/partner.service');
const { logger } = require('../utils/logger');

const handle = (fn, label) => async (req, res) => {
  try {
    const data = await fn(req, res);
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof svc.PartnerError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error(`[partner.${label}]`, err);
    res.status(500).json({ success: false, message: 'Partner művelet hiba' });
  }
};

// contacts
const listContacts  = handle((req) => svc.listContacts(req, req.query), 'listContacts');
const createContact = handle(async (req, res) => { res.status(201); return svc.saveContact(req, null, req.body); }, 'createContact');
const updateContact = handle((req) => svc.saveContact(req, req.params.id, req.body), 'updateContact');
const deleteContact = handle((req) => svc.deleteContact(req, req.params.id), 'deleteContact');

// contracts
const listContracts  = handle((req) => svc.listContracts(req, req.query), 'listContracts');
const getContract    = handle((req) => svc.getContract(req, req.params.id), 'getContract');
const createContract = handle(async (req, res) => { res.status(201); return svc.saveContract(req, null, req.body); }, 'createContract');
const updateContract = handle((req) => svc.saveContract(req, req.params.id, req.body), 'updateContract');
const deleteContract = handle((req) => svc.deleteContract(req, req.params.id), 'deleteContract');

module.exports = {
  listContacts, createContact, updateContact, deleteContact,
  listContracts, getContract, createContract, updateContract, deleteContract,
};
