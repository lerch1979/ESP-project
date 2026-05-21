/**
 * Two routers exposed:
 *   • admin        — auth + permission gated, mounted at /api/v1/accountant-links
 *   • publicRouter — NO auth, mounted at /public/accountant; relies on token in URL
 *
 * Public endpoints get an express-rate-limit at 30 req/min keyed by the
 * token param. That throttles brute-force scanning AND scrape abuse from
 * a single (leaked) link.
 */

const express = require('express');
const ctrl = require('../controllers/accountantShare.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// ─── Admin (auth) ───────────────────────────────────────────────────
const admin = express.Router();
admin.use(authenticateToken);
admin.get('/',       checkPermission('settings.view'), ctrl.list);
admin.post('/',      checkPermission('settings.edit'), ctrl.create);
admin.delete('/:id', checkPermission('settings.edit'), ctrl.revoke);

// ─── Public (no auth, rate-limited per token) ───────────────────────
const publicRouter = express.Router();

let publicLimiter;
if (process.env.NODE_ENV === 'test') {
  publicLimiter = (req, res, next) => next();
} else {
  const rateLimit = require('express-rate-limit');
  publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30, // 30 req / min per token
    keyGenerator: (req) => `accountant-share:${req.params.token || 'unknown'}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Túl sok kérés erre a linkre. Kérjük várjon egy percet.',
  });
}

publicRouter.get('/:token',                              publicLimiter, ctrl.publicPage);
publicRouter.get('/:token/download-all',                 publicLimiter, ctrl.publicDownloadAll);
publicRouter.get('/:token/file/:expense_id/:file_id',    publicLimiter, ctrl.publicFile);

module.exports = { admin, publicRouter };
