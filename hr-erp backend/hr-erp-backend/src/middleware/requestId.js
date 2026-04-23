const { randomUUID } = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

const INCOMING_HEADER = 'x-request-id';
const RESPONSE_HEADER = 'X-Request-Id';

// Accept an incoming id only if it looks sane (no header-injection, bounded length).
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function middleware(req, res, next) {
  const incoming = req.get(INCOMING_HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader(RESPONSE_HEADER, id);
  storage.run({ requestId: id }, () => next());
}

function getRequestId() {
  const store = storage.getStore();
  return store ? store.requestId : undefined;
}

module.exports = { middleware, getRequestId };
