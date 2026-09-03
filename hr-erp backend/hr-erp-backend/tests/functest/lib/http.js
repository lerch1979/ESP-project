/**
 * Real HTTP surface for the permission scenarios.
 *
 * The existing `residentLeakGuards.test.js` mocks auth, the DB and the services —
 * that proves the middleware is WIRED, not that a real login is actually blocked.
 * Here we boot the REAL express app against the sandbox DB and call it with REAL
 * JWTs, so `authenticateToken` does its real user lookup, `getUserPermissions`
 * runs the real role→permission SQL, and every controller runs its real query.
 *
 * NODE_ENV=test only prevents `server.js` from calling app.listen() (see its
 * bottom guard) — supertest binds an ephemeral port instead. Nothing is mocked.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const jwt = require('jsonwebtoken');
const request = require('supertest');

let _app = null;
function app() {
  if (!_app) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('functest/http: NODE_ENV must be "test" before requiring server.js (else it listens)');
    }
    _app = require('../../../src/server');
  }
  return _app;
}

const SECRET = () => process.env.JWT_SECRET || 'functest-secret';

/** A real, signed session token for a real users row. */
function tokenFor(userId) {
  return jwt.sign({ userId }, SECRET(), { expiresIn: '2h' });
}

/**
 * @param {string} method  get|post|put|patch|delete
 * @param {string} p       path under /api/v1 (leading slash)
 * @param {{token?: string, body?: any, query?: object}} opts
 */
async function call(method, p, { token, body, query } = {}) {
  let req = request(app())[method](`/api/v1${p}`);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (query) req = req.query(query);
  if (body !== undefined) req = req.send(body);
  const res = await req;
  return pack(res);
}

/**
 * Normalise a supertest response.
 *
 * Binary endpoints (PDF, xlsx) put nothing useful in `res.text` — supertest only fills
 * it for text-ish content types — so a scenario checking a downloaded document sees an
 * empty string and concludes the endpoint is broken. Expose the headers and, for
 * non-JSON responses, the raw Buffer.
 */
function pack(res) {
  const type = res.headers['content-type'] || '';
  const binary = !/json|text|html/i.test(type);
  return {
    status: res.status,
    body: res.body,
    text: res.text,
    headers: res.headers,
    contentType: type,
    buffer: binary && Buffer.isBuffer(res.body) ? res.body : null,
  };
}

/**
 * Un-prefixed request, for routes mounted OUTSIDE ${API_PREFIX} — the public,
 * token-authorised surfaces (/public/quote, /public/settlement, /public/accountant).
 * `call()` hardcodes /api/v1, which silently 404s those and made them look broken.
 */
async function raw(method, p, { token, body, query } = {}) {
  let req = request(app())[method](p);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (query) req = req.query(query);
  if (body !== undefined) req = req.send(body);
  const res = await req;
  return pack(res);
}
const rawGet = (p, o) => raw('get', p, o);

const get = (p, o) => call('get', p, o);
const post = (p, o) => call('post', p, o);
const put = (p, o) => call('put', p, o);
const del = (p, o) => call('delete', p, o);
const patch = (p, o) => call('patch', p, o);

/**
 * Pull every row-ish object out of an arbitrary API envelope so isolation
 * scenarios can scan for foreign ids without knowing each endpoint's shape.
 */
function rowsOf(body) {
  if (!body) return [];
  const d = body.data !== undefined ? body.data : body;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const k of ['items', 'rows', 'results', 'employees', 'accommodations', 'documents', 'tickets', 'records', 'drafts', 'timesheets', 'compensations', 'expenses', 'invoices', 'by_accommodation']) {
      if (Array.isArray(d[k])) return d[k];
    }
    // a single object row
    if (d.id) return [d];
  }
  return [];
}

/** Does any returned row belong to a foreign tenant / foreign entity id? */
function leaks(body, foreignIds) {
  const set = new Set(foreignIds.filter(Boolean).map(String));
  const hay = JSON.stringify(body || {});
  return [...set].filter((id) => hay.includes(id));
}

/**
 * Multipart upload — the bulk-import endpoints take a real file, so a scenario that
 * tests them has to send one. Without this the import paths were untestable end-to-end,
 * which is how a lossy delete+reimport cycle shipped unnoticed.
 */
async function upload(p, { token, field = 'file', filename = 'import.xlsx', buffer } = {}) {
  let req = request(app()).post(`/api/v1${p}`);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return pack(await req.attach(field, buffer, filename));
}

module.exports = { app, tokenFor, call, get, post, put, del, patch, rowsOf, leaks,
  raw, rawGet, upload,
};
