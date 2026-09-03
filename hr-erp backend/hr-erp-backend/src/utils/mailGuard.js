/**
 * Outbound mail guard — the one place that decides whether a message may leave the
 * process.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-09-03 the owner received an "FT Havi kihasználtság" report with a real xlsx
 * attached. FT is the FUNCTEST fixture tag. The investigation:
 *
 *   • FUNCTEST's AUTO-01 calls the REAL executeReport(), which calls the REAL sendEmail().
 *   • `emailService` built its nodemailer transport at require-time from SMTP_USER /
 *     SMTP_PASS in the developer's .env — a working Gmail app password.
 *   • sendEmail() had NO environment check of any kind: not NODE_ENV, not the database
 *     name, nothing.
 *   • So every full functest run handed a genuine message to smtp.gmail.com, sent from
 *     the owner's own account. 44 of them over 60 days.
 *
 * Nothing reached a third party, only because the fixture's recipient — admin@sandbox.local
 * — does not resolve, so Gmail bounced every one back to the sender. The isolation that
 * saved us was a DNS accident, not a control.
 *
 * THE REAL LESSON: THE SANDBOX GUARD'S SCOPE WAS THE DATABASE
 * ----------------------------------------------------------
 * tests/functest/lib/guard.js is careful and fail-closed — it checks the env AND the live
 * connection, and nothing runs unless both say "sandbox on localhost". But its subject is
 * the DATABASE. Mail is a second side effect that leaves the machine, and it was never
 * inside that boundary. This module is that boundary.
 *
 * SIX TRANSPORTS, NOT ONE
 * -----------------------
 * emailService, email.service, compensation.service, multilingualEmail.service,
 * agentEmail.service and inspectionNotification.service each build their own
 * nodemailer transport. A check inside one sendEmail() would have left five open doors,
 * so the guard wraps the TRANSPORT: `createGuardedTransport` returns a transport whose
 * sendMail is intercepted. tests/mailGuardCoverage.test.js fails the build if a seventh
 * module ever calls nodemailer.createTransport directly.
 *
 * FAIL-CLOSED, AND IT NEVER THROWS
 * --------------------------------
 * A blocked send resolves with { blocked: true } instead of throwing. That is deliberate:
 * the callers already treat a failed send as a delivery shortfall and record it honestly
 * (the 2026-07-05 "never a silent success" fix). Throwing would turn a blocked test email
 * into a failed report RUN and hide the report output that AUTO-01 exists to check. This
 * way the test suite exercises the real path and lands in exactly the state production is
 * in — SMTP unconfigured, 0/N delivered, shortfall recorded.
 */
const { logger } = require('./logger');

/**
 * Reserved / non-routable TLDs and the RFC 2606 example domains. A test address should
 * never leave the process even when the harness markers are somehow absent.
 */
const RESERVED_SUFFIXES = [
  '.local', '.test', '.invalid', '.example', '.localhost', '.internal',
  'example.com', 'example.net', 'example.org',
];

/** Prefixes the fixtures stamp onto everything they create. */
const FIXTURE_TAG_RE = /(^|\s)(FT|SBX|FUNCTEST)[\s-]/i;

/** Is a test harness running in this process? */
function testHarnessActive() {
  return process.env.NODE_ENV === 'test'
    || !!process.env.JEST_WORKER_ID
    || process.env.FUNCTEST === '1'
    // The functest runner sets NODE_ENV=test, but a scenario that requires a service
    // BEFORE that assignment would slip through; the runner also exports this.
    || !!process.env.FUNCTEST_RUN_ID;
}

/** Does the connected database look like a sandbox / test database? */
function sandboxDatabase() {
  return /sandbox|_test\b|^test_/i.test(process.env.DB_NAME || '');
}

const addressesOf = (to) => {
  if (!to) return [];
  const flat = Array.isArray(to) ? to : String(to).split(',');
  return flat
    .map((a) => (typeof a === 'string' ? a : a?.address || ''))
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
};

const isReservedAddress = (addr) => {
  const domain = addr.split('@')[1] || '';
  return RESERVED_SUFFIXES.some((s) => domain === s.replace(/^\./, '') || domain.endsWith(s));
};

/**
 * Why this message must not be sent — or null if it may be.
 *
 * Order matters only for the message a human reads; any one of these blocks.
 */
function blockReason({ to, subject } = {}) {
  if (String(process.env.MAIL_OUTBOUND_DISABLED || '').toLowerCase() === 'true') {
    return 'MAIL_OUTBOUND_DISABLED=true (explicit kill switch)';
  }

  const harness = testHarnessActive();
  const sandbox = sandboxDatabase();

  // The loudest case: a test harness is running but the database is NOT a sandbox. That
  // means a fixture is pointed at dev or production. Block, and say so at error level —
  // this one should wake somebody up rather than being swallowed as a routine block.
  if (harness && !sandbox) {
    return `TEST HARNESS ACTIVE AGAINST A NON-SANDBOX DATABASE (DB_NAME=${process.env.DB_NAME || 'unset'})`;
  }
  if (harness) return 'test harness active (NODE_ENV=test / jest / functest)';
  if (sandbox) return `sandbox database (DB_NAME=${process.env.DB_NAME})`;

  const addrs = addressesOf(to);
  const reserved = addrs.filter(isReservedAddress);
  if (reserved.length) return `reserved/test recipient domain: ${reserved.join(', ')}`;

  if (FIXTURE_TAG_RE.test(String(subject || ''))) {
    return `fixture tag in subject: "${String(subject).slice(0, 60)}"`;
  }
  if (addrs.some((a) => FIXTURE_TAG_RE.test(a))) return 'fixture tag in recipient address';

  return null;
}

/** The shape a blocked send resolves with. Mirrors nodemailer's success shape enough
 *  that callers reading `.messageId` get undefined rather than crashing. */
const blockedResult = (reason, to, subject) => ({
  blocked: true,
  accepted: [],
  rejected: addressesOf(to),
  messageId: undefined,
  response: `BLOCKED by mailGuard: ${reason}`,
  _guard: { reason, to, subject },
});

/**
 * Wrap a nodemailer transport so every send passes the guard first.
 *
 * @param {object} transport a nodemailer transport (or anything with sendMail)
 * @param {string} label     which module owns it, for the log line
 */
function guardTransport(transport, label) {
  if (!transport || typeof transport.sendMail !== 'function') return transport;
  if (transport.__mailGuarded) return transport;

  const realSendMail = transport.sendMail.bind(transport);

  transport.sendMail = async (message, ...rest) => {
    const reason = blockReason(message || {});
    if (reason) {
      const line = `[mailGuard] BLOCKED (${label}) → ${addressesOf(message?.to).join(', ') || '<no recipient>'} `
        + `· "${String(message?.subject || '').slice(0, 80)}" · ${reason}`;
      // A harness pointed at a real database is an incident, not routine.
      if (/NON-SANDBOX/.test(reason)) logger.error(line); else logger.warn(line);
      return blockedResult(reason, message?.to, message?.subject);
    }
    return realSendMail(message, ...rest);
  };

  transport.__mailGuarded = true;
  return transport;
}

/**
 * Drop-in for nodemailer.createTransport. Every module that sends mail MUST use this
 * instead of calling nodemailer directly — enforced by tests/mailGuardCoverage.test.js.
 */
function createGuardedTransport(options, label = 'unknown') {
  // Required here rather than at module scope so the coverage test can allow exactly one
  // nodemailer require outside the six senders: this one.
  const nodemailer = require('nodemailer');
  return guardTransport(nodemailer.createTransport(options), label);
}

/**
 * True when a transport result came back blocked.
 *
 * Callers MUST check this. A blocked send resolves instead of throwing, so a caller that
 * treats "did not throw" as "delivered" will report a silent success — the exact bug the
 * 2026-07-05 delivery-accounting fix removed. `nodemailer` never sets this field, so the
 * check is safe on a real send.
 */
const wasBlocked = (info) => !!(info && info.blocked);

/** The reason string from a blocked result, for the caller's own error shape. */
const blockedError = (info) => (info && info.response) || 'BLOCKED by mailGuard';

module.exports = {
  createGuardedTransport,
  wasBlocked, blockedError,
  guardTransport,
  blockReason,
  testHarnessActive,
  sandboxDatabase,
  _internals: { RESERVED_SUFFIXES, FIXTURE_TAG_RE, addressesOf, isReservedAddress },
};
